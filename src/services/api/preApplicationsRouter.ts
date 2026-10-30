/**
 * ENRUTADOR Y SERVICIO DE PRE-SOLICITUDES DEL SIMULADOR PÚBLICO Y BUZÓN CIFRADO
 *
 * Implementa el expediente CRUSE-APO-2026-045:
 * 1. Rate Limiting Dual Anti-Spam (Memoria por IP + DB por source_ip / phone_blind_index: máx. 3/hora).
 * 2. Cifrado Envelope AES-GCM-256 (`encryptEnvelope` / `decryptEnvelope`) y Blind Index HMAC-SHA256.
 * 3. Transacción Atómica `db.transaction` uniendo `INSERT` y evento WORM (`PRE_APPLICATION_CREATED`).
 * 4. Buzón estilo Email (`NO_LEIDO` -> `LEIDO` automático al abrir detalle -> `ATENDIDO` manual).
 * 5. Cero Punto Flotante (`Decimal.js` exclusivamente).
 *
 * @implements CRUSE-APO-2026-045
 */

import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { getServerKms, computeServerBlindIndex } from '../crypto/serverKeyring';
import { encryptEnvelope, decryptEnvelope, EnvelopeEncryptedPayload } from '../crypto/cryptoService';
import { auditEventStore } from '../audit/auditEventStore';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import {
  PreApplicationDecryptedDetail,
  PreApplicationInboxStatus,
  PreApplicationPublicSubmitPayload,
  PreApplicationSummaryItem,
  PreApplicationsInboxOverview,
  ProductId,
  UserRole,
} from '../../types';

export const preApplicationsRouter = Router();

const MAX_PRE_APPS_PER_HOUR = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ipSlidingWindow = new Map<string, number[]>();

export function resetPreApplicationRateLimitMemory(): void {
  ipSlidingWindow.clear();
}

export function isIpRateLimitedInMemory(ip: string, nowMs: number): boolean {
  const recent = (ipSlidingWindow.get(ip) ?? []).filter((ts) => nowMs - ts < RATE_WINDOW_MS);
  if (recent.length >= MAX_PRE_APPS_PER_HOUR) {
    ipSlidingWindow.set(ip, recent);
    return true;
  }
  recent.push(nowMs);
  ipSlidingWindow.set(ip, recent);
  return false;
}

export function maskApplicantName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts
    .map((p) => (p.length <= 2 ? `${p[0] ?? '*'}*` : `${p.slice(0, 2)}${'*'.repeat(p.length - 2)}`))
    .join(' ');
}

export function maskPhone10Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '614***0000';
  return `${digits.slice(0, 3)}***${digits.slice(-4)}`;
}

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [userPart, domainPart] = trimmed.split('@');
  if (!userPart || !domainPart) return 'u***@cruse.mx';
  const prefix = userPart.slice(0, 2);
  return `${prefix}***@${domainPart}`;
}

function parseIntegerStrict(rawVal: string | number | null | undefined, fallback = 0): number {
  const dec = sanitizeDecimalString(String(rawVal ?? fallback), String(fallback));
  return JSON.parse(dec.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)) as number;
}

interface PreAppDbRow {
  id: string;
  folio: string;
  created_at: string;
  applicant_name_masked: string;
  phone_masked: string;
  email_masked: string;
  phone_blind_index: string;
  email_blind_index: string;
  convenio: string;
  encrypted_contact_envelope: string;
  product_id: string;
  product_name: string;
  requested_amount_mxn: string | number;
  term_fortnights: string | number;
  fortnightly_payment_mxn: string | number;
  monthly_payment_mxn: string | number;
  total_to_pay_mxn: string | number;
  cat_percent: string | number;
  interest_rate_text: string;
  inbox_status: string;
  read_by_email: string | null;
  read_at: string | null;
  attended_by_email: string | null;
  attended_at: string | null;
  promoter_notes: string | null;
  source_ip: string | null;
}

