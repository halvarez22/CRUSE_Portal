/**
 * VALIDADORES DETERMINISTAS DE IDENTIDAD MEXICANA (RENAPO CURP MOD-10 / SAT RFC / INE CLAVE ELECTOR)
 * Y CALCULADORA DETERMINISTA DE CONFIANZA OCR (DECIMAL.JS)
 *
 * @implements CRUSE-APO-2026-042 (Fase 2.2 — Reglas de Oro #1 y #3)
 * @implements Regla 6 SQA: Cero Number() ni parseFloat(); aritmética 100% delegada a Decimal.js
 */

import Decimal from 'decimal.js';
import {
  MexicanIdValidationReport,
  OccupationRiskCategory,
  OcrFieldConfidenceBreakdown,
  RawLlmOcrStringsOutput,
} from '../../types/phase2Compliance';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';

/**
 * 1. Regex Estricta CURP Oficial RENAPO (18 posiciones):
 * - Pos 1-4: Iniciales ([A-Z][AEIOUX][A-Z]{2})
 * - Pos 5-10: Fecha AAMMDD
 * - Pos 11: Sexo (H, M, X)
 * - Pos 12-13: Entidad Federativa oficial (32 estados + NE Nacido en el Extranjero)
 * - Pos 14-16: Tres consonantes internas estrictas ([B-DF-HJ-NP-TV-Z]{3})
 * - Pos 17: Diferenciador de homonimia/siglo ([0-9A-Z])
 * - Pos 18: Dígito verificador numérico ([0-9])
 */
