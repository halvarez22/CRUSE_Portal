/**
 * CONTROLADORES HTTP DE ANÁLISIS INTELIGENTE E INGESTA CON VERIFICACIÓN CRIPTOGRÁFICA MULTIPART
 *
 * @implements CRUSE-APO-2026-056 (Guardrails Forenses 1, 5, 6, 7 y 8)
 * @implements Regla 3 Anti-God-Object (< 600 líneas) y Regla 6 SQA (cero `any`)
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { getAuth } from '../auth/authMiddleware';
import { extractClientIp } from '../audit/auditMask';
import { auditEventStore } from '../audit/auditEventStore';
import { PldListType } from '../../types';
import {
  ALLOWED_PLD_COLUMN_ROLES,
  CanonicalPldColumnRole,
  PldColumnMappingOverride,
} from '../../types/pldSmartIngestion';
import { parseAndValidatePldCsvZeroPii } from '../pld/pldListParserAndValidator';
import { ingestPldRiskListEntries } from '../pld/pldScreeningService';

const VALID_LIST_TYPES: ReadonlySet<PldListType> = new Set<PldListType>([
  'SAT_69B_DEFINITIVO',
  'SAT_69B_PRESUNTO',
  'UIF_PERSONAS_BLOQUEADAS',
  'OFAC_SDN',
  'PEP_NACIONAL',
  'GAFI_HIGH_RISK_JURISDICTIONS',
  'SHCP_REFIPRES_TAX_HAVENS',
]);

const MAX_MULTIPART_BYTES = 8 * 1024 * 1024;
const ANALYZE_WINDOW_MS = 5 * 60 * 1000;
const ANALYZE_MAX_REQUESTS = 15;

class PldAnalyzeSlidingRateLimiter {
  private readonly historyByKey = new Map<string, number[]>();

  checkAndRecord(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds?: number } {
    const active = (this.historyByKey.get(key) ?? []).filter((ts) => now - ts < ANALYZE_WINDOW_MS);
    if (active.length >= ANALYZE_MAX_REQUESTS) {
      const oldest = active[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + ANALYZE_WINDOW_MS - now) / 1000));
      this.historyByKey.set(key, active);
      return { allowed: false, retryAfterSeconds };
    }
    active.push(now);
    this.historyByKey.set(key, active);
    return { allowed: true };
  }

  reset(key: string): void {
    this.historyByKey.delete(key);
  }
}

export const pldAnalyzeRateLimiter = new PldAnalyzeSlidingRateLimiter();

export interface ExtractedWatchlistHttpPayload {
  readonly csvContent: string;
  readonly defaultListType: PldListType;
  readonly defaultOfficialReference: string;
  readonly originalFileSha256?: string;
  readonly fileExtensionHint?: string;
  readonly fileName?: string;
  readonly rawFileBuffer?: Buffer;
  readonly columnMappingOverride?: PldColumnMappingOverride;
}

function parseColumnMappingOverride(raw: unknown): PldColumnMappingOverride | undefined {
  let obj: unknown = raw;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      obj = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const out: Record<number, CanonicalPldColumnRole> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const idx = parseInt(k, 10);
    const role = typeof v === 'string' ? (v.trim().toUpperCase() as CanonicalPldColumnRole) : 'IGNORE';
    if (Number.isInteger(idx) && idx >= 0 && (ALLOWED_PLD_COLUMN_ROLES as readonly string[]).includes(role)) {
      out[idx] = role;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function decodeBufferWithWindows1252Fallback(buf: Buffer): string {
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(buf);
  } catch {
    const winDecoder = new TextDecoder('windows-1252');
    return winDecoder.decode(buf);
  }
}

export function extractMultipartFieldsAndRawFileBuffer(
  rawBody: Buffer,
  boundary: string
): { fields: Record<string, string>; rawFileBuffer?: Buffer; fileName?: string } {
  const fields: Record<string, string> = {};
  let rawFileBuffer: Buffer | undefined;
  let fileName: string | undefined;

  const delimiterBuf = Buffer.from(`--${boundary}`, 'utf8');
  const headerEndSep = Buffer.from('\r\n\r\n', 'utf8');

  let pos = rawBody.indexOf(delimiterBuf, 0);
  while (pos !== -1) {
    const partStart = pos + delimiterBuf.length;
    if (rawBody.subarray(partStart, partStart + 2).toString('utf8') === '--') {
      break;
    }
    const contentStart = rawBody.subarray(partStart, partStart + 2).toString('utf8') === '\r\n'
      ? partStart + 2
      : partStart;
    const nextBoundaryPos = rawBody.indexOf(delimiterBuf, contentStart);
    if (nextBoundaryPos === -1) break;

    const headerEndPos = rawBody.indexOf(headerEndSep, contentStart);
    if (headerEndPos !== -1 && headerEndPos < nextBoundaryPos) {
      const rawHeadersText = rawBody.subarray(contentStart, headerEndPos).toString('utf8');
      const bodyStart = headerEndPos + headerEndSep.length;
      let bodyEnd = nextBoundaryPos;
      if (rawBody[bodyEnd - 2] === 0x0d && rawBody[bodyEnd - 1] === 0x0a) {
        bodyEnd -= 2;
      }
      const partBytes = rawBody.subarray(bodyStart, bodyEnd);
      const nameMatch = /name="([^"]+)"/i.exec(rawHeadersText);
      const filenameMatch = /filename="([^"]*)"/i.exec(rawHeadersText);
      const fieldName = nameMatch?.[1];

      if (filenameMatch && fieldName === 'file') {
        rawFileBuffer = Buffer.from(partBytes);
        fileName = filenameMatch[1] || 'watchlist.dat';
      } else if (fieldName) {
        fields[fieldName] = partBytes.toString('utf8');
      }
    }
    pos = nextBoundaryPos;
  }

  return { fields, rawFileBuffer, fileName };
}

function readRawRequestStream(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('El archivo subido excede el límite máximo permitido de 8 MB.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

async function parseIncomingWatchlistPayload(req: Request): Promise<ExtractedWatchlistHttpPayload> {
  const contentType = String(req.headers['content-type'] ?? '');
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
    if (!boundary) {
      throw new Error('Cabecera multipart/form-data inválida: falta parámetro boundary.');
    }
    const rawStreamBuf = await readRawRequestStream(req, MAX_MULTIPART_BYTES);
    const parsed = extractMultipartFieldsAndRawFileBuffer(rawStreamBuf, boundary);

    const rawListType = (parsed.fields.defaultListType ?? 'SAT_69B_DEFINITIVO').trim().toUpperCase();
    const defaultListType: PldListType = VALID_LIST_TYPES.has(rawListType as PldListType)
      ? (rawListType as PldListType)
      : 'SAT_69B_DEFINITIVO';
    const defaultOfficialReference = (parsed.fields.defaultOfficialReference ?? '').trim() || 'DOF-SAT-69B-2026';
    const csvContent =
      parsed.fields.csvContent && parsed.fields.csvContent.trim().length > 0
        ? parsed.fields.csvContent
        : parsed.rawFileBuffer
          ? decodeBufferWithWindows1252Fallback(parsed.rawFileBuffer)
          : '';
    const extFromFile = parsed.fileName?.split('.').pop()?.toUpperCase();

    return {
      csvContent,
      defaultListType,
      defaultOfficialReference,
      originalFileSha256: parsed.fields.originalFileSha256?.trim(),
      fileExtensionHint: parsed.fields.fileExtensionHint?.trim() || extFromFile,
      fileName: parsed.fileName,
      rawFileBuffer: parsed.rawFileBuffer,
      columnMappingOverride: parseColumnMappingOverride(parsed.fields.columnMappingOverride),
    };
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawListType = typeof body.defaultListType === 'string' ? body.defaultListType.trim().toUpperCase() : 'SAT_69B_DEFINITIVO';
  const defaultListType: PldListType = VALID_LIST_TYPES.has(rawListType as PldListType)
    ? (rawListType as PldListType)
    : 'SAT_69B_DEFINITIVO';
  const defaultOfficialReference =
    typeof body.defaultOfficialReference === 'string' && body.defaultOfficialReference.trim().length > 0
      ? body.defaultOfficialReference.trim()
      : 'DOF-SAT-69B-2026';

  const rawFileBuffer =
    typeof body.rawFileBase64 === 'string' && body.rawFileBase64.length > 0
      ? Buffer.from(body.rawFileBase64, 'base64')
      : undefined;

  return {
    csvContent: typeof body.csvContent === 'string' ? body.csvContent : '',
    defaultListType,
    defaultOfficialReference,
    originalFileSha256: typeof body.originalFileSha256 === 'string' ? body.originalFileSha256.trim() : undefined,
    fileExtensionHint: typeof body.fileExtensionHint === 'string' ? body.fileExtensionHint.trim() : undefined,
    fileName: typeof body.fileName === 'string' ? body.fileName.trim() : undefined,
    rawFileBuffer,
    columnMappingOverride: parseColumnMappingOverride(body.columnMappingOverride),
  };
}

/**
 * Guardrail 1 (CRUSE-APO-2026-056): Re-valida en servidor el SHA-256 sobre los bytes crudos recibidos.
 * Ante cualquier discrepancia, rechaza con HTTP 400 y sella FILE_INTEGRITY_TAMPERED en WORM.
 */