function mapRowToSummary(row: PreAppDbRow): PreApplicationSummaryItem {
  return {
    id: row.id,
    folio: row.folio,
    createdAt: String(row.created_at),
    applicantNameMasked: row.applicant_name_masked,
    phoneMasked: row.phone_masked,
    emailMasked: row.email_masked,
    convenio: row.convenio,
    productId: (row.product_id || 'normal') as ProductId,
    productName: row.product_name,
    requestedAmountMxn: sanitizeDecimalString(String(row.requested_amount_mxn), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    termFortnights: parseIntegerStrict(row.term_fortnights, 24),
    fortnightlyPaymentMxn: sanitizeDecimalString(String(row.fortnightly_payment_mxn), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    monthlyPaymentMxn: sanitizeDecimalString(String(row.monthly_payment_mxn), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    totalToPayMxn: sanitizeDecimalString(String(row.total_to_pay_mxn), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    catPercent: sanitizeDecimalString(String(row.cat_percent), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    interestRateText: row.interest_rate_text,
    inboxStatus: (row.inbox_status || 'NO_LEIDO') as PreApplicationInboxStatus,
    readByEmail: row.read_by_email,
    readAt: row.read_at ? String(row.read_at) : null,
    attendedByEmail: row.attended_by_email,
    attendedAt: row.attended_at ? String(row.attended_at) : null,
    promoterNotes: row.promoter_notes,
  };
}

export async function createPreApplicationInDb(
  payload: PreApplicationPublicSubmitPayload,
  sourceIp: string,
  userAgent?: string | null
): Promise<PreApplicationSummaryItem> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const oneHourAgoIso = new Date(nowMs - RATE_WINDOW_MS).toISOString();

  const cleanName = String(payload.fullName ?? '').trim();
  const cleanPhone = String(payload.phone ?? '').replace(/\D/g, '');
  const cleanEmail = String(payload.email ?? '').trim().toLowerCase();
  const cleanConvenio = String(payload.convenio ?? '').trim();
  const cleanSchedule = String(payload.preferredSchedule ?? '').trim();
  const cleanFolio = String(payload.folio ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');

  if (cleanName.length < 5) {
    throw new Error('VALIDATION_ERROR: El nombre completo debe tener al menos 5 caracteres.');
  }
  if (!/^\d{10}$/.test(cleanPhone)) {
    throw new Error('VALIDATION_ERROR: El teléfono celular debe contener exactamente 10 dígitos.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('VALIDATION_ERROR: El correo electrónico proporcionado no es válido.');
  }
  if (!cleanConvenio) {
    throw new Error('VALIDATION_ERROR: Debe seleccionar su dependencia o convenio laboral.');
  }
  if (!cleanFolio.startsWith('CRUSE-PRE-')) {
    throw new Error('VALIDATION_ERROR: El folio de pre-cotización no tiene un formato válido.');
  }

  // 1. Primera barrera en memoria por IP (ventana móvil de 60 min)
  if (isIpRateLimitedInMemory(sourceIp, nowMs)) {
    throw new Error(
      'RATE_LIMIT_EXCEEDED: Límite de seguridad alcanzado (máximo 3 pre-solicitudes por hora). Intente más tarde.'
    );
  }

  const phoneBlindIndex = await computeServerBlindIndex(cleanPhone);
  const emailBlindIndex = await computeServerBlindIndex(cleanEmail);

  // 2. Segunda barrera persistente en Base de Datos por source_ip O phone_blind_index en los últimos 60 min
  const rateCheckRes = await db.query<{ recent_count: string | number }>(
    `SELECT COUNT(*) AS recent_count
     FROM credit_pre_applications
     WHERE created_at >= $1
       AND (source_ip = $2 OR phone_blind_index = $3)`,
    [oneHourAgoIso, sourceIp, phoneBlindIndex]
  );

  const recentCountDec = sanitizeDecimalString(
    String(rateCheckRes.rows[0]?.recent_count ?? '0'),
    '0'
  );
  if (recentCountDec.gte(new Decimal(MAX_PRE_APPS_PER_HOUR))) {
    throw new Error(
      'RATE_LIMIT_EXCEEDED: Ya existen pre-solicitudes recientes para este teléfono o dirección IP. Un promotor le contactará pronto.'
    );
  }

  const amountDec = sanitizeDecimalString(String(payload.amount ?? '0'), '0').toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP
  );
  const fortnightlyDec = sanitizeDecimalString(
    String(payload.fortnightlyPayment ?? '0'),
    '0'
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const monthlyDec = sanitizeDecimalString(
    String(payload.monthlyPaymentEquivalent ?? '0'),
    '0'
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalToPayDec = sanitizeDecimalString(
    String(payload.totalToPay ?? '0'),
    '0'
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const catDec = sanitizeDecimalString(String(payload.catPercent ?? '0'), '0').toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP
  );
  const termInt = parseIntegerStrict(payload.selectedTerm, 24);

  if (amountDec.lte(new Decimal('0')) || fortnightlyDec.lte(new Decimal('0'))) {
    throw new Error('VALIDATION_ERROR: Los montos de la simulación financiera son inválidos.');
  }

  const kms = getServerKms();
  const encryptedEnvelope = await encryptEnvelope(
    JSON.stringify({
      fullName: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      convenio: cleanConvenio,
      preferredSchedule: cleanSchedule || 'Horario laboral por confirmar en cita',
    }),
    kms
  );

  const recordId = `pre_${nowMs}_${cleanFolio.slice(-6).toLowerCase()}`;
  const maskedName = maskApplicantName(cleanName);
  const maskedPhone = maskPhone10Digits(cleanPhone);
  const maskedEmail = maskEmailAddress(cleanEmail);
  const cleanProductId = (payload.productId || 'normal') as ProductId;
  const cleanProductName = String(payload.productName || 'Crédito Clásico').trim();
  const cleanRateText = String(payload.interestRateText || '1.97% quincenal').trim();

  // 3. Transacción Atómica: INSERT en credit_pre_applications + Evento WORM PRE_APPLICATION_CREATED
  await db.transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO credit_pre_applications (
         id, folio, created_at, applicant_name_masked, phone_masked, email_masked,
         phone_blind_index, email_blind_index, convenio, encrypted_contact_envelope,
         product_id, product_name, requested_amount_mxn, term_fortnights,
         fortnightly_payment_mxn, monthly_payment_mxn, total_to_pay_mxn,
         cat_percent, interest_rate_text, inbox_status, source_ip
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17,
         $18, $19, 'NO_LEIDO', $20
       )`,
      [
        recordId,
        cleanFolio,
        nowIso,
        maskedName,
        maskedPhone,
        maskedEmail,
        phoneBlindIndex,
        emailBlindIndex,
        cleanConvenio,
        JSON.stringify(encryptedEnvelope),
        cleanProductId,
        cleanProductName,
        amountDec.toFixed(2),
        termInt,
        fortnightlyDec.toFixed(2),
        monthlyDec.toFixed(2),
        totalToPayDec.toFixed(2),
        catDec.toFixed(2),
        cleanRateText,
        sourceIp,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      actorEmail: 'portal.publico@cruse.com.mx',
      actorRole: 'sistema',
      action: 'PRE_APPLICATION_CREATED',
      outcome: 'success',
      sourceIp,
      sourceSummary: buildSourceSummary(sourceIp, userAgent),
      expedienteId: cleanFolio,
      blindCurpPrefix: phoneBlindIndex.slice(0, 12),
      details: `Folio ${cleanFolio} | Convenio: ${cleanConvenio} | Monto: $${amountDec.toFixed(2)} MXN (${termInt} qnas)`,
    });
  });

  return {
    id: recordId,
    folio: cleanFolio,
    createdAt: nowIso,
    applicantNameMasked: maskedName,
    phoneMasked: maskedPhone,
    emailMasked: maskedEmail,
    convenio: cleanConvenio,
    productId: cleanProductId,
    productName: cleanProductName,
    requestedAmountMxn: amountDec.toFixed(2),
    termFortnights: termInt,
    fortnightlyPaymentMxn: fortnightlyDec.toFixed(2),
    monthlyPaymentMxn: monthlyDec.toFixed(2),
    totalToPayMxn: totalToPayDec.toFixed(2),
    catPercent: catDec.toFixed(2),
    interestRateText: cleanRateText,
    inboxStatus: 'NO_LEIDO',
    readByEmail: null,
    readAt: null,
    attendedByEmail: null,
    attendedAt: null,
    promoterNotes: null,
  };
}

export async function getPreApplicationsInboxOverview(): Promise<PreApplicationsInboxOverview> {
  const res = await db.query<PreAppDbRow>(
    `SELECT * FROM credit_pre_applications ORDER BY created_at DESC, id DESC LIMIT 200`
  );
  const items = res.rows.map(mapRowToSummary);
  let unreadCount = 0;
  let readCount = 0;
  let attendedCount = 0;

  for (const item of items) {
    if (item.inboxStatus === 'NO_LEIDO') unreadCount += 1;
    else if (item.inboxStatus === 'LEIDO') readCount += 1;
    else if (item.inboxStatus === 'ATENDIDO') attendedCount += 1;
  }

  return {
    counts: {
      total: items.length,
      unreadCount,
      readCount,
      attendedCount,
    },
    items,
  };
}

export async function getPreApplicationDetailAndMarkRead(
  idOrFolio: string,
  actorEmail: string,
  actorRole: UserRole,
  sourceIp: string
): Promise<PreApplicationDecryptedDetail> {
  const res = await db.query<PreAppDbRow>(
    `SELECT * FROM credit_pre_applications WHERE id = $1 OR folio = $1 LIMIT 1`,
    [idOrFolio]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error('NOT_FOUND: La pre-solicitud indicada no existe.');
  }

  const nowIso = new Date().toISOString();
  let updatedStatus = row.inbox_status as PreApplicationInboxStatus;
  let updatedReadBy = row.read_by_email;
  let updatedReadAt = row.read_at;

  await db.transaction(async (tx) => {
    if (row.inbox_status === 'NO_LEIDO') {
      await tx.execute(
        `UPDATE credit_pre_applications
         SET inbox_status = 'LEIDO', read_by_email = $1, read_at = $2
         WHERE id = $3`,
        [actorEmail, nowIso, row.id]
      );
      updatedStatus = 'LEIDO';
      updatedReadBy = actorEmail;
      updatedReadAt = nowIso;
    }

    await auditEventStore.appendInTx(tx, {
      actorEmail,
      actorRole,
      action: 'EXPEDIENTE_VIEW',
      outcome: 'success',
      sourceIp,
      sourceSummary: 'Buzón Pre-Solicitudes (Consulta de Detalle + Descifrado Contacto)',
      expedienteId: row.folio,
      blindCurpPrefix: row.phone_blind_index.slice(0, 12),
      details: `Consulta de Pre-Solicitud ${row.folio} (${row.convenio}) — Estatus: ${updatedStatus}`,
    });
  });

  const kms = getServerKms();
  const envelopeObj = JSON.parse(row.encrypted_contact_envelope) as EnvelopeEncryptedPayload;
  const decryptedJson = await decryptEnvelope(envelopeObj, kms);
  const decryptedContact = JSON.parse(decryptedJson) as {
    fullName?: string;
    phone?: string;
    email?: string;
    preferredSchedule?: string;
  };

  const summary = mapRowToSummary({
    ...row,
    inbox_status: updatedStatus,
    read_by_email: updatedReadBy,
    read_at: updatedReadAt,
  });

  return {
    ...summary,
    fullName: decryptedContact.fullName || row.applicant_name_masked,
    phone: decryptedContact.phone || row.phone_masked,
    email: decryptedContact.email || row.email_masked,
    preferredSchedule: decryptedContact.preferredSchedule || 'Horario laboral por confirmar',
  };
}

export async function updatePreApplicationInboxStatus(
  idOrFolio: string,
  newStatus: PreApplicationInboxStatus,
  promoterNotes: string | null | undefined,
  actorEmail: string,
  actorRole: UserRole,
  sourceIp: string
): Promise<PreApplicationSummaryItem> {
  if (!['NO_LEIDO', 'LEIDO', 'ATENDIDO'].includes(newStatus)) {
    throw new Error('VALIDATION_ERROR: Estatus de buzón inválido.');
  }

  const res = await db.query<PreAppDbRow>(
    `SELECT * FROM credit_pre_applications WHERE id = $1 OR folio = $1 LIMIT 1`,
    [idOrFolio]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error('NOT_FOUND: Pre-solicitud no encontrada.');
  }

  const nowIso = new Date().toISOString();
  const cleanNotes = String(promoterNotes ?? row.promoter_notes ?? '').trim() || null;
  const attendedBy = newStatus === 'ATENDIDO' ? actorEmail : row.attended_by_email;
  const attendedAt = newStatus === 'ATENDIDO' ? nowIso : row.attended_at;
  const readBy = row.read_by_email || actorEmail;
  const readAt = row.read_at || nowIso;

  await db.transaction(async (tx) => {
    await tx.execute(
      `UPDATE credit_pre_applications
       SET inbox_status = $1,
           promoter_notes = $2,
           read_by_email = $3,
           read_at = $4,
           attended_by_email = $5,
           attended_at = $6
       WHERE id = $7`,
      [newStatus, cleanNotes, readBy, readAt, attendedBy, attendedAt, row.id]
    );

    await auditEventStore.appendInTx(tx, {
      actorEmail,
      actorRole,
      action: 'PRE_APPLICATION_STATUS_UPDATED',
      outcome: 'success',
      sourceIp,
      sourceSummary: 'Buzón Pre-Solicitudes (Actualización de Estatus Operativo)',
      expedienteId: row.folio,
      blindCurpPrefix: row.phone_blind_index.slice(0, 12),
      details: `Folio ${row.folio}: ${row.inbox_status} -> ${newStatus}${cleanNotes ? ` | Nota: ${cleanNotes}` : ''}`,
    });
  });

  const updatedRes = await db.query<PreAppDbRow>(
    `SELECT * FROM credit_pre_applications WHERE id = $1 LIMIT 1`,
    [row.id]
  );
  return mapRowToSummary(updatedRes.rows[0]!);
}

// ==============================================================================
// ENDPOINTS HTTP EXPRESS
// ==============================================================================

preApplicationsRouter.post('/public', async (req: Request, res: Response) => {
  try {
    const sourceIp = extractClientIp(
      req.headers as Record<string, string | string[] | undefined>
    );
    const created = await createPreApplicationInDb(
      req.body as PreApplicationPublicSubmitPayload,
      sourceIp,
      req.headers['user-agent']
    );
    return res.status(201).json({ ok: true, preApplication: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al registrar pre-solicitud';
    if (msg.startsWith('RATE_LIMIT_EXCEEDED:')) {
      return res.status(429).json({
        error: msg.replace('RATE_LIMIT_EXCEEDED: ', ''),
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }
    if (msg.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({
        error: msg.replace('VALIDATION_ERROR: ', ''),
        code: 'VALIDATION_ERROR',
      });
    }
    console.error('Error en POST /api/pre-applications/public:', err);
    return res.status(500).json({ error: 'Error interno al procesar la pre-solicitud.' });
  }
});

preApplicationsRouter.get('/', requireAuth('pre_applications:read'), async (_req: Request, res: Response) => {
  try {
    const overview = await getPreApplicationsInboxOverview();
    return res.json(overview);
  } catch (err: unknown) {
    console.error('Error en GET /api/pre-applications:', err);
    return res.status(500).json({ error: 'Error al consultar el buzón de pre-solicitudes.' });
  }
});

preApplicationsRouter.get('/:id', requireAuth('pre_applications:read'), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const sourceIp = extractClientIp(
      req.headers as Record<string, string | string[] | undefined>
    );
    const detail = await getPreApplicationDetailAndMarkRead(
      String(req.params.id ?? ''),
      auth.user.email,
      auth.user.role,
      sourceIp
    );
    return res.json({ detail });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al abrir detalle';
    if (msg.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ error: msg.replace('NOT_FOUND: ', '') });
    }
    console.error('Error en GET /api/pre-applications/:id:', err);
    return res.status(500).json({ error: 'Error al desencriptar detalle de pre-solicitud.' });
  }
});

preApplicationsRouter.patch(
  '/:id/status',
  requireAuth('pre_applications:manage'),
  async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      const sourceIp = extractClientIp(
        req.headers as Record<string, string | string[] | undefined>
      );
      const updated = await updatePreApplicationInboxStatus(
        String(req.params.id ?? ''),
        req.body.inboxStatus as PreApplicationInboxStatus,
        req.body.promoterNotes,
        auth.user.email,
        auth.user.role,
        sourceIp
      );
      return res.json({ ok: true, item: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar estatus';
      if (msg.startsWith('VALIDATION_ERROR:')) {
        return res.status(400).json({ error: msg.replace('VALIDATION_ERROR: ', '') });
      }
      if (msg.startsWith('NOT_FOUND:')) {
        return res.status(404).json({ error: msg.replace('NOT_FOUND: ', '') });
      }
      console.error('Error en PATCH /api/pre-applications/:id/status:', err);
      return res.status(500).json({ error: 'Error al actualizar el estatus de la pre-solicitud.' });
    }
  }
);
