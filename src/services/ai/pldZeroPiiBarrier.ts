/**
 * BARRERA CRIPTOGRÁFICA ZERO-PII Y ENMASCARADOR SINTÉTICO IRREVERSIBLE PARA LAYOUTS PLD/FT
 *
 * Módulo hoja puro (0 imports internos — DAG acíclico garantizado).
 * @implements CRUSE-APO-2026-056 (Guardrail Forense 2 + Prueba Adicional A)
 * @implements CRUSE-APO-2026-079 (Intersección vacía ∅ entre RFC/CURP/Hex reales y máscaras {A, 9})
 */

import Decimal from 'decimal.js';
import {
  PatternDensityTier,
  ZeroPiiStructuralPromptPayload,
} from '../../types/pldSmartIngestion';

const CURP_CLEAN_REGEX = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/;
const RFC_CLEAN_REGEX = /^[A-ZÑ&]{3,4}\d{6}(?:[A-Z\d]{3})?$/;

export interface ZeroPiiColumnMetricsView {
  readonly columnIndex: number;
  readonly curpMatchRatio: Decimal;
  readonly rfcMatchRatio: Decimal;
  readonly corporateRatio: Decimal;
  readonly personNameRatio: Decimal;
  readonly dateMatchRatio: Decimal;
  readonly officialRefRatio: Decimal;
  readonly sat69bStatusRatio: Decimal;
  readonly structuralMasks: ReadonlyArray<string>;
}

export function toDensityTier(ratio: Decimal): PatternDensityTier {
  if (ratio.greaterThanOrEqualTo(new Decimal('75'))) return 'HIGH';
  if (ratio.greaterThanOrEqualTo(new Decimal('35'))) return 'MEDIUM';
  if (ratio.greaterThan(new Decimal('0'))) return 'LOW';
  return 'NONE';
}

export function buildZeroPiiStructuralPromptPayload(input: {
  fileExtensionHint: string;
  hasHeaderRow: boolean;
  rawHeaders: ReadonlyArray<string>;
  metrics: ReadonlyArray<ZeroPiiColumnMetricsView>;
}): ZeroPiiStructuralPromptPayload {
  return {
    fileExtensionHint: String(input.fileExtensionHint || 'CSV').toUpperCase().slice(0, 10),
    hasDetectedHeaderRow: input.hasHeaderRow,
    totalColumns: input.metrics.length,
    columns: input.metrics.map((m) => ({
      columnIndex: m.columnIndex,
      sanitizedHeaderLabel: sanitizeHeaderForZeroPiiPrompt(
        input.rawHeaders[m.columnIndex] ?? '',
        m.columnIndex,
        input.hasHeaderRow
      ),
      structuralMasks: m.structuralMasks,
      curpPatternTier: toDensityTier(m.curpMatchRatio),
      rfcPatternTier: toDensityTier(m.rfcMatchRatio),
      corporatePatternTier: toDensityTier(m.corporateRatio),
      personNamePatternTier: toDensityTier(m.personNameRatio),
      datePatternTier: toDensityTier(m.dateMatchRatio),
      officialRefPatternTier: toDensityTier(m.officialRefRatio),
      sat69bStatusPatternTier: toDensityTier(m.sat69bStatusRatio),
    })),
  };
}

/**
 * Máscaras sintéticas matemáticamente imposibles en datos reales del SAT/RENAPO
 * (fecha 99-99-99 imposible + alfabeto restringido exclusivamente a {A, 9}):
 * - CURP sintético (pre-2000 `...99` y pos-2000 `...A9`): `/^AAAA999999AAAAAA[A9]9$/`
 * - RFC sintético (PF 13 y PM 12, las 16 homoclaves de `{A, 9}^3`): `/^A{3,4}9{6}[A9]{3}$/`
 * - Cadena sintética larga de 32-64 chars (sin ningún carácter `0-8` ni `b-f`): `/^[A9]{32,64}$/`
 */
const SYNTHETIC_CURP_MASK_REGEX = /^AAAA999999AAAAAA[A9]9$/;
const SYNTHETIC_RFC_MASK_REGEX = /^A{3,4}9{6}[A9]{3}$/;
const SYNTHETIC_LONG_ALNUM_MASK_REGEX = /^[A9]{32,64}$/;

function cleanIdCandidateLocal(val: string): string {
  return String(val ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Guardrail 2 + Prueba Adicional A: Enmascaramiento sintético matemáticamente irreversible (no inyectivo).
 * Toda letra (y `&` intratoken como en `M&O900101XXX`) se colapsa a `A` y todo dígito a `9`.
 * Imposible recuperar iniciales, fechas, homoclaves o distinguir RFCs genéricos de reales.
 */
export function maskCellToIrreversibleSyntheticPattern(raw: string): string {
  const trimmed = String(raw ?? '').trim().slice(0, 40);
  if (!trimmed) return '';
  return trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(?<=[A-Za-zÑñ])&(?=[A-Za-zÑñ])/g, 'A')
    .replace(/[A-Za-zÑñ]/g, 'A')
    .replace(/\d/g, '9')
    .replace(/\s+/g, ' ');
}

/**
 * Sanitiza encabezados de columna antes de incluirlos en el prompt estructural Zero-PII.
 * Si un encabezado coincide con CURP, RFC o número puro, se reemplaza por `COL_<idx>`.
 */
export function sanitizeHeaderForZeroPiiPrompt(
  rawHeader: string,
  colIndex: number,
  hasHeaderRow: boolean
): string {
  if (!hasHeaderRow) return `COL_${colIndex}`;
  const cleanId = cleanIdCandidateLocal(rawHeader);
  if (CURP_CLEAN_REGEX.test(cleanId) || RFC_CLEAN_REGEX.test(cleanId) || /^\d+$/.test(cleanId)) {
    return `COL_${colIndex}`;
  }
  const safe = String(rawHeader ?? '')
    .replace(/[\r\n"'`{};|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
  return safe.length > 0 ? safe : `COL_${colIndex}`;
}

/**
 * Guardrail 2 (CRUSE-APO-2026-056 / 079): Barrera de salida Zero-PII que certifica que el JSON
 * serializado hacia Groq no contenga ningún CURP real, RFC real (incluyendo genéricos XAXX/XEXX
 * o PM con &/Ñ) ni hashes hexadecimales reales de 32-64 caracteres.
 */
export function assertZeroPiiInPromptString(serializedPrompt: string): void {
  const curpCandidates = serializedPrompt.match(/[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d/gi) ?? [];
  for (const token of curpCandidates) {
    if (!SYNTHETIC_CURP_MASK_REGEX.test(token.toUpperCase())) {
      throw new Error('ZERO_PII_BARRIER_TRIGGERED: Patrón CURP no sintético detectado antes de llamada LLM.');
    }
  }

  const rfcCandidates = serializedPrompt.match(/[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}/gi) ?? [];
  for (const token of rfcCandidates) {
    if (!SYNTHETIC_RFC_MASK_REGEX.test(token.toUpperCase())) {
      throw new Error('ZERO_PII_BARRIER_TRIGGERED: Patrón RFC no sintético detectado antes de llamada LLM.');
    }
  }

  const hexCandidates = serializedPrompt.match(/\b[a-f0-9]{32,64}\b/gi) ?? [];
  for (const token of hexCandidates) {
    if (!SYNTHETIC_LONG_ALNUM_MASK_REGEX.test(token.toUpperCase())) {
      throw new Error('ZERO_PII_BARRIER_TRIGGERED: Hash hexadecimal detectado en prompt estructural.');
    }
  }
}