export function verifyServerRawBytesSha256Match(
  rawFileBuffer: Buffer,
  declaredOriginalFileSha256: string
): { matches: boolean; serverSha256: string } {
  const serverSha256 = crypto.createHash('sha256').update(rawFileBuffer).digest('hex');
  const cleanDeclared = declaredOriginalFileSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(cleanDeclared)) {
    return { matches: false, serverSha256 };
  }
  const matches = crypto.timingSafeEqual(
    Buffer.from(serverSha256, 'hex'),
    Buffer.from(cleanDeclared, 'hex')
  );
  return { matches, serverSha256 };
}

async function enforceIntegrityGuardrailOrRespond400(
  payload: ExtractedWatchlistHttpPayload,
  actorEmail: string,
  actorRole: ReturnType<typeof getAuth>['user']['role'],
  ip: string,
  res: Response
): Promise<string | null> {
  if (payload.rawFileBuffer) {
    const declared = payload.originalFileSha256 ?? '';
    const check = verifyServerRawBytesSha256Match(payload.rawFileBuffer, declared);
    if (!check.matches) {
      await auditEventStore.append({
        action: 'FILE_INTEGRITY_TAMPERED',
        actorEmail,
        actorRole,
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary: 'pldWatchlistIngestHandlers',
        details: `FILE_INTEGRITY_TAMPERED en archivo (${payload.fileName ?? 'upload'}): Cliente=${declared.slice(0, 16) || 'VACIO'} vs Servidor=${check.serverSha256.slice(0, 16)}.`,
      });
      res.status(400).json({
        error: 'FILE_INTEGRITY_TAMPERED: La huella SHA-256 recalculada en el servidor sobre los bytes crudos no coincide con la declarada por el cliente.',
      });
      return null;
    }
    return check.serverSha256;
  }
  return payload.originalFileSha256 ?? '';
}

