/**
 * PARSER MULTI-DELIMITADOR, VALIDADOR ZERO-PII Y GENERADOR DE ACTA CNBV/UIF PARA LISTAS PLD/FT
 *
 * @implements CRUSE-APO-2026-027 (Directriz 3: Deduplicación e idempotencia por blind_index + list_type)
 * @implements CRUSE-APO-2026-027 (Directriz 4: Sello SHA-256 inmediato sourceFileHash, Zero-PII en errores y Acta Determinista)
 */

import crypto from 'crypto';
import {
  PldIdentifierType,
  PldListType,
  PldRiskLevel,
} from '../../types';
import { computeBlindIndex } from '../crypto/cryptoService';
import { getServerEnv } from '../../config/serverEnv';
import { COMPANY_INFO } from '../../data/cruseData';

export interface ValidatedPldRiskRow {
  listType: PldListType;
  identifierType: PldIdentifierType;
  blindIndex: string;
  blindIndexPrefix: string;
  identifierMasked: string;
  subjectMaskedName: string;
  riskLevel: PldRiskLevel;
  officialReference: string;
  publicationDate: string;
  sourceFileHash: string;
}

export interface ParsedPldManifestResult {
  sourceFileHash: string;
  delimiter: ',' | ';' | '\t' | '|';
  entries: ValidatedPldRiskRow[];
}

const STRICT_CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/;
const STRICT_RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

const VALID_LIST_TYPES: ReadonlySet<PldListType> = new Set<PldListType>([
  'SAT_69B_DEFINITIVO',
  'SAT_69B_PRESUNTO',
  'UIF_PERSONAS_BLOQUEADAS',
  'OFAC_SDN',
  'PEP_NACIONAL',
]);

/**
 * Calcula inmediatamente el SHA-256 sobre el buffer/string crudo de la lista oficial PLD/FT
 * antes de cualquier transformación o parsing.
 */
export function computeRawPldFileSha256(rawContent: string): string {
  return crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
}

export function maskPldSubjectName(rawName: string): string {
  const parts = String(rawName ?? '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return 'S*** B*******';
  return parts
    .slice(0, 4)
    .map((word) => (word.length <= 1 ? '*' : `${word[0]}${'*'.repeat(Math.min(word.length - 1, 4))}`))
    .join(' ');
}

export function maskPldIdentifierImmediate(rawId: string, idType: PldIdentifierType): string {
  const cleaned = String(rawId ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.length < 5) return '****';
  if (idType === 'CURP' && cleaned.length >= 18) {
    return `${cleaned.slice(0, 4)}${'*'.repeat(12)}${cleaned.slice(-2)}`;
  }
  if (idType === 'RFC' && cleaned.length >= 12) {
    return `${cleaned.slice(0, 4)}${'*'.repeat(cleaned.length - 6)}${cleaned.slice(-2)}`;
  }
  return maskPldSubjectName(rawId);
}

export function resolveRiskLevelForList(listType: PldListType): PldRiskLevel {
  switch (listType) {
    case 'SAT_69B_DEFINITIVO':
    case 'UIF_PERSONAS_BLOQUEADAS':
    case 'OFAC_SDN':
      return 'CRITICAL_BLOCK';
    case 'SAT_69B_PRESUNTO':
    case 'PEP_NACIONAL':
      return 'HIGH_EDD_REQUIRED';
  }
}

function detectDelimiter(headerLine: string): ',' | ';' | '\t' | '|' {
  const candidates: Array<{ sep: ',' | ';' | '\t' | '|'; count: number }> = [
    { sep: ',', count: (headerLine.match(/,/g) || []).length },
    { sep: ';', count: (headerLine.match(/;/g) || []).length },
    { sep: '\t', count: (headerLine.match(/\t/g) || []).length },
    { sep: '|', count: (headerLine.match(/\|/g) || []).length },
  ];
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0] && candidates[0].count > 0 ? candidates[0].sep : ',';
}

function splitDelimitedLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parsea y valida un archivo CSV/TXT de listas de riesgo PLD/FT garantizando
 * Zero-PII absoluto en las rutas de éxito y de error.
 */
