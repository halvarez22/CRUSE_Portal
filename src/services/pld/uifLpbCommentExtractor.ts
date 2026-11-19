/**
 * EXTRACTOR DETERMINISTA PARA LAYOUT OFICIAL UIF-LPB (7 COLUMNAS) — CRUSE-APO-2026-075
 *
 * Guardrails Forenses:
 * - Guardrail 1: Se activa condicionalmente para `UIF_PERSONAS_BLOQUEADAS` o layout 7 columnas UIF-LPB.
 * - Guardrail 2: Ensamblado robusto de nombres multi-columna (filtra null/undefined/vacíos, sin dobles espacios).
 * - Guardrail 3: Extracción estricta Zero-PII de CURP (18), RFC (12-13) y Fecha (ISO YYYY-MM-DD) en "Comentario".
 */

import { PldListType } from '../../types';
import { normalizeHeaderToken } from '../ai/pldSmartColumnInferer';

export interface UifLpbEmbeddedMetadata {
  readonly extractedCurp: string;
  readonly extractedRfc: string;
  readonly extractedDateIso: string;
}

const EMBEDDED_CURP_REGEX = /\b([A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d)\b/i;
const EMBEDDED_RFC_REGEX = /\b(?:RFC\s*[:#-]?\s*)?([A-ZÑ&]{3,4}\d{6}[A-Z\d]{3})\b/i;
const EMBEDDED_DMY_DATE_REGEX = /\b(?:FECHA\s*[:#-]?\s*)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i;

export function isUifLpbSevenColumnLayout(rawHeaders: ReadonlyArray<string>): boolean {
  const normalized = new Set(rawHeaders.map((h) => normalizeHeaderToken(h)));
  return (
    normalized.has('PRIMER NOMBRE') &&
    normalized.has('OTROS NOMBRES') &&
    normalized.has('PRIMER APELLIDO') &&
    normalized.has('COMENTARIO')
  );
}

export function shouldUseUifLpbExtractor(
  listType: PldListType,
  rawHeaders: ReadonlyArray<string>
): boolean {
  return listType === 'UIF_PERSONAS_BLOQUEADAS' || isUifLpbSevenColumnLayout(rawHeaders);
}

export function assembleSplitPersonName(
  cols: ReadonlyArray<string | null | undefined>,
  firstNameCols: ReadonlyArray<number>,
  patCols: ReadonlyArray<number>,
  matCols: ReadonlyArray<number>
): string {
  const orderedIndices = [...firstNameCols, ...patCols, ...matCols];
  const parts: string[] = [];
  for (const idx of orderedIndices) {
    const raw = cols[idx];
    if (raw === null || raw === undefined) continue;
    const cleaned = String(raw).replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) {
      parts.push(cleaned);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function extractUifLpbEmbeddedMetadata(rawComment: string | null | undefined): UifLpbEmbeddedMetadata {
  const text = String(rawComment ?? '').trim();
  if (!text) {
    return { extractedCurp: '', extractedRfc: '', extractedDateIso: '' };
  }

  const curpMatch = EMBEDDED_CURP_REGEX.exec(text);
  const extractedCurp = curpMatch ? curpMatch[1]!.toUpperCase() : '';

  // Evitar falsos positivos de RFC dentro de una CURP ya detectada
  const textWithoutCurp = extractedCurp ? text.replace(new RegExp(extractedCurp, 'gi'), ' ') : text;
  const rfcMatch = EMBEDDED_RFC_REGEX.exec(textWithoutCurp);
  const extractedRfc = rfcMatch ? rfcMatch[1]!.toUpperCase() : '';

  let extractedDateIso = '';
  const dateMatch = EMBEDDED_DMY_DATE_REGEX.exec(text);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      extractedDateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return { extractedCurp, extractedRfc, extractedDateIso };
}
