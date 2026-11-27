/**
 * MOTOR INTELIGENTE DE INFERENCIA DE COLUMNAS PLD/FT EN 3 CAPAS (DECIMAL.JS + GROQ ZERO-PII)
 *
 * @implements CRUSE-APO-2026-056 (Guardrails Forenses 2, 3 y 6 + Prueba Adicional A)
 * @implements Regla 5 SSD: Enmascaramiento sintético irreversible Zero-PII antes de cualquier llamada LLM.
 * @implements Regla 6 SQA: Aritmética de tasas y confianza 100% delegada a Decimal.js (cero Number/parseFloat).
 */

import Decimal from 'decimal.js';
import Groq from 'groq-sdk';
import { getServerEnv } from '../../config/serverEnv';
import {
  PLD_EMPTY_ID_PLACEHOLDERS,
  PLD_ENTITY_CATEGORY_VALUES,
  PLD_HEADER_ROLE_SYNONYMS,
  PLD_SAT_69B_CLEARED_KEYWORDS,
} from '../../data/cruseData';
import {
  ALLOWED_PLD_COLUMN_ROLES,
  CanonicalPldColumnRole,
  ColumnDetectionSource,
  InferredColumnProfile,
  PldColumnMappingOverride,
  ZeroPiiStructuralPromptPayload,
} from '../../types/pldSmartIngestion';
import {
  maskCellToIrreversibleSyntheticPattern,
  assertZeroPiiInPromptString,
  buildZeroPiiStructuralPromptPayload,
} from './pldZeroPiiBarrier';

export {
  maskCellToIrreversibleSyntheticPattern,
  assertZeroPiiInPromptString,
  buildZeroPiiStructuralPromptPayload,
} from './pldZeroPiiBarrier';

const CURP_CLEAN_REGEX = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/;
const RFC_CLEAN_REGEX = /^[A-ZÑ&]{3,4}\d{6}(?:[A-Z\d]{3})?$/;
const ISO_ALPHA2_REGEX = /^[A-Z]{2}$/;
const DATE_CELL_REGEX =
  /^(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\d{8}|(?:3[5-9]\d{3}|[45]\d{4})|\d{1,2}\s+DE\s+[A-Z]+\s+(?:DE\s+)?\d{4})$/i;
const OFFICIAL_REF_TOKEN_REGEX = /\b(?:DOF|ACUERDO|OFICIO|UIF|OFAC|LPB|500-\d{2}|SITI|SHCP|SDN|PEP)\b/i;
const CORPORATE_SUFFIX_REGEX =
  /\b(?:S\.?\s*A\.?\s*DE\s*C\.?\s*V\.?|S\.?\s*DE\s*R\.?\s*L\.?|S\.?\s*A\.?\s*P\.?\s*I\.?|S\.?\s*C\.?|A\.?\s*C\.?|SOFOM|LTD|LLC|INC|CORP|HOLDINGS|TRADING)\b/i;