export async function handleAnalyzePldWatchlist(req: Request, res: Response): Promise<Response> {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const rateKey = `${user.id}:${ip}`;
    const rateCheck = pldAnalyzeRateLimiter.checkAndRecord(rateKey);

    if (!rateCheck.allowed) {
      await auditEventStore.append({
        action: 'PLD_ANALYZE_RATE_LIMIT_EXCEEDED',
        actorEmail: user.email,
        actorRole: user.role,
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary: 'pldWatchlistIngestHandlers',
        details: `Límite de 15 análisis / 5 min excedido por usuario ${user.email}. Reintentar en ${rateCheck.retryAfterSeconds}s.`,
      });
      return res.status(429).json({
        error: `Has alcanzado el límite de seguridad de análisis inteligente (15 cada 5 minutos). Intenta en ${rateCheck.retryAfterSeconds} segundos.`,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
    }

    const payload = await parseIncomingWatchlistPayload(req);
    if (payload.rawFileBuffer) {
      const verifiedSha = await enforceIntegrityGuardrailOrRespond400(payload, user.email, user.role, ip, res);
      if (verifiedSha === null) return res;
    }

    if (!payload.csvContent || payload.csvContent.trim().length === 0) {
      return res.status(400).json({ error: 'Se requiere un archivo con contenido válido para analizar.' });
    }

    const parsed = await parseAndValidatePldCsvZeroPii(
      payload.csvContent,
      payload.defaultListType,
      payload.defaultOfficialReference,
      {
        originalFileSha256: payload.originalFileSha256,
        fileExtensionHint: payload.fileExtensionHint,
        columnMappingOverride: payload.columnMappingOverride,
        allowPartialValidRowsInPreview: true,
      }
    );

    await auditEventStore.append({
      action: 'PLD_LIST_ANALYZED',
      actorEmail: user.email,
      actorRole: user.role,
      outcome: 'success',
      sourceIp: ip,
      sourceSummary: 'pldWatchlistIngestHandlers',
      details: `Radiografía Inteligente (${payload.defaultListType}): Motor=${parsed.analysis.inferenceEngineUsed}, Confianza=${parsed.analysis.overallConfidencePct}%, Válidos=${parsed.analysis.stats.validUniqueEntriesCount}, OrigSHA256=${parsed.sourceFileHash.slice(0, 16)}.`,
    });

    return res.json({ ok: true, analysis: parsed.analysis });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error analizando estructura de lista PLD/FT';
    return res.status(400).json({ error: msg });
  }
}

export async function handleIngestPldWatchlist(req: Request, res: Response): Promise<Response> {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const payload = await parseIncomingWatchlistPayload(req);

    if (payload.rawFileBuffer) {
      const verifiedSha = await enforceIntegrityGuardrailOrRespond400(payload, user.email, user.role, ip, res);
      if (verifiedSha === null) return res;
    }

    if (!payload.csvContent || payload.csvContent.trim().length === 0) {
      return res.status(400).json({ error: 'Se requiere el contenido CSV/TXT/Excel de la lista oficial PLD/FT (csvContent).' });
    }

    const result = await ingestPldRiskListEntries({
      csvContent: payload.csvContent,
      defaultListType: payload.defaultListType,
      defaultOfficialReference: payload.defaultOfficialReference,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
      originalFileSha256: payload.originalFileSha256,
      fileExtensionHint: payload.fileExtensionHint,
      columnMappingOverride: payload.columnMappingOverride,
    });

    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al ingerir lista PLD/FT';
    return res.status(400).json({ error: msg });
  }
}

export async function handleReportClientXlsxFault(req: Request, res: Response): Promise<Response> {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const body = (req.body ?? {}) as { reason?: unknown; fileName?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'Timeout / chunk error';
    const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 80) : 'archivo.xlsx';

    await auditEventStore.append({
      action: 'XLSX_DYNAMIC_IMPORT_FAILED',
      actorEmail: user.email,
      actorRole: user.role,
      outcome: 'failure',
      sourceIp: ip,
      sourceSummary: 'pldWatchlistClientHelper',
      details: `Fallo en carga diferida import('xlsx') (OBS-1) sobre ${fileName}: ${reason}`,
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Error registrando evento de diagnóstico OBS-1' });
  }
}
