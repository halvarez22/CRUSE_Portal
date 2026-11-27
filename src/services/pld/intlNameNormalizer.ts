/**
 * NORMALIZADOR Y VALIDADOR DE NOMBRES INTERNACIONALES ZERO-PII (UIF / ONU / OFAC / SAT)
 *
 * Módulo hoja puro (0 imports internos — Regla 3 Anti-God-Object).
 * Acepta caracteres internacionales legítimos de listas sancionatorias (’ ‘ ´ – — \u00AD,
 * diacríticos latinos NFD, :, #, | interno) manteniendo defensas estrictas contra:
 *   1) Inyección de fórmulas CSV (OWASP CSV Injection: =, @, +FUNC(, |CMD, etc.)
 *   2) Fuga de CURP, RFC (incluso corruptos con : o #) o hashes hex (32-64) en columna de nombre
 *   3) Entradas vacías, puramente numéricas o simbólicas sin contenido nominal
 *
 * @implements CRUSE-APO-2026-080
 */

const STRICT_CURP_REGEX = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/;
const STRICT_RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}(?:[A-Z\d]{3})?$/;
const EMBEDDED_CURP_REGEX = /\b[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d\b/;
const EMBEDDED_RFC_REGEX = /\b[A-Z&]{3,4}\d{6}[A-Z\d]{3}\b/;
const EMBEDDED_HEX_HASH_REGEX = /\b[A-F0-9]{32,64}\b/;
const CSV_INJECTION_REGEX =
  /^[=@\t\r|]|^[+-]\s*[A-Z0-9_]+\s*\(|\|\s*(?:CMD|POWERSHELL|SH|BASH|EXEC)\b/i;

export const INTL_LEGAL_NAME_REGEX = /^[A-Z0-9\s.,&()/'"+:#|-]+$/;

export interface InternationalNameValidationResult {
  readonly isValid: boolean;
  readonly blindIndexKey: string;
}

export function sanitizeInternationalNameForValidation(rawName: string): string {
  return String(rawName ?? '')
    .replace(/\u00AD/g, '')                 // Soft hyphen invisible (U+00AD)
    .replace(/[\u2018\u2019\u00B4]/g, "'") // Apóstrofes tipográficos y acento agudo (’ ‘ ´) -> '
    .replace(/[\u2013\u2014]/g, '-')       // En-dash / Em-dash (– —) -> -
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')       // Diacríticos latinos (Á,É,Í,Ó,Ú,Ü,Ñ,Ç,È,Ì,Ï,Ô,Ò...)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateInternationalLegalName(
  rawName: string,
  normalizedAlphaName: string
): InternationalNameValidationResult {
  const trimmed = String(rawName ?? '').trim();
  if (trimmed.length < 2) {
    return { isValid: false, blindIndexKey: '' };
  }

  const sanitized = sanitizeInternationalNameForValidation(trimmed);
  if (sanitized.length < 2) {
    return { isValid: false, blindIndexKey: '' };
  }

  // Capa 1: Anti-CSV-Injection (OWASP)
  if (CSV_INJECTION_REGEX.test(trimmed) || CSV_INJECTION_REGEX.test(sanitized)) {
    return { isValid: false, blindIndexKey: '' };
  }

  // Capa 2: Anti-Leakage Zero-PII (rechaza CURP, RFC incluso corrupto con :/#, o hash hex 32-64)
  const collapsedAlnum = sanitized.replace(/[^A-Z0-9&]/g, '');
  if (
    STRICT_CURP_REGEX.test(collapsedAlnum) ||
    EMBEDDED_CURP_REGEX.test(sanitized) ||
    STRICT_RFC_REGEX.test(collapsedAlnum) ||
    EMBEDDED_RFC_REGEX.test(sanitized) ||
    /^[A-F0-9]{32,64}$/.test(collapsedAlnum) ||
    EMBEDDED_HEX_HASH_REGEX.test(sanitized)
  ) {
    return { isValid: false, blindIndexKey: '' };
  }

  // Capa 3: Caracteres permitidos tras normalización Unicode/NFD
  if (!INTL_LEGAL_NAME_REGEX.test(sanitized)) {
    return { isValid: false, blindIndexKey: '' };
  }

  // Capa 4: Mínimo nominal (preserva 100% normalizedAlphaName para nombres estándar;
  // fallback alfanumérico controlado solo para entidades cortas con >=1 letra y >=1 dígito ej. M19 / 3M)
  if (normalizedAlphaName.length >= 2) {
    return { isValid: true, blindIndexKey: normalizedAlphaName };
  }

  const alnumNormalized = sanitized.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalizedAlphaName.length === 1 && /\d/.test(sanitized) && alnumNormalized.length >= 2) {
    return { isValid: true, blindIndexKey: alnumNormalized };
  }

  return { isValid: false, blindIndexKey: '' };
}