export const CURP_STRICT_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HMX](?:AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;

/**
 * 2. Regex Estricta RFC SAT (Persona Física 13 posiciones / Persona Moral 12 posiciones)
 */
export const RFC_FISICA_STRICT_REGEX =
  /^[A-ZÑ&]{4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;

export const RFC_MORAL_STRICT_REGEX =
  /^[A-ZÑ&]{3}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;

/**
 * 3. Regex Estricta Clave de Elector INE (18 posiciones):
 * - 6 consonantes iniciales de apellidos y nombre ([B-DF-HJ-NP-TV-Z]{6})
 * - 6 dígitos de fecha de nacimiento (AAMMDD)
 * - 2 dígitos de clave de estado INE (01 a 32, u 87 para mexicanos en el extranjero)
 * - 1 carácter de sexo (H, M o X)
 * - 3 dígitos de homoclave electoral (\d{3})
 */
export const CLAVE_ELECTOR_STRICT_REGEX =
  /^[B-DF-HJ-NP-TV-Z]{6}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|[12]\d|3[0-2]|87)[HMX]\d{3}$/;

/** Alfabeto oficial RENAPO base-37 para cálculo del dígito verificador Módulo 10 */
const RENAPO_CHARSET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

/** Días máximos por mes (01 a 12) para validación estricta de calendario */
const MAX_DAYS_BY_MONTH: Readonly<Record<string, number>> = {
  '01': 31,
  '02': 29,
  '03': 31,
  '04': 30,
  '05': 31,
  '06': 30,
  '07': 31,
  '08': 31,
  '09': 30,
  '10': 31,
  '11': 30,
  '12': 31,
};

/**
 * Valida que el segmento AAMMDD de una CURP o RFC sea una fecha calendario real.
 */
export function isValidSixDigitDateSegment(yymmdd: string): boolean {
  if (!/^\d{6}$/.test(yymmdd)) return false;
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const maxDay = MAX_DAYS_BY_MONTH[mm];
  if (!maxDay) return false;
  const dayDec = new Decimal(dd);
  return dayDec.greaterThanOrEqualTo(new Decimal('1')) && dayDec.lessThanOrEqualTo(new Decimal(maxDay));
}

/**
 * Calcula el dígito verificador oficial RENAPO (Posición 18, Módulo 10) para los primeros 17 caracteres de una CURP,
 * utilizando exclusivamente Decimal.js.
 */
export function computeCurpMod10CheckDigit(first17Chars: string): string | null {
  const clean17 = first17Chars.trim().toUpperCase();
  if (clean17.length !== 17) return null;

  let weightedSum = new Decimal('0');
  for (let i = 0; i < 17; i++) {
    const ch = clean17[i]!;
    const idx = RENAPO_CHARSET.indexOf(ch);
    if (idx === -1) return null;
    const charVal = new Decimal(idx);
    const weight = new Decimal(18).minus(new Decimal(i));
    weightedSum = weightedSum.plus(charVal.times(weight));
  }

  const mod10 = weightedSum.mod(new Decimal('10'));
  const checkDigit = new Decimal('10').minus(mod10).mod(new Decimal('10'));
  return checkDigit.toFixed(0);
}

/**
 * Verifica una CURP de 18 posiciones contra:
 * 1) Regex estricta RENAPO (iniciales, fecha, sexo, 32 estados + NE, 3 consonantes internas, homonimia).
 * 2) Validez de fecha calendario (mes 01-12 y días por mes).
 * 3) Algoritmo oficial de Dígito Verificador Módulo 10 de RENAPO (Posición 18).
 */
export function verifyCurpCheckDigit(curp: string): boolean {
  const clean = curp.trim().toUpperCase();
  if (!CURP_STRICT_REGEX.test(clean)) return false;
  if (!isValidSixDigitDateSegment(clean.slice(4, 10))) return false;

  const expectedDigit = computeCurpMod10CheckDigit(clean.slice(0, 17));
  if (expectedDigit === null) return false;

  const actualDigit = clean[17]!;
  return expectedDigit === actualDigit;
}

/**
 * Verifica el formato estricto de RFC (Persona Física 13 caracteres o Persona Moral 12 caracteres).
 */
export function verifyRfcFormat(rfc: string): boolean {
  const clean = rfc.trim().toUpperCase();
  if (RFC_FISICA_STRICT_REGEX.test(clean)) {
    return isValidSixDigitDateSegment(clean.slice(4, 10));
  }
  if (RFC_MORAL_STRICT_REGEX.test(clean)) {
    return isValidSixDigitDateSegment(clean.slice(3, 9));
  }
  return false;
}

/**
 * Verifica el formato estricto de la Clave de Elector del INE (18 caracteres).
 */
export function verifyClaveElectorFormat(voterId: string): boolean {
  const clean = voterId.trim().toUpperCase();
  if (!CLAVE_ELECTOR_STRICT_REGEX.test(clean)) return false;
  return isValidSixDigitDateSegment(clean.slice(6, 12));
}

/**
 * Clasifica de forma determinista el texto de ocupación extraído por OCR dentro del catálogo de riesgo CNBV.
 */
export function classifyOccupationCategoryDeterministic(rawOccupation: string): OccupationRiskCategory {
  const upper = rawOccupation.trim().toUpperCase();
  if (!upper) return 'UNSPECIFIED_OR_INFORMAL';

  if (
    upper.includes('DIPUTAD') ||
    upper.includes('SENADOR') ||
    upper.includes('GOBERNADOR') ||
    upper.includes('SECRETARIO DE ESTADO') ||
    upper.includes('ALCALDE') ||
    upper.includes('PRESIDENTE MUNICIPAL') ||
    upper.includes('PEP')
  ) {
    return 'PEP_OR_HIGH_PUBLIC_OFFICIAL';
  }

  if (
    upper.includes('CASINO') ||
    upper.includes('JOYERIA') ||
    upper.includes('BLINDAJE') ||
    upper.includes('CAMBIO DE DIVISAS') ||
    upper.includes('INMOBILIARIA')
  ) {
    return 'HIGH_RISK_CASH_INTENSIVE';
  }

  if (
    upper.includes('MAGISTRAD') ||
    upper.includes('JUEZ') ||
    upper.includes('PODER JUDICIAL') ||
    upper.includes('TRIBUNAL') ||
    upper.includes('ACTUARI')
  ) {
    return 'JUDICIAL_MAGISTRATE_ADMIN';
  }

  if (
    upper.includes('SERVIDOR PUBLICO') ||
    upper.includes('SINDICALIZAD') ||
    upper.includes('DOCENTE') ||
    upper.includes('MAESTR') ||
    upper.includes('ENFERMER') ||
    upper.includes('MEDICO') ||
    upper.includes('GOBIERNO') ||
    upper.includes('STSGECH') ||
    upper.includes('ADMINISTRATIV')
  ) {
    return 'PUBLIC_SERVANT_UNIONIZED';
  }

  return 'UNSPECIFIED_OR_INFORMAL';
}

/**
 * Evalúa todos los campos extraídos por el LLM y calcula de forma 100% determinista con Decimal.js
 * el reporte de validación y el Score de Confianza por campo y global (0.00 a 100.00).
 */
export function evaluateExtractedMetadataDeterministically(raw: RawLlmOcrStringsOutput): {
  idValidation: MexicanIdValidationReport;
  confidence: OcrFieldConfidenceBreakdown;
} {
  const errors: string[] = [];

  const cleanCurp = raw.extracted_curp.trim().toUpperCase();
  const curpFormatValid = CURP_STRICT_REGEX.test(cleanCurp) && isValidSixDigitDateSegment(cleanCurp.slice(4, 10));
  const curpCheckDigitMod10Valid = verifyCurpCheckDigit(cleanCurp);

  if (!curpFormatValid) {
    errors.push('CURP no cumple con la estructura oficial RENAPO de 18 posiciones.');
  } else if (!curpCheckDigitMod10Valid) {
    errors.push('CURP falló la verificación matemática del Dígito Verificador Módulo 10 de RENAPO.');
  }

  const cleanRfc = raw.extracted_rfc.trim().toUpperCase();
  const rfcFormatValid = verifyRfcFormat(cleanRfc);
  if (!rfcFormatValid) {
    errors.push('RFC no cumple con la estructura oficial del SAT (12 o 13 posiciones).');
  }

  const cleanVoterId = raw.extracted_voter_id.trim().toUpperCase();
  const voterIdFormatValid = verifyClaveElectorFormat(cleanVoterId);
  if (!voterIdFormatValid) {
    errors.push('Clave de Elector INE no cumple con las 18 posiciones reglamentarias.');
  }

  const incomeDec = sanitizeDecimalString(raw.extracted_fortnightly_net_income, '0.00');
  const incomeFormatValid = incomeDec.greaterThan(new Decimal('0'));
  if (!incomeFormatValid) {
    errors.push('Ingreso neto quincenal extraído inválido o igual a cero.');
  }

  const fullNameClean = raw.extracted_full_name.trim();
  const addressClean = raw.extracted_address.trim();

  // Puntajes deterministas por campo usando exclusivamente Decimal.js
  const curpScore = curpCheckDigitMod10Valid
    ? new Decimal('99.00')
    : curpFormatValid
      ? new Decimal('65.00')
      : new Decimal('20.00');

  const rfcScore = rfcFormatValid ? new Decimal('98.00') : new Decimal('45.00');
  const voterIdScore = voterIdFormatValid ? new Decimal('98.00') : new Decimal('40.00');
  const fullNameScore = fullNameClean.length >= 8 && fullNameClean.includes(' ')
    ? new Decimal('97.00')
    : new Decimal('45.00');
  const addressScore = addressClean.length >= 12 ? new Decimal('95.00') : new Decimal('50.00');
  const incomeScore = incomeFormatValid ? new Decimal('96.00') : new Decimal('35.00');

  // Ponderación global determinista: CURP (30%), RFC (15%), Clave Elector (15%), Nombre (15%), Domicilio (10%), Ingreso (15%)
  const globalScore = curpScore
    .times(new Decimal('0.30'))
    .plus(rfcScore.times(new Decimal('0.15')))
    .plus(voterIdScore.times(new Decimal('0.15')))
    .plus(fullNameScore.times(new Decimal('0.15')))
    .plus(addressScore.times(new Decimal('0.10')))
    .plus(incomeScore.times(new Decimal('0.15')))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    idValidation: {
      curpFormatValid,
      curpCheckDigitMod10Valid,
      rfcFormatValid,
      voterIdFormatValid,
      incomeFormatValid,
      validationErrors: errors,
    },
    confidence: {
      curpConfidence: curpScore.toFixed(2),
      rfcConfidence: rfcScore.toFixed(2),
      voterIdConfidence: voterIdScore.toFixed(2),
      fullNameConfidence: fullNameScore.toFixed(2),
      addressConfidence: addressScore.toFixed(2),
      incomeConfidence: incomeScore.toFixed(2),
      globalConfidenceScore: globalScore.toFixed(2),
    },
  };
}
