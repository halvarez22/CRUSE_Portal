import Decimal from 'decimal.js';
import { RawPayrollRow } from './payrollFileParser';
import { computeBlindIndex } from '../crypto/cryptoService';
import { getServerEnv } from '../../config/serverEnv';

export interface PreparedPayrollRow {
  blindCurp: string;
  curpMasked: string;
  name: string;
  amount: Decimal;
  originalLine: number;
}

export async function validateAndPrepareRows(
  rows: RawPayrollRow[]
): Promise<PreparedPayrollRow[]> {
  if (rows.length > 20000) {
    throw new Error('El archivo excede el límite de 20,000 registros.');
  }

  const prepared: PreparedPayrollRow[] = [];
  const curpsSeen = new Set<string>();
  const errors: string[] = [];
  const env = getServerEnv();

  for (const row of rows) {
    // Validar CURP
    if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/.test(row.curp)) {
      errors.push(`Línea ${row.originalLine}: CURP inválida (${row.curp})`);
      continue;
    }

    if (curpsSeen.has(row.curp)) {
      errors.push(`Línea ${row.originalLine}: CURP duplicada en el archivo (${row.curp})`);
      continue;
    }
    curpsSeen.add(row.curp);

    // Validar Importe
    let amount: Decimal;
    try {
      amount = new Decimal(row.amount);
      if (amount.isNegative() || amount.decimalPlaces() > 2) {
        throw new Error();
      }
    } catch {
      errors.push(`Línea ${row.originalLine}: Importe inválido (${row.amount})`);
      continue;
    }

    // Validar Nombre
    const name = row.name.trim().slice(0, 255);
    if (name.length === 0) {
      errors.push(`Línea ${row.originalLine}: Nombre vacío`);
      continue;
    }

    // Enmascarar CURP (primeros 4 y últimos 2, ej. ABCD******12)
    const curpMasked = row.curp.slice(0, 4) + '*'.repeat(12) + row.curp.slice(16);
    
    // Blind Index
    const blindCurp = await computeBlindIndex(row.curp, env.blindIndexKey);

    prepared.push({
      blindCurp,
      curpMasked,
      name,
      amount,
      originalLine: row.originalLine
    });
  }

  if (errors.length > 0) {
    throw new Error(`Errores de validación:\n${errors.join('\n')}`);
  }

  return prepared;
}
