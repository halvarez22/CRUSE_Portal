/**
 * PARSER INTELIGENTE AGNÓSTICO AL LAYOUT, VALIDADOR ZERO-PII Y GENERADOR DE ACTA CNBV/UIF
 *
 * @implements CRUSE-APO-2026-027 (Directrices 3 y 4)
 * @implements CRUSE-APO-2026-056 (Guardrails Forenses 1, 2, 3, 4, 5, 6 y 8)
 */

import crypto from 'crypto';
import {
  PldIdentifierType,
  PldListType,
  PldRiskLevel,
} from '../../types';
import {
  CanonicalPldColumnRole,
  PldColumnMappingOverride,
  SmartPldFileAnalysisResult,
  ZeroPiiStructuralPromptPayload,
} from '../../types/pldSmartIngestion';
import { computeBlindIndex } from '../crypto/cryptoService';
import { getServerEnv } from '../../config/serverEnv';
import {
  COMPANY_INFO,
  PLD_EMPTY_ID_PLACEHOLDERS,
  PLD_SAT_69B_CLEARED_KEYWORDS,
} from '../../data/cruseData';
import {
  discoverTableStructure,
  inferPldColumnsHybridZeroPii,
  normalizeHeaderToken,
} from '../ai/pldSmartColumnInferer';
import {
  assembleSplitPersonName,
  extractUifLpbEmbeddedMetadata,
  shouldUseUifLpbExtractor,
} from './uifLpbCommentExtractor';

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
  canonicalPayloadHash: string;
  delimiter: ',' | ';' | '\t' | '|';
  entries: ValidatedPldRiskRow[];
  analysis: SmartPldFileAnalysisResult;
}

export interface ParsePldSmartOptions {
  readonly originalFileSha256?: string;
  readonly fileExtensionHint?: string;
  readonly columnMappingOverride?: PldColumnMappingOverride;
  readonly enableGroqSemanticAssist?: boolean;
  readonly allowPartialValidRowsInPreview?: boolean;
  readonly onPromptInspectedAuditHook?: (
    serializedPrompt: string,
    payload: ZeroPiiStructuralPromptPayload
  ) => void;
}

export const MAX_PLD_WATCHLIST_ROWS = 25_000;
export const MAX_PLD_WATCHLIST_TEXT_BYTES = 5 * 1024 * 1024;