export async function parseAndValidatePldCsvZeroPii(
  csvContent: string,
  defaultListType: PldListType = 'SAT_69B_DEFINITIVO',
  defaultOfficialRef: string = 'DOF-SAT-69B-2026'
): Promise<ParsedPldManifestResult> {
  const sourceFileHash = computeRawPldFileSha256(csvContent);
  let content = csvContent;
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('El archivo de lista de riesgo PLD/FT está vacío.');
  }

  const headerLine = lines[0]!;
  const delimiter = detectDelimiter(headerLine);
  const headers = splitDelimitedLine(headerLine, delimiter).map((h) =>
    h.replace(/^["']|["']$/g, '').trim().toUpperCase()
  );

  const colId = headers.findIndex((h) =>
    ['CURP', 'RFC', 'IDENTIFICADOR', 'CLAVE', 'ID_SUJETO', 'CURP_RFC'].includes(h)
  );
  const colName = headers.findIndex((h) =>
    ['NOMBRE', 'CONTRIBUYENTE', 'SUJETO', 'RAZON_SOCIAL', 'PERSONA'].includes(h)
  );
  const colList = headers.findIndex((h) => ['LISTA', 'TIPO_LISTA', 'LIST_TYPE'].includes(h));
  const colRef = headers.findIndex((h) => ['OFICIO', 'REFERENCIA', 'DOF', 'OFFICIAL_REFERENCE'].includes(h));
  const colDate = headers.findIndex((h) => ['FECHA', 'PUBLICACION', 'FECHA_PUBLICACION'].includes(h));

  if (colId === -1 && colName === -1) {
    throw new Error(
      `El layout PLD/FT debe incluir al menos una columna de identificador (CURP, RFC, IDENTIFICADOR) o NOMBRE. Encabezados detectados: ${headers.slice(0, 6).join(', ')}`
    );
  }

  const env = getServerEnv();
  const errors: string[] = [];
  const deduped = new Map<string, ValidatedPldRiskRow>();
  const todayIso = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimitedLine(lines[i]!, delimiter);
    const lineNo = i + 1;
    const rawId = colId !== -1 ? (cols[colId] ?? '').trim().toUpperCase() : '';
    const rawName = colName !== -1 ? (cols[colName] ?? '').trim().toUpperCase() : '';
    const rawListCandidate = colList !== -1 ? (cols[colList] ?? '').trim().toUpperCase() : '';
    const rawRef = colRef !== -1 ? (cols[colRef] ?? '').trim() : defaultOfficialRef;
    const rawDate = colDate !== -1 ? (cols[colDate] ?? '').trim() : todayIso;

    const primaryInput = rawId || rawName || `EMPTY_LINE_${lineNo}`;
    const immediateBlindHash = await computeBlindIndex(primaryInput, env.blindIndexKey);
    const blindIndexPrefix = immediateBlindHash.slice(0, 12);

    let idType: PldIdentifierType;
    let isValid = false;

    if (rawId.length > 0) {
      if (STRICT_CURP_REGEX.test(rawId)) {
        idType = 'CURP';
        isValid = true;
      } else if (STRICT_RFC_REGEX.test(rawId)) {
        idType = 'RFC';
        isValid = true;
      } else {
        idType = 'CURP';
        isValid = false;
      }
    } else if (rawName.length >= 6 && /^[A-ZÑÁÉÍÓÚÜ\s.,&-]+$/.test(rawName)) {
      idType = 'NOMBRE';
      isValid = true;
    } else {
      idType = 'CURP';
      isValid = false;
    }

    // Sanitización temprana Zero-PII: jamás interpolar rawId ni rawName en el mensaje de error
    if (!isValid) {
      errors.push(
        `Fila ${lineNo}: Formato de identificador PLD/FT inválido (Hash: ${blindIndexPrefix})`
      );
      continue;
    }

    const resolvedListType: PldListType = VALID_LIST_TYPES.has(rawListCandidate as PldListType)
      ? (rawListCandidate as PldListType)
      : defaultListType;

    const dedupKey = `${immediateBlindHash}::${resolvedListType}`;
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, {
        listType: resolvedListType,
        identifierType: idType,
        blindIndex: immediateBlindHash,
        blindIndexPrefix,
        identifierMasked: maskPldIdentifierImmediate(rawId || rawName, idType),
        subjectMaskedName: maskPldSubjectName(rawName || rawId),
        riskLevel: resolveRiskLevelForList(resolvedListType),
        officialReference: rawRef || defaultOfficialRef,
        publicationDate: rawDate || todayIso,
        sourceFileHash,
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(`Errores de validación Zero-PII en lista PLD/FT:\n${errors.slice(0, 15).join('\n')}`);
  }

  return {
    sourceFileHash,
    delimiter,
    entries: Array.from(deduped.values()),
  };
}

/**
 * Directriz 4: Construye determinísticamente el batchManifestHash SHA-256 y el Acta Oficial CNBV/UIF
 * sobre el conjunto exacto de datos barridos en la misma transacción atómica.
 */
export function generatePldScreeningCertificateActa(input: {
  batchId: string;
  timestampIso: string;
  officerEmail: string;
  totalExpedientesScreened: number;
  totalInvestorsScreened: number;
  totalRiskEntriesEvaluated: number;
  hitsDetected: Array<{
    entityType: 'EXPEDIENTE' | 'INVESTOR';
    entityId: string;
    blindIndexPrefix: string;
    entityMaskedId: string;
    entityMaskedName: string;
    listType: PldListType;
    riskLevel: PldRiskLevel;
    officialReference: string;
    exposureAmount: string;
  }>;
  newAlertsCreatedCount: number;
}): { batchManifestHash: string; certificateActa: string } {
  const canonicalHits = [...input.hitsDetected]
    .sort((a, b) => `${a.entityId}:${a.listType}`.localeCompare(`${b.entityId}:${b.listType}`))
    .map(
      (h) =>
        `${h.entityType}|${h.entityId}|${h.blindIndexPrefix}|${h.listType}|${h.riskLevel}|${h.exposureAmount}`
    )
    .join('||');

  const canonicalPayload = [
    input.batchId,
    input.timestampIso,
    input.officerEmail,
    String(input.totalExpedientesScreened),
    String(input.totalInvestorsScreened),
    String(input.totalRiskEntriesEvaluated),
    String(input.hitsDetected.length),
    String(input.newAlertsCreatedCount),
    canonicalHits,
  ].join('::');

  const batchManifestHash = crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  const divider = '═'.repeat(80);
  const subDivider = '─'.repeat(80);

  const hitsSection =
    input.hitsDetected.length === 0
      ? '• SIN COINCIDENCIAS (0 HITS): Ningún acreditado ni fondeador figura en listas de riesgo.'
      : input.hitsDetected
          .map(
            (h, idx) =>
              `${idx + 1}. [${h.entityType}] ID: ${h.entityId} | Sujeto: ${h.entityMaskedName} (${h.entityMaskedId}) | BlindPrefix: ${h.blindIndexPrefix} | Lista: ${h.listType} (${h.riskLevel}) | Oficio: ${h.officialReference} | Exposición: $${h.exposureAmount} MXN`
          )
          .join('\n');

  const certificateActa = `${divider}
                 ${COMPANY_INFO.name.toUpperCase()}
           SOCIEDAD FINANCIERA DE OBJETO MÚLTIPLE, ENTIDAD NO REGULADA
         OFICIALÍA DE CUMPLIMIENTO PLD/FT — ART. 95 BIS LGOAAC / CNBV / UIF
${divider}

CERTIFICADO CRIPTOGRÁFICO DE BARRIDO INTEGRAL CONTRA LISTAS DE RIESGO PLD/FT
FOLIO DE LOTE WORM: ${input.batchId}
FECHA Y HORA DE EJECUCIÓN (ISO): ${input.timestampIso}
OFICIAL DE CUMPLIMIENTO: ${input.officerEmail}

${subDivider}
I. UNIVERSO AUDITADO MEDIANTE BLIND INDEXING (HMAC-SHA256 ZERO-PII)
${subDivider}
• Expedientes de Cartera Auditados:            ${input.totalExpedientesScreened} registros
• Fondeadores / Inversionistas Auditados:      ${input.totalInvestorsScreened} registros
• Entradas en Listas PLD/FT Evaluadas:         ${input.totalRiskEntriesEvaluated} índices ciegos
• Coincidencias Totales Detectadas (Hits):     ${input.hitsDetected.length} casos
• Nuevas Alertas Inmutables Generadas:         ${input.newAlertsCreatedCount} alertas

${subDivider}
II. DETALLE DE COINCIDENCIAS DETECTADAS (ZERO-PII)
${subDivider}
${hitsSection}

${subDivider}
III. SELLO CRIPTOGRÁFICO DE INTEGRIDAD WORM (CNBV / UIF / SAT 69-B)
${subDivider}
SELLO MANIFIESTO SHA-256 DEL BARRIDO (pld_screening_batches.batch_manifest_hash):
${batchManifestHash}
${divider}`;

  return { batchManifestHash, certificateActa };
}