const PERSON_NAME_TOKEN_REGEX = /^[A-ZÑÁÉÍÓÚÜ\s.'-]+$/;
const BANNER_PHRASE_REGEX =
  /^(?:INFORMACION ACTUALIZADA|LISTADO COMPLETO DE CONTRIBUYENTES|ARTICULO 69|LISTA DE PERSONAS BLOQUEADAS|UNIDAD DE INTELIGENCIA FINANCIERA|REPORTE GENERADO|FECHA DE CORTE)/;

const EMPTY_PLACEHOLDER_SET = new Set<string>(PLD_EMPTY_ID_PLACEHOLDERS);
const ENTITY_CATEGORY_SET = new Set<string>(PLD_ENTITY_CATEGORY_VALUES);

export interface ColumnStatisticalMetrics {
  readonly columnIndex: number;
  readonly nonEmptyCount: number;
  readonly curpMatchRatio: Decimal;
  readonly rfcMatchRatio: Decimal;
  readonly isoCountryRatio: Decimal;
  readonly corporateRatio: Decimal;
  readonly personNameRatio: Decimal;
  readonly dateMatchRatio: Decimal;
  readonly officialRefRatio: Decimal;
  readonly sat69bStatusRatio: Decimal;
  readonly entityCategoryRatio: Decimal;
  readonly structuralMasks: ReadonlyArray<string>;
  readonly firstNonEmptyRaw: string;
}

export interface TableStructureDiscovery {
  readonly delimiter: ',' | ';' | '\t' | '|';
  readonly hasHeaderRow: boolean;
  readonly headerLineIndex: number; // -1 cuando no hay encabezado
  readonly skippedBannerCount: number;
  readonly rawHeaders: ReadonlyArray<string>;
  readonly dataRows: ReadonlyArray<ReadonlyArray<string>>;
}

export function normalizeHeaderToken(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitDelimitedLineSafe(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function detectOptimalTableDelimiter(lines: ReadonlyArray<string>): ',' | ';' | '\t' | '|' {
  const sample = lines.slice(0, 25);
  const candidates: ReadonlyArray<',' | ';' | '\t' | '|'> = [',', ';', '\t', '|'];
  let bestSep: ',' | ';' | '\t' | '|' = ',';
  let bestScore = new Decimal('-1');

  for (const sep of candidates) {
    let multiColLines = 0;
    let totalCols = 0;
    for (const line of sample) {
      const cols = splitDelimitedLineSafe(line, sep);
      if (cols.length >= 2) {
        multiColLines++;
        totalCols += cols.length;
      }
    }
    const score = new Decimal(multiColLines).times(new Decimal('100')).plus(new Decimal(totalCols));
    if (score.greaterThan(bestScore) && multiColLines > 0) {
      bestScore = score;
      bestSep = sep;
    }
  }
  return bestSep;
}

function matchHeaderSynonymRole(normalizedCell: string): CanonicalPldColumnRole | null {
  if (!normalizedCell) return null;
  const roleOrder: ReadonlyArray<CanonicalPldColumnRole> = [
    'CURP', 'RFC', 'SAT_69B_STATUS', 'PUBLICATION_DATE', 'PATERNAL_SURNAME', 'MATERNAL_SURNAME',
    'CORPORATE_NAME', 'FULL_NAME', 'FIRST_NAME', 'OFFICIAL_REF',
    'LIST_TYPE', 'GENERIC_ID', 'IGNORE',
  ];
  for (const role of roleOrder) {
    if (PLD_HEADER_ROLE_SYNONYMS[role].some((syn) => normalizedCell === syn)) {
      return role;
    }
  }
  for (const role of roleOrder) {
    if (PLD_HEADER_ROLE_SYNONYMS[role].some((syn) => syn.length >= 6 && normalizedCell.includes(syn))) {
      return role;
    }
  }
  return null;
}

function cleanIdCandidate(val: string): string {
  return String(val ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

function rowContainsRealDataPattern(cells: ReadonlyArray<string>): boolean {
  for (const raw of cells) {
    const cleaned = cleanIdCandidate(raw);
    if (CURP_CLEAN_REGEX.test(cleaned)) return true;
    if (RFC_CLEAN_REGEX.test(cleaned) && !EMPTY_PLACEHOLDER_SET.has(cleaned)) return true;
  }
  return false;
}

/**
 * Descubre el delimitador real, salta banners/títulos superiores (ej. SAT 69-B o SITI)
 * y determina si existe fila de encabezados o si el archivo es headerless.
 */
export function discoverTableStructure(nonEmptyLines: ReadonlyArray<string>): TableStructureDiscovery {
  const delimiter = detectOptimalTableDelimiter(nonEmptyLines);
  const splitRows = nonEmptyLines.map((l) =>
    splitDelimitedLineSafe(l, delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim())
  );

  const maxColsInSample = splitRows
    .slice(0, 25)
    .reduce((acc, r) => Math.max(acc, r.filter((c) => c.length > 0).length), 0);

  let skippedBannerCount = 0;
  const searchLimit = Math.min(splitRows.length, 25);

  for (let idx = 0; idx < searchLimit; idx++) {
    const row = splitRows[idx]!;
    const nonEmptyCells = row.filter((c) => c.length > 0);
    const firstNorm = normalizeHeaderToken(nonEmptyCells[0] ?? '');

    const isSingleCellBanner =
      maxColsInSample >= 2 &&
      nonEmptyCells.length === 1 &&
      !CURP_CLEAN_REGEX.test(cleanIdCandidate(nonEmptyCells[0]!)) &&
      !RFC_CLEAN_REGEX.test(cleanIdCandidate(nonEmptyCells[0]!));

    if (nonEmptyCells.length === 0 || isSingleCellBanner || BANNER_PHRASE_REGEX.test(firstNorm)) {
      skippedBannerCount++;
      continue;
    }

    const headerHits = row.filter((cell) => {
      const role = matchHeaderSynonymRole(normalizeHeaderToken(cell));
      return role !== null && role !== 'IGNORE';
    }).length;

    if (headerHits >= 1 && !rowContainsRealDataPattern(row)) {
      const dataRows = splitRows.slice(idx + 1).filter((r) => r.some((c) => c.length > 0));
      return {
        delimiter,
        hasHeaderRow: true,
        headerLineIndex: idx,
        skippedBannerCount: idx,
        rawHeaders: row,
        dataRows,
      };
    }

    if (rowContainsRealDataPattern(row)) {
      const colCount = Math.max(...splitRows.slice(idx, idx + 15).map((r) => r.length));
      const syntheticHeaders = Array.from({ length: colCount }, (_, cIdx) => `COL_${cIdx}`);
      return {
        delimiter,
        hasHeaderRow: false,
        headerLineIndex: -1,
        skippedBannerCount: idx,
        rawHeaders: syntheticHeaders,
        dataRows: splitRows.slice(idx).filter((r) => r.some((c) => c.length > 0)),
      };
    }

    // Fila con texto desconocido pero sin patrones CURP/RFC: tratar como encabezado candidato si hay datos debajo
    if (idx + 1 < splitRows.length) {
      return {
        delimiter,
        hasHeaderRow: true,
        headerLineIndex: idx,
        skippedBannerCount: idx,
        rawHeaders: row,
        dataRows: splitRows.slice(idx + 1).filter((r) => r.some((c) => c.length > 0)),
      };
    }
  }

  const colCount = splitRows[0]?.length ?? 1;
  return {
    delimiter,
    hasHeaderRow: false,
    headerLineIndex: -1,
    skippedBannerCount,
    rawHeaders: Array.from({ length: colCount }, (_, i) => `COL_${i}`),
    dataRows: splitRows,
  };
}

export function computeColumnStatisticalMetrics(
  colCount: number,
  dataRows: ReadonlyArray<ReadonlyArray<string>>
): ColumnStatisticalMetrics[] {
  const sampleRows = dataRows.slice(0, 120);
  const metrics: ColumnStatisticalMetrics[] = [];

  for (let c = 0; c < colCount; c++) {
    let nonEmpty = 0;
    let curpHits = 0;
    let rfcHits = 0;
    let isoHits = 0;
    let corpHits = 0;
    let personHits = 0;
    let dateHits = 0;
    let refHits = 0;
    let sat69bHits = 0;
    let entityCategoryHits = 0;
    const maskSet = new Set<string>();
    let firstNonEmptyRaw = '';

    for (const row of sampleRows) {
      const raw = String(row[c] ?? '').trim();
      if (!raw) continue;
      const upper = raw.toUpperCase();
      if (EMPTY_PLACEHOLDER_SET.has(upper)) continue;

      nonEmpty++;
      if (!firstNonEmptyRaw) firstNonEmptyRaw = raw;
      if (maskSet.size < 3) {
        const mask = maskCellToIrreversibleSyntheticPattern(raw);
        if (mask) maskSet.add(mask);
      }

      const cleanedId = cleanIdCandidate(upper);
      const normText = normalizeHeaderToken(upper);

      if (CURP_CLEAN_REGEX.test(cleanedId)) curpHits++;
      else if (RFC_CLEAN_REGEX.test(cleanedId)) rfcHits++;
      else if (ISO_ALPHA2_REGEX.test(upper)) isoHits++;

      if (
        normText === 'DEFINITIVO' ||
        normText === 'PRESUNTO' ||
        PLD_SAT_69B_CLEARED_KEYWORDS.some((kw) => normText.includes(kw))
      ) {
        sat69bHits++;
      } else if (ENTITY_CATEGORY_SET.has(normText)) {
        entityCategoryHits++;
      } else if (DATE_CELL_REGEX.test(upper)) {
        dateHits++;
      } else if (OFFICIAL_REF_TOKEN_REGEX.test(upper)) {
        refHits++;
      } else if (CORPORATE_SUFFIX_REGEX.test(upper)) {
        corpHits++;
      } else if (upper.length >= 2 && PERSON_NAME_TOKEN_REGEX.test(upper) && !/^\d+$/.test(upper)) {
        personHits++;
      }
    }

    const ratio = (hits: number): Decimal =>
      nonEmpty === 0
        ? new Decimal('0')
        : new Decimal(hits)
            .dividedBy(new Decimal(nonEmpty))
            .times(new Decimal('100'))
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    metrics.push({
      columnIndex: c,
      nonEmptyCount: nonEmpty,
      curpMatchRatio: ratio(curpHits),
      rfcMatchRatio: ratio(rfcHits),
      isoCountryRatio: ratio(isoHits),
      corporateRatio: ratio(corpHits),
      personNameRatio: ratio(personHits),
      dateMatchRatio: ratio(dateHits),
      officialRefRatio: ratio(refHits),
      sat69bStatusRatio: ratio(sat69bHits),
      entityCategoryRatio: ratio(entityCategoryHits),
      structuralMasks: Array.from(maskSet),
      firstNonEmptyRaw,
    });
  }

  return metrics;
}

async function queryGroqSemanticZeroPiiMapping(
  payload: ZeroPiiStructuralPromptPayload,
  onPromptInspectedAuditHook?: (serializedPrompt: string, payload: ZeroPiiStructuralPromptPayload) => void
): Promise<{ rolesByIndex: Map<number, CanonicalPldColumnRole>; summaryNote?: string } | null> {
  const serializedPayload = JSON.stringify(payload);
  assertZeroPiiInPromptString(serializedPayload);
  if (onPromptInspectedAuditHook) {
    onPromptInspectedAuditHook(serializedPayload, payload);
  }

  const apiKey = getServerEnv().groqApiKey;
  if (!apiKey) return null;

  const client = new Groq({ apiKey });
  const systemPrompt =
    'Eres un clasificador estructural de layouts regulatorios PLD/FT de México (CNBV/UIF/SAT). ' +
    'Recibes únicamente descriptores estructurales sintéticos Zero-PII. ' +
    'Responde EXCLUSIVAMENTE un objeto JSON válido con la forma: ' +
    '{"mappings":[{"columnIndex":0,"role":"CURP|RFC|GENERIC_ID|FULL_NAME|FIRST_NAME|PATERNAL_SURNAME|MATERNAL_SURNAME|CORPORATE_NAME|LIST_TYPE|OFFICIAL_REF|PUBLICATION_DATE|SAT_69B_STATUS|IGNORE"}],"summaryNote":"breve nota en español"}';

  try {
    const completion = await client.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      max_tokens: 450,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: serializedPayload },
      ],
    });
    const rawJson = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(rawJson) as {
      mappings?: Array<{ columnIndex?: unknown; role?: unknown }>;
      summaryNote?: unknown;
    };
    const rolesByIndex = new Map<number, CanonicalPldColumnRole>();
    if (Array.isArray(parsed.mappings)) {
      for (const item of parsed.mappings) {
        const idx = typeof item.columnIndex === 'number' ? item.columnIndex : -1;
        const role = typeof item.role === 'string' ? (item.role.trim().toUpperCase() as CanonicalPldColumnRole) : 'IGNORE';
        if (idx >= 0 && (ALLOWED_PLD_COLUMN_ROLES as readonly string[]).includes(role)) {
          rolesByIndex.set(idx, role);
        }
      }
    }
    return {
      rolesByIndex,
      summaryNote: typeof parsed.summaryNote === 'string' ? parsed.summaryNote.trim().slice(0, 240) : undefined,
    };
  } catch {
    return null;
  }
}

export interface InferPldColumnsInput {
  readonly structure: TableStructureDiscovery;
  readonly fileExtensionHint?: string;
  readonly columnMappingOverride?: PldColumnMappingOverride;
  readonly enableGroqSemanticAssist?: boolean;
  readonly maskSampleCallback: (rawSample: string, role: CanonicalPldColumnRole) => string;
  readonly onPromptInspectedAuditHook?: (serializedPrompt: string, payload: ZeroPiiStructuralPromptPayload) => void;
}

/**
 * Reconcilia Capa 1 (Determinista Decimal.js) + Capa 2 (Groq Zero-PII) + Capa 3 (Override Humano).
 * Guardrail 3: curpMatchRatio >= 80.00% y rfcMatchRatio >= 80.00% prevalecen obligatoriamente sobre el LLM.
 */
export async function inferPldColumnsHybridZeroPii(input: InferPldColumnsInput): Promise<{
  columns: ReadonlyArray<InferredColumnProfile>;
  inferenceEngineUsed: 'HYBRID_GROQ_AND_DETERMINISTIC' | 'DETERMINISTIC_CONTENT_FIRST';
  overallConfidencePct: string;
  groqSummaryNote?: string;
}> {
  const colCount = Math.max(
    input.structure.rawHeaders.length,
    ...input.structure.dataRows.slice(0, 20).map((r) => r.length),
    1
  );
  const metrics = computeColumnStatisticalMetrics(colCount, input.structure.dataRows);

  // Fase A: Clasificación determinista inicial (encabezado + contenido)
  const deterministicRoles: Array<{
    role: CanonicalPldColumnRole;
    conf: Decimal;
    source: ColumnDetectionSource;
    ambiguous: boolean;
  }> = metrics.map((m) => {
    const rawHeader = input.structure.hasHeaderRow ? (input.structure.rawHeaders[m.columnIndex] ?? '') : '';
    const headerRole = rawHeader ? matchHeaderSynonymRole(normalizeHeaderToken(rawHeader)) : null;

    if (m.curpMatchRatio.greaterThanOrEqualTo(new Decimal('80'))) {
      return { role: 'CURP', conf: m.curpMatchRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.rfcMatchRatio.greaterThanOrEqualTo(new Decimal('80'))) {
      return { role: 'RFC', conf: m.rfcMatchRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.sat69bStatusRatio.greaterThanOrEqualTo(new Decimal('60'))) {
      return { role: 'SAT_69B_STATUS', conf: m.sat69bStatusRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.entityCategoryRatio.greaterThanOrEqualTo(new Decimal('80'))) {
      return { role: 'IGNORE', conf: m.entityCategoryRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (headerRole && headerRole !== 'IGNORE') {
      return { role: headerRole, conf: new Decimal('94.00'), source: 'DETERMINISTIC_HEADER', ambiguous: false };
    }
    if (headerRole === 'IGNORE') {
      return { role: 'IGNORE', conf: new Decimal('92.00'), source: 'DETERMINISTIC_HEADER', ambiguous: false };
    }
    if (m.dateMatchRatio.greaterThanOrEqualTo(new Decimal('70'))) {
      return { role: 'PUBLICATION_DATE', conf: m.dateMatchRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.officialRefRatio.greaterThanOrEqualTo(new Decimal('60'))) {
      return { role: 'OFFICIAL_REF', conf: m.officialRefRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.corporateRatio.greaterThanOrEqualTo(new Decimal('50'))) {
      return { role: 'CORPORATE_NAME', conf: new Decimal('91.00'), source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.isoCountryRatio.greaterThanOrEqualTo(new Decimal('80'))) {
      return { role: 'GENERIC_ID', conf: m.isoCountryRatio, source: 'DETERMINISTIC_CONTENT', ambiguous: false };
    }
    if (m.personNameRatio.greaterThanOrEqualTo(new Decimal('60'))) {
      return { role: 'FULL_NAME', conf: new Decimal('86.00'), source: 'DETERMINISTIC_CONTENT', ambiguous: true };
    }
    return {
      role: headerRole ?? 'IGNORE',
      conf: headerRole === 'IGNORE' ? new Decimal('90.00') : new Decimal('65.00'),
      source: headerRole ? 'DETERMINISTIC_HEADER' : 'DETERMINISTIC_CONTENT',
      ambiguous: m.nonEmptyCount > 0 && headerRole !== 'IGNORE',
    };
  });

  // Desambiguación determinista de 3 columnas contiguas de nombres sin cabecera explícita
  const personCandidateIndices = deterministicRoles
    .map((d, idx) => (d.role === 'FULL_NAME' && d.source === 'DETERMINISTIC_CONTENT' ? idx : -1))
    .filter((idx) => idx >= 0);
  if (personCandidateIndices.length === 3) {
    deterministicRoles[personCandidateIndices[0]!] = {
      role: 'FIRST_NAME', conf: new Decimal('89.00'), source: 'DETERMINISTIC_CONTENT', ambiguous: true,
    };
    deterministicRoles[personCandidateIndices[1]!] = {
      role: 'PATERNAL_SURNAME', conf: new Decimal('89.00'), source: 'DETERMINISTIC_CONTENT', ambiguous: true,
    };
    deterministicRoles[personCandidateIndices[2]!] = {
      role: 'MATERNAL_SURNAME', conf: new Decimal('89.00'), source: 'DETERMINISTIC_CONTENT', ambiguous: true,
    };
  }

  // Fase B: Asistencia Semántica Zero-PII con Groq cuando está habilitada o hay columnas ambiguas
  const hasAmbiguity = deterministicRoles.some((d) => d.ambiguous) || Boolean(input.onPromptInspectedAuditHook);
  let groqResult: { rolesByIndex: Map<number, CanonicalPldColumnRole>; summaryNote?: string } | null = null;
  if (input.enableGroqSemanticAssist !== false && hasAmbiguity) {
    const promptPayload = buildZeroPiiStructuralPromptPayload({
      fileExtensionHint: input.fileExtensionHint ?? 'CSV',
      hasHeaderRow: input.structure.hasHeaderRow,
      rawHeaders: input.structure.rawHeaders,
      metrics,
    });
    groqResult = await queryGroqSemanticZeroPiiMapping(promptPayload, input.onPromptInspectedAuditHook);
  }

  // Fase C: Soberanía Determinista (Guardrail 3) + Override del Oficial (Guardrail 6)
  let confSum = new Decimal('0');
  const finalColumns: InferredColumnProfile[] = metrics.map((m, idx) => {
    const det = deterministicRoles[idx]!;
    let role = det.role;
    let conf = det.conf;
    let source = det.source;

    const groqRole = groqResult?.rolesByIndex.get(idx);
    const isDeterministicallyLocked =
      m.curpMatchRatio.greaterThanOrEqualTo(new Decimal('80')) ||
      m.rfcMatchRatio.greaterThanOrEqualTo(new Decimal('80')) ||
      m.sat69bStatusRatio.greaterThanOrEqualTo(new Decimal('60'));

    if (!isDeterministicallyLocked && det.ambiguous && groqRole && groqRole !== 'IGNORE') {
      role = groqRole;
      conf = new Decimal('92.50');
      source = 'GROQ_SEMANTIC_ZERO_PII';
    }

    const userOverrideRole = input.columnMappingOverride?.[idx];
    if (userOverrideRole && (ALLOWED_PLD_COLUMN_ROLES as readonly string[]).includes(userOverrideRole)) {
      role = userOverrideRole;
      conf = new Decimal('100.00');
      source = 'USER_OVERRIDE';
    }

    confSum = confSum.plus(conf);
    const displayHeader = input.structure.hasHeaderRow
      ? (input.structure.rawHeaders[idx] || `Columna ${idx + 1}`)
      : `Columna ${idx + 1} (Sin encabezado)`;

    return {
      columnIndex: idx,
      rawHeaderLabel: displayHeader,
      assignedRole: role,
      confidencePct: conf.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      detectionSource: source,
      maskedSampleValue: input.maskSampleCallback(m.firstNonEmptyRaw, role),
    };
  });

  const overallConf =
    finalColumns.length > 0
      ? confSum.dividedBy(new Decimal(finalColumns.length)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
      : '100.00';

  return {
    columns: finalColumns,
    inferenceEngineUsed: groqResult ? 'HYBRID_GROQ_AND_DETERMINISTIC' : 'DETERMINISTIC_CONTENT_FIRST',
    overallConfidencePct: overallConf,
    groqSummaryNote: groqResult?.summaryNote,
  };
}