const STRICT_CURP_REGEX = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/;
const STRICT_RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}(?:[A-Z\d]{3})?$/;
const GENERIC_RFC_SET = new Set(['XAXX010101000', 'XEXX010101000', 'XXXX010101000']);
const EMPTY_ID_SET = new Set<string>(PLD_EMPTY_ID_PLACEHOLDERS);
const LEGAL_NAME_REGEX = /^[A-Z0-9ÑÁÉÍÓÚÜ\s.,&()/'"+-]+$/;
const FOOTER_NOISE_REGEX = /^(?:TOTAL|SUBTOTAL|FIN DE LISTA|FIN DEL REPORTE|---+|\*\*\*+)$/;

const VALID_LIST_TYPES: ReadonlySet<PldListType> = new Set<PldListType>([
  'SAT_69B_DEFINITIVO',
  'SAT_69B_PRESUNTO',
  'UIF_PERSONAS_BLOQUEADAS',
  'UN_CONSOLIDATED_SANCTIONS',
  'OFAC_SDN',
  'PEP_NACIONAL',
  'GAFI_HIGH_RISK_JURISDICTIONS',
  'SHCP_REFIPRES_TAX_HAVENS',
]);

export function computeRawPldFileSha256(rawContent: string | Buffer | Uint8Array): string {
  const hash = crypto.createHash('sha256');
  if (typeof rawContent === 'string') {
    hash.update(rawContent, 'utf8');
  } else {
    hash.update(rawContent);
  }
  return hash.digest('hex');
}

/**
 * Guardrail 4 (CRUSE-APO-2026-056): Normalización canónica de nombres para Blind Index:
 * NFD -> eliminar diacríticos -> UPPERCASE -> eliminar no alfabéticos -> colapsar espacios múltiples.
 */
export function normalizePldNameForBlindIndex(rawName: string): string {
  return String(rawName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (cleaned.length < 5) {
    return idType === 'ISO_PAIS' && cleaned.length === 2 ? cleaned : '****';
  }
  if (idType === 'CURP' && cleaned.length >= 18) {
    return `${cleaned.slice(0, 4)}${'*'.repeat(12)}${cleaned.slice(-2)}`;
  }
  if (idType === 'RFC' && cleaned.length >= 10) {
    return `${cleaned.slice(0, 4)}${'*'.repeat(Math.max(4, cleaned.length - 6))}${cleaned.slice(-2)}`;
  }
  return maskPldSubjectName(rawId);
}

export function resolveRiskLevelForList(listType: PldListType): PldRiskLevel {
  switch (listType) {
    case 'SAT_69B_DEFINITIVO':
    case 'UIF_PERSONAS_BLOQUEADAS':
    case 'UN_CONSOLIDATED_SANCTIONS':
    case 'OFAC_SDN':
    case 'GAFI_HIGH_RISK_JURISDICTIONS':
      return 'CRITICAL_BLOCK';
    case 'SAT_69B_PRESUNTO':
    case 'PEP_NACIONAL':
    case 'SHCP_REFIPRES_TAX_HAVENS':
      return 'HIGH_EDD_REQUIRED';
  }
}

function maskSampleForRole(rawSample: string, role: CanonicalPldColumnRole): string {
  const clean = String(rawSample ?? '').trim();
  if (!clean) return '—';
  if (role === 'CURP') return maskPldIdentifierImmediate(clean.replace(/[\s-]+/g, ''), 'CURP');
  if (role === 'RFC') return maskPldIdentifierImmediate(clean.replace(/[\s-]+/g, ''), 'RFC');
  if (
    role === 'FULL_NAME' ||
    role === 'FIRST_NAME' ||
    role === 'PATERNAL_SURNAME' ||
    role === 'MATERNAL_SURNAME' ||
    role === 'CORPORATE_NAME'
  ) {
    return maskPldSubjectName(clean);
  }
  if (role === 'OFFICIAL_REF' || role === 'PUBLICATION_DATE' || role === 'SAT_69B_STATUS' || role === 'LIST_TYPE') {
    return clean.slice(0, 28);
  }
  return maskPldSubjectName(clean);
}

function normalizePublicationDate(raw: string, fallbackIso: string): string {
  const clean = String(raw ?? '').trim();
  if (!clean) return fallbackIso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(clean);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^(?:3[5-9]\d{3}|[45]\d{4})$/.test(clean)) {
    const serial = parseInt(clean, 10);
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return clean.slice(0, 20);
}

/**
 * Parsea, infiere columnas y valida cualquier archivo tabular PLD/FT garantizando Zero-PII absoluto.
 */
export async function parseAndValidatePldCsvZeroPii(
  csvContent: string,
  defaultListType: PldListType = 'SAT_69B_DEFINITIVO',
  defaultOfficialRef: string = 'DOF-SAT-69B-2026',
  options?: ParsePldSmartOptions
): Promise<ParsedPldManifestResult> {
  if (Buffer.byteLength(csvContent, 'utf8') > MAX_PLD_WATCHLIST_TEXT_BYTES) {
    throw new Error('El archivo excede el límite máximo permitido de 5 MB por lote.');
  }

  const canonicalPayloadHash = computeRawPldFileSha256(csvContent);
  const sourceFileHash =
    options?.originalFileSha256 && /^[a-f0-9]{64}$/i.test(options.originalFileSha256)
      ? options.originalFileSha256.toLowerCase()
      : canonicalPayloadHash;

  let content = csvContent;
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('El archivo de lista de riesgo PLD/FT está vacío.');
  }
  if (lines.length > MAX_PLD_WATCHLIST_ROWS + 30) {
    throw new Error(`El archivo excede el máximo de ${MAX_PLD_WATCHLIST_ROWS} filas por lote.`);
  }

  const structure = discoverTableStructure(lines);
  const inferred = await inferPldColumnsHybridZeroPii({
    structure,
    fileExtensionHint: options?.fileExtensionHint,
    columnMappingOverride: options?.columnMappingOverride,
    enableGroqSemanticAssist: options?.enableGroqSemanticAssist,
    maskSampleCallback: maskSampleForRole,
    onPromptInspectedAuditHook: options?.onPromptInspectedAuditHook,
  });

  const roleIndices = (target: CanonicalPldColumnRole): number[] =>
    inferred.columns.filter((c) => c.assignedRole === target).map((c) => c.columnIndex);

  const curpCols = roleIndices('CURP');
  const rfcCols = roleIndices('RFC');
  const genIdCols = roleIndices('GENERIC_ID');
  const fullNameCols = roleIndices('FULL_NAME');
  const corpCols = roleIndices('CORPORATE_NAME');
  const firstNameCols = roleIndices('FIRST_NAME');
  const patCols = roleIndices('PATERNAL_SURNAME');
  const matCols = roleIndices('MATERNAL_SURNAME');
  const listCols = roleIndices('LIST_TYPE');
  const refCols = roleIndices('OFFICIAL_REF');
  const dateCols = roleIndices('PUBLICATION_DATE');
  const satStatusCols = roleIndices('SAT_69B_STATUS');

  const hasAnyIdentityColumn =
    curpCols.length > 0 ||
    rfcCols.length > 0 ||
    genIdCols.length > 0 ||
    fullNameCols.length > 0 ||
    corpCols.length > 0 ||
    firstNameCols.length > 0 ||
    patCols.length > 0;

  if (!hasAnyIdentityColumn) {
    const detectedLabels = inferred.columns.slice(0, 6).map((c) => c.rawHeaderLabel).join(', ');
    throw new Error(
      `No se detectaron columnas con patrones válidos de CURP, RFC o Nombre/Razón Social. Columnas inspeccionadas: ${detectedLabels}`
    );
  }

  const env = getServerEnv();
  const errors: string[] = [];
  const deduped = new Map<string, ValidatedPldRiskRow>();
  const previewRows: SmartPldFileAnalysisResult['maskedPreviewRows'][number][] = [];
  const todayIso = new Date().toISOString().slice(0, 10);

  let curpCount = 0;
  let rfcCount = 0;
  let nameOnlyCount = 0;
  let isoCountryCount = 0;
  let excludedCleared69bCount = 0;
  let skippedEmptyOrBannerRowsCount = structure.skippedBannerCount;

  const firstCellOf = (cols: ReadonlyArray<string>, indices: ReadonlyArray<number>): string => {
    for (const idx of indices) {
      const val = String(cols[idx] ?? '').trim();
      if (val.length > 0) return val;
    }
    return '';
  };

  for (let i = 0; i < structure.dataRows.length; i++) {
    const cols = structure.dataRows[i]!;
    const lineNo = (structure.hasHeaderRow ? structure.headerLineIndex + 2 : structure.skippedBannerCount + 1) + i;

    const nonEmptyCells = cols.filter((c) => c.trim().length > 0);
    if (nonEmptyCells.length === 0) {
      skippedEmptyOrBannerRowsCount++;
      continue;
    }
    const firstNorm = normalizeHeaderToken(nonEmptyCells[0]!);
    if (nonEmptyCells.length === 1 && FOOTER_NOISE_REGEX.test(firstNorm)) {
      skippedEmptyOrBannerRowsCount++;
      continue;
    }

    // Filtro Regulatorio Automático Art. 69-B CFF: excluir Desvirtuados / Sentencia Favorable
    const rawSatStatus = normalizeHeaderToken(firstCellOf(cols, satStatusCols));
    if (rawSatStatus && PLD_SAT_69B_CLEARED_KEYWORDS.some((kw) => rawSatStatus.includes(kw))) {
      excludedCleared69bCount++;
      continue;
    }

    const rawCurpCell = firstCellOf(cols, curpCols).toUpperCase().replace(/[\s-]+/g, '');
    const rawRfcCell = firstCellOf(cols, rfcCols).toUpperCase().replace(/[\s-]+/g, '');
    const rawGenCell = firstCellOf(cols, genIdCols).toUpperCase().replace(/[\s-]+/g, '');

    const useUifLpb = shouldUseUifLpbExtractor(defaultListType, structure.rawHeaders);
    const rawRef = firstCellOf(cols, refCols) || defaultOfficialRef;
    const embeddedMeta = useUifLpb ? extractUifLpbEmbeddedMetadata(rawRef) : null;

    const corpName = firstCellOf(cols, corpCols);
    const fullName = firstCellOf(cols, fullNameCols);
    const splitJoined = useUifLpb
      ? assembleSplitPersonName(cols, firstNameCols, patCols, matCols)
      : [firstCellOf(cols, firstNameCols), firstCellOf(cols, patCols), firstCellOf(cols, matCols)].filter(Boolean).join(' ');

    const assembledRawName = (corpName || fullName || splitJoined).trim().toUpperCase();
    const normalizedAlphaName = normalizePldNameForBlindIndex(assembledRawName);

    const curpCandidate = rawCurpCell && !EMPTY_ID_SET.has(rawCurpCell) ? rawCurpCell : STRICT_CURP_REGEX.test(rawGenCell) ? rawGenCell : embeddedMeta?.extractedCurp ?? '';
    const rfcCandidate = rawRfcCell && !EMPTY_ID_SET.has(rawRfcCell) ? rawRfcCell : STRICT_RFC_REGEX.test(rawGenCell) && !STRICT_CURP_REGEX.test(rawGenCell) ? rawGenCell : embeddedMeta?.extractedRfc ?? '';

    const isoCandidate = /^[A-Z]{2}$/.test(rawGenCell) ? rawGenCell : '';

    // Guardrail 4: Prioridad estricta CURP > RFC > ISO_PAIS > NOMBRE (con fallback limpio cuando ID es N/A o genérico)
    let idType: PldIdentifierType = 'CURP';
    let keyForBlindIndex = '';
    let rawDisplayId = '';
    let isValid = false;

    if (curpCandidate && STRICT_CURP_REGEX.test(curpCandidate)) {
      idType = 'CURP';
      keyForBlindIndex = curpCandidate;
      rawDisplayId = curpCandidate;
      isValid = true;
    } else if (
      rfcCandidate &&
      STRICT_RFC_REGEX.test(rfcCandidate) &&
      !(GENERIC_RFC_SET.has(rfcCandidate) && normalizedAlphaName.length >= 2)
    ) {
      idType = 'RFC';
      keyForBlindIndex = rfcCandidate;
      rawDisplayId = rfcCandidate;
      isValid = true;
    } else if (isoCandidate && normalizedAlphaName.length < 2) {
      idType = 'ISO_PAIS';
      keyForBlindIndex = isoCandidate;
      rawDisplayId = isoCandidate;
      isValid = true;
    } else if (
      assembledRawName.length >= 2 &&
      normalizedAlphaName.length >= 2 &&
      LEGAL_NAME_REGEX.test(assembledRawName)
    ) {
      idType = 'NOMBRE';
      keyForBlindIndex = normalizedAlphaName;
      rawDisplayId = assembledRawName;
      isValid = true;
    }

    const fallbackAuditSeed = keyForBlindIndex || rawCurpCell || rawRfcCell || rawGenCell || `ROW_${lineNo}`;
    const immediateBlindHash = await computeBlindIndex(fallbackAuditSeed, env.blindIndexKey);
    const blindIndexPrefix = immediateBlindHash.slice(0, 12);

    if (!isValid) {
      errors.push(`Fila ${lineNo}: Formato de identificador PLD/FT inválido (Hash: ${blindIndexPrefix})`);
      continue;
    }

    const rawListCandidate = firstCellOf(cols, listCols).toUpperCase();
    let resolvedListType: PldListType = VALID_LIST_TYPES.has(rawListCandidate as PldListType)
      ? (rawListCandidate as PldListType)
      : defaultListType;

    if (!VALID_LIST_TYPES.has(rawListCandidate as PldListType) && rawSatStatus) {
      if (rawSatStatus.includes('PRESUNTO')) resolvedListType = 'SAT_69B_PRESUNTO';
      else if (rawSatStatus.includes('DEFINITIVO')) resolvedListType = 'SAT_69B_DEFINITIVO';
    }

    const rawDate = normalizePublicationDate(
      firstCellOf(cols, dateCols) || embeddedMeta?.extractedDateIso || '',
      todayIso
    );
    const riskLevel = resolveRiskLevelForList(resolvedListType);
    const identifierMasked = maskPldIdentifierImmediate(rawDisplayId, idType);
    const subjectMaskedName = maskPldSubjectName(assembledRawName || rawDisplayId);

    const dedupKey = `${immediateBlindHash}::${resolvedListType}`;
    if (!deduped.has(dedupKey)) {
      if (idType === 'CURP') curpCount++;
      else if (idType === 'RFC') rfcCount++;
      else if (idType === 'ISO_PAIS') isoCountryCount++;
      else nameOnlyCount++;

      deduped.set(dedupKey, {
        listType: resolvedListType,
        identifierType: idType,
        blindIndex: immediateBlindHash,
        blindIndexPrefix,
        identifierMasked,
        subjectMaskedName,
        riskLevel,
        officialReference: rawRef.slice(0, 120),
        publicationDate: rawDate,
        sourceFileHash,
      });

      if (previewRows.length < 5) {
        previewRows.push({
          rowNumber: lineNo,
          resolvedListType,
          identifierType: idType,
          identifierMasked,
          subjectMaskedName,
          riskLevel,
          officialReference: rawRef.slice(0, 120),
          publicationDate: rawDate,
          blindIndexPrefix,
        });
      }
    }
  }

  if (errors.length > 0 && !options?.allowPartialValidRowsInPreview) {
    throw new Error(`Errores de validación Zero-PII en lista PLD/FT:\n${errors.slice(0, 15).join('\n')}`);
  }

  const entries = Array.from(deduped.values());
  const headerMsg = structure.hasHeaderRow
    ? `Encabezado detectado automáticamente en fila ${structure.headerLineIndex + 1}${structure.skippedBannerCount > 0 ? ` (${structure.skippedBannerCount} fila(s) de título omitidas)` : ''}.`
    : 'Archivo sin fila de encabezados: columnas inferidas directamente por contenido criptográfico/estadístico.';
  const clearedMsg =
    excludedCleared69bCount > 0
      ? ` Se excluyeron automáticamente ${excludedCleared69bCount} registro(s) con estatus Desvirtuado/Sentencia Favorable.`
      : '';

  const analysis: SmartPldFileAnalysisResult = {
    sourceFileHash,
    canonicalPayloadHash,
    delimiter: structure.delimiter,
    hasHeaderRow: structure.hasHeaderRow,
    detectedHeaderLineNumber: structure.hasHeaderRow ? structure.headerLineIndex + 1 : 0,
    skippedTopBannerRowsCount: structure.skippedBannerCount,
    inferenceEngineUsed: inferred.inferenceEngineUsed,
    overallConfidencePct: inferred.overallConfidencePct,
    humanFriendlyExplanation: `${headerMsg} Se identificaron ${entries.length} sujeto(s) únicos listos para sellado Zero-PII (CURP: ${curpCount}, RFC: ${rfcCount}, Nombre/Razón Social: ${nameOnlyCount}).${clearedMsg}${inferred.groqSummaryNote ? ` Nota IA: ${inferred.groqSummaryNote}` : ''}`,
    columns: inferred.columns,
    stats: {
      totalDataRowsRead: structure.dataRows.length,
      validUniqueEntriesCount: entries.length,
      curpCount,
      rfcCount,
      nameOnlyCount,
      isoCountryCount,
      excludedCleared69bCount,
      skippedEmptyOrBannerRowsCount,
      invalidRowsCount: errors.length,
    },
    validationWarnings: errors.slice(0, 15),
    maskedPreviewRows: previewRows,
  };

  return {
    sourceFileHash,
    canonicalPayloadHash,
    delimiter: structure.delimiter,
    entries,
    analysis,
  };
}

/**
 * Directriz 4: Construye determinísticamente el batchManifestHash SHA-256 y el Acta Oficial CNBV/UIF.
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
