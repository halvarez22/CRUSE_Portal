/**
 * PROCESADOR UNIVERSAL DE CLIENTE PARA LISTAS PLD/FT (.CSV, .TXT, .XLSX, .XLS, .XML, .JSON)
 *
 * @implements CRUSE-APO-2026-056 (Guardrails Forenses 1, 7 y 8)
 * @implements OBS-1: Carga diferida estricta vía import('xlsx') con timeout de 10s y try/catch.
 */

import { PLD_OFFICIAL_WATCHLIST_TEMPLATES } from '../data/cruseData';
import { PldListType } from '../types';

export const XLSX_LOAD_FAILURE_USER_MESSAGE =
  'Error al cargar el procesador de Excel. Por favor convierta su archivo a CSV UTF-8 e intente nuevamente.';

export class XlsxDynamicImportError extends Error {
  public readonly diagnosticReason: string;
  constructor(diagnosticReason: string) {
    super(XLSX_LOAD_FAILURE_USER_MESSAGE);
    this.name = 'XlsxDynamicImportError';
    this.diagnosticReason = diagnosticReason;
  }
}

export interface PreparedClientWatchlistPayload {
  readonly fileName: string;
  readonly fileExtension: string;
  readonly rawArrayBuffer: ArrayBuffer;
  readonly originalFileSha256: string;
  readonly normalizedCsvContent: string;
  readonly selectedSheetName?: string;
}

/**
 * Guardrail 1 y Guardrail 8: Calcula SHA-256 sobre el ArrayBuffer crudo bit-a-bit
 * ANTES de cualquier decodificación de texto, parseo XML/JSON o lectura Excel.
 */
export async function computeRawArrayBufferSha256(rawBuffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', rawBuffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Decodifica bytes de texto probando primero UTF-8 estricto y cayendo automáticamente
 * a Windows-1252 (ANSI de Excel en Español) para preservar Ñ y acentos sin \uFFFD.
 */
export function decodeTextBytesAutoCharset(rawBuffer: ArrayBuffer): string {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    return utf8.decode(rawBuffer);
  } catch {
    const win1252 = new TextDecoder('windows-1252');
    return win1252.decode(rawBuffer);
  }
}

type XlsxModuleType = typeof import('xlsx');

/**
 * Guardrail 7 (OBS-1): Carga dinámica de xlsx con timeout de 10 segundos y try/catch estricto.
 */
