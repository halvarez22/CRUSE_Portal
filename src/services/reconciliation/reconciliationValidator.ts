/**
 * VALIDADOR DETERMINISTA Y CONSOLIDADOR MULTI-CRÉDITO ZERO-PII DE NÓMINA
 *
 * @implements CRUSE-APO-2026-026 (Directriz 2: Consolidación determinista con Decimal.js para múltiples créditos por CURP)
 * @implements CRUSE-APO-2026-026 (Directriz 4: Enmascaramiento inmediato de PII en errores y salida 100% Zero-PII)
 */

import Decimal from 'decimal.js';
import { RawPayrollRow } from './payrollFileParser';
import { computeBlindIndex } from '../crypto/cryptoService';
import { getServerEnv } from '../../config/serverEnv';

export interface PreparedPayrollRow {
  blindCurp: string;
  blindCurpPrefix: string;
  curpMasked: string;
  name: string;
  amount: Decimal;
  originalLine: number;
  contractNumber?: string;
  isSuspensionMarker?: boolean;
  consolidatedLinesCount?: number;
}

const STRICT_CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/;
const MASKED_INSTITUTIONAL_CURP_REGEX = /^[A-Z]{4}\*{4,12}[A-Z\d]{2,4}$/;

/**
 * Directriz 4: Enmascara inmediatamente el nombre del empleado (ej. "JUAN PEREZ LOPEZ" -> "J*** P**** L****")
 * para que ningún nombre completo en texto plano salga del validador ni se almacene en claro.
 */
export function maskPayrollEmployeeName(rawName: string): string {
  const parts = String(rawName ?? '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return 'ACR-ANONIMO';
  return parts
    .slice(0, 4)
    .map((word) => (word.length <= 1 ? '*' : `${word[0]}${'*'.repeat(Math.min(word.length - 1, 4))}`))
    .join(' ');
}

/**
 * Directriz 4: Enmascara una CURP cruda a formato institucional ABCD******12
 */
export function maskPayrollCurpImmediate(rawCurp: string): string {
  const cleaned = String(rawCurp ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.length < 6) return '****';
  return `${cleaned.slice(0, 4)}${'*'.repeat(12)}${cleaned.slice(-2)}`;
}

export async function validateAndPrepareRows(
  rows: RawPayrollRow[]
): Promise<PreparedPayrollRow[]> {
  if (rows.length > 20000) {
    throw new Error('El archivo excede el límite regulatorio de 20,000 registros por lote.');
  }

  const env = getServerEnv();
  const errors: string[] = [];

  // Mapa para consolidar múltiples descuentos de una misma CURP sin contractNumber explícito (Directriz 2)
  const consolidatedByKey = new Map<string, PreparedPayrollRow>();

  for (const row of rows) {
    const normalizedCurp = String(row.curp ?? '').trim().toUpperCase();
    const immediateBlindHash = await computeBlindIndex(
      normalizedCurp || `LINE_${row.originalLine}`,
      env.blindIndexKey
    );
    const blindCurpPrefix = immediateBlindHash.slice(0, 12);

    const contractNormalized = row.contractNumber ? row.contractNumber.trim().toUpperCase() : undefined;
    const isValidFullCurp = STRICT_CURP_REGEX.test(normalizedCurp);
    const isValidContractMaskedCurp =
      Boolean(contractNormalized) && MASKED_INSTITUTIONAL_CURP_REGEX.test(normalizedCurp);

    // Directriz 4: Jamás interpolar la CURP ni el nombre original en texto plano en errores
    if (!isValidFullCurp && !isValidContractMaskedCurp) {
      errors.push(`Fila ${row.originalLine}: Formato de CURP inválido (Hash: ${blindCurpPrefix})`);
      continue;
    }

    let amount: Decimal;
    try {
      amount = new Decimal(row.amount);
      if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
        throw new Error('INVALID_DECIMAL');
      }
    } catch {
      errors.push(`Fila ${row.originalLine}: Importe numérico inválido (Hash: ${blindCurpPrefix})`);
      continue;
    }

    const maskedName = maskPayrollEmployeeName(row.name);
    const curpMasked = isValidFullCurp ? maskPayrollCurpImmediate(normalizedCurp) : normalizedCurp;

    // Clave de agrupación: si trae contractNumber específico, agrupa por (blindCurp + contractNumber);
    // si no trae contractNumber, consolida determinísticamente por blindCurp (Directriz 2).
    const groupKey = contractNormalized
      ? `${immediateBlindHash}::CONTRACT::${contractNormalized}`
      : `${immediateBlindHash}::CONSOLIDATED`;

    const existing = consolidatedByKey.get(groupKey);
    if (existing) {
      existing.amount = existing.amount.plus(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      existing.consolidatedLinesCount = (existing.consolidatedLinesCount ?? 1) + 1;
      if (row.isSuspensionMarker && existing.amount.isZero()) {
        existing.isSuspensionMarker = true;
      }
    } else {
      consolidatedByKey.set(groupKey, {
        blindCurp: immediateBlindHash,
        blindCurpPrefix,
        curpMasked,
        name: maskedName,
        amount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        originalLine: row.originalLine,
        contractNumber: contractNormalized,
        isSuspensionMarker: Boolean(row.isSuspensionMarker),
        consolidatedLinesCount: 1,
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(`Errores de validación Zero-PII:\n${errors.slice(0, 15).join('\n')}`);
  }

  return Array.from(consolidatedByKey.values());
}