export async function loadXlsxWithTimeout(
  timeoutMs = 10_000,
  customImporter?: () => Promise<XlsxModuleType>
): Promise<XlsxModuleType> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  try {
    const importer = customImporter ?? (() => import('xlsx'));
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Timeout excedido (${timeoutMs} ms) descargando módulo Excel`));
      }, timeoutMs);
    });
    const mod = await Promise.race([importer(), timeoutPromise]);
    const resolved = (mod as unknown as { default?: XlsxModuleType }).default ?? mod;
    if (!resolved || typeof resolved.read !== 'function') {
      throw new Error('Módulo Excel inválido o incompleto');
    }
    return resolved;
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Error desconocido en dynamic import';
    throw new XlsxDynamicImportError(reason);
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '').replace(/\r?\n/g, ' ').trim();
  if (str.includes(',') || str.includes('"') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function serializeRecordsToCsv(records: ReadonlyArray<Record<string, unknown>>): string {
  if (records.length === 0) return '';
  const keySet = new Set<string>();
  for (const rec of records.slice(0, 50)) {
    for (const k of Object.keys(rec)) {
      if (k.trim()) keySet.add(k.trim());
    }
  }
  const headers = Array.from(keySet);
  if (headers.length === 0) return '';
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const rec of records) {
    lines.push(headers.map((h) => escapeCsvCell(rec[h])).join(','));
  }
  return lines.join('\n');
}

export function convertSitiJsonTextToCsv(jsonText: string): string {
  const parsed: unknown = JSON.parse(jsonText);
  let items: unknown[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const firstArray = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) items = firstArray;
  }
  const objectRows = items.filter(
    (it): it is Record<string, unknown> => Boolean(it && typeof it === 'object' && !Array.isArray(it))
  );
  return serializeRecordsToCsv(objectRows);
}

export function convertSitiXmlTextToCsv(xmlText: string): string {
  // Parser ligero y seguro sin resolución de entidades externas (inmune a XXE)
  const records: Array<Record<string, unknown>> = [];
  const recordBlockRegex =
    /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>((?:\s*<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>[^<]*<\/\3>\s*)+)<\/\1>/g;
  let match: RegExpExecArray | null;

  while ((match = recordBlockRegex.exec(xmlText)) !== null) {
    const inner = match[2] ?? '';
    const leafRegex = /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
    let leaf: RegExpExecArray | null;
    const row: Record<string, unknown> = {};
    let leafCount = 0;
    while ((leaf = leafRegex.exec(inner)) !== null) {
      const tag = (leaf[1] ?? '').split(':').pop() ?? '';
      const val = (leaf[2] ?? '').trim();
      if (tag) {
        row[tag] = val;
        leafCount++;
      }
    }
    if (leafCount >= 1) {
      records.push(row);
    }
  }
  return serializeRecordsToCsv(records);
}

export async function convertExcelArrayBufferToCsv(
  rawBuffer: ArrayBuffer,
  timeoutMs = 10_000,
  customImporter?: () => Promise<XlsxModuleType>
): Promise<{ csvContent: string; sheetName: string }> {
  const XLSX = await loadXlsxWithTimeout(timeoutMs, customImporter);
  const workbook = XLSX.read(new Uint8Array(rawBuffer), { type: 'array', raw: false });

  let bestSheet = workbook.SheetNames[0] ?? 'Sheet1';
  let bestRowCount = -1;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (matrix.length > bestRowCount) {
      bestRowCount = matrix.length;
      bestSheet = name;
    }
  }

  const targetSheet = workbook.Sheets[bestSheet];
  const csvContent = targetSheet ? XLSX.utils.sheet_to_csv(targetSheet, { blankrows: false }) : '';
  return { csvContent, sheetName: bestSheet };
}

/**
 * Punto de entrada universal: calcula primero originalFileSha256 sobre bytes crudos (Guardrails 1 y 8)
 * y luego normaliza cualquier formato (.xlsx, .xls, .xml, .json, .csv, .txt) a texto tabular.
 */
export async function prepareUploadedWatchlistBrowserFile(
  fileName: string,
  rawArrayBuffer: ArrayBuffer
): Promise<PreparedClientWatchlistPayload> {
  // Paso 0 inamovible (Guardrails 1 y 8): Hash SHA-256 sobre los bytes crudos exactos sin tocar
  const originalFileSha256 = await computeRawArrayBufferSha256(rawArrayBuffer);
  const ext = (fileName.split('.').pop() ?? 'csv').trim().toUpperCase();

  if (ext === 'XLSX' || ext === 'XLS') {
    const { csvContent, sheetName } = await convertExcelArrayBufferToCsv(rawArrayBuffer);
    return {
      fileName,
      fileExtension: ext,
      rawArrayBuffer,
      originalFileSha256,
      normalizedCsvContent: csvContent,
      selectedSheetName: sheetName,
    };
  }

  const decodedText = decodeTextBytesAutoCharset(rawArrayBuffer);
  if (ext === 'JSON') {
    return {
      fileName,
      fileExtension: ext,
      rawArrayBuffer,
      originalFileSha256,
      normalizedCsvContent: convertSitiJsonTextToCsv(decodedText),
    };
  }

  if (ext === 'XML') {
    return {
      fileName,
      fileExtension: ext,
      rawArrayBuffer,
      originalFileSha256,
      normalizedCsvContent: convertSitiXmlTextToCsv(decodedText),
    };
  }

  return {
    fileName,
    fileExtension: ext,
    rawArrayBuffer,
    originalFileSha256,
    normalizedCsvContent: decodedText,
  };
}

function resolveTemplateConfig(listType: PldListType) {
  if (listType in PLD_OFFICIAL_WATCHLIST_TEMPLATES) {
    return PLD_OFFICIAL_WATCHLIST_TEMPLATES[listType as keyof typeof PLD_OFFICIAL_WATCHLIST_TEMPLATES];
  }
  return PLD_OFFICIAL_WATCHLIST_TEMPLATES.UIF_PERSONAS_BLOQUEADAS;
}

export function downloadOfficialPldTemplateCsv(listType: PldListType): void {
  const tpl = resolveTemplateConfig(listType);
  const csvLines = [
    tpl.headers.join(','),
    ...tpl.sampleRows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const bomContent = `\uFEFF${csvLines.join('\r\n')}\r\n`;
  const blob = new Blob([bomContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tpl.fileNameBase}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadOfficialPldTemplateXlsx(listType: PldListType): Promise<void> {
  const tpl = resolveTemplateConfig(listType);
  const XLSX = await loadXlsxWithTimeout(10_000);
  const aoa: string[][] = [
    [...tpl.headers],
    ...tpl.sampleRows.map((r) => [...r]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista_PLD');
  XLSX.writeFile(wb, `${tpl.fileNameBase}.xlsx`);
}
