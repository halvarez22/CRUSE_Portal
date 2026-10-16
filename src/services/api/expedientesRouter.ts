/**
 * ENRUTADOR DE EXPEDIENTES — CRUSE-APO-2026-005 (Bloque A.4)
 */

import { Router, Request, Response } from 'express';
import { ExpedienteItem, ProductId } from '../../types';
import { encryptEnvelope } from '../crypto/cryptoService';
import { getServerKms, computeServerBlindIndex } from '../crypto/serverKeyring';
import { auditEventStore } from '../audit/auditEventStore';
import { maskCurp, extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { db } from '../db/connectionPool';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { handleGetExpedientDetails } from './dashboardRouter';

export const expedientesRouter = Router();

/**
 * Endpoint: Sincronización Segura de Expedientes (Promotores en campo)
 * Aplica Envelope Encryption (AES-GCM-256) y Blind Indexing (HMAC-SHA256).
 */
expedientesRouter.post('/promotores/secure', requireAuth('expedientes:create'), async (req: Request, res: Response) => {
  const ip = extractClientIp(req.headers);
  const ua = req.headers['user-agent'];
  const sourceSummary = buildSourceSummary(ip, ua);

  // Identidad exclusivamente desde la sesión validada (se ignora cualquier promotorEmail del cuerpo)
  const { user } = getAuth(req);
  const actorEmail = user.email;
  const actorRole = user.role;

  const { expediente } = req.body;
  if (!expediente || !expediente.curp) {
    return res.status(400).json({ error: 'Datos de expediente incompletos (CURP requerido)' });
  }

  const rawCurp = String(expediente.curp).trim().toUpperCase();
  const curpMasked = maskCurp(rawCurp);

  // 1. Blind Indexing para búsqueda exacta sin desencriptar
  const blindCurp = await computeServerBlindIndex(rawCurp);

  // 2. Verificar duplicados mediante consulta relacional indexada (Idempotencia)
  const dupCheck = await db.query<{ id: string }>('SELECT id FROM expedientes WHERE blind_curp = ?', [blindCurp]);
  if (dupCheck.rowCount > 0) {
    const existingId = dupCheck.rows[0]!.id;
    await auditEventStore.append({
      actorEmail,
      actorRole,
      action: 'EXPEDIENTE_SYNC',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      curpMasked,
      blindCurpPrefix: blindCurp.slice(0, 16),
      expedienteId: existingId,
      details: 'Expediente ya existente en base de datos relacional (ACK 409 idempotente emitido para autorizar purga local)',
    });

    return res.status(409).json({
      ok: true,
      syncId: `sync_dup_${Date.now()}`,
      expedienteId: existingId,
      message: 'Expediente previamente recibido; autorizado para purga local',
    });
  }

  // 3. Envelope Encryption para la miniatura de control de la INE (OBS-2)
  let encryptedThumbPayload: string | undefined;
  if (expediente.thumbBase64) {
    const encResult = await encryptEnvelope(expediente.thumbBase64, getServerKms());
    encryptedThumbPayload = JSON.stringify(encResult);
  }

  const newExpediente: ExpedienteItem = {
    id: expediente.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    fullName: expediente.fullName || 'Cliente Cruse Nómina',
    curpMasked,
    blindCurp,
    voterId: expediente.voterId,
    address: expediente.address || 'Chihuahua, Chih.',
    phone: expediente.phone || '614-000-0000',
    requestedAmount: Number(expediente.requestedAmount) || 10000,
    termFortnights: Number(expediente.termFortnights) || 24,
    productType: expediente.productType || 'normal',
    status: 'capturado',
    promotorEmail: actorEmail,
    encryptedThumbPayload,
    kekVersion: getServerKms().getCurrentKekVersion(),
  };

  // Inserción en tabla relacional expedientes
  await db.execute(
    `INSERT INTO expedientes (
      id, created_at, updated_at, full_name, curp_masked, blind_curp,
      voter_id, address, phone, requested_amount, term_fortnights,
      product_type, status, promotor_email, encrypted_thumb_payload, kek_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      newExpediente.id,
      newExpediente.createdAt,
      newExpediente.createdAt,
      newExpediente.fullName,
      newExpediente.curpMasked,
      newExpediente.blindCurp,
      newExpediente.voterId ?? null,
      newExpediente.address,
      newExpediente.phone,
      newExpediente.requestedAmount,
      newExpediente.termFortnights,
      newExpediente.productType,
      newExpediente.status,
      newExpediente.promotorEmail,
      newExpediente.encryptedThumbPayload ?? null,
      newExpediente.kekVersion ?? 1,
    ]
  );

  // 4. Registro en Bitácora Forense Inmutable WORM
  await auditEventStore.append({
    actorEmail,
    actorRole,
    action: 'EXPEDIENTE_CREATE',
    outcome: 'success',
    sourceIp: ip,
    sourceSummary,
    curpMasked,
    blindCurpPrefix: blindCurp.slice(0, 16),
    expedienteId: newExpediente.id,
    details: `Expediente registrado en BD relacional ($${newExpediente.requestedAmount.toLocaleString()} MXN a ${newExpediente.termFortnights}q)`,
  });

  return res.json({
    ok: true,
    syncId: `sync_${Date.now()}`,
    expedienteId: newExpediente.id,
    thumbSaved: Boolean(encryptedThumbPayload),
  });
});

/**
 * Endpoint: Lista de Expedientes desde Base de Datos Relacional
 */
expedientesRouter.get('/expedientes', requireAuth('expedientes:list'), async (_req: Request, res: Response) => {
  try {
    const result = await db.query<{
      id: string;
      created_at: string;
      full_name: string;
      curp_masked: string;
      blind_curp: string;
      voter_id: string | null;
      address: string;
      phone: string;
      requested_amount: number;
      term_fortnights: number;
      product_type: string;
      status: string;
      promotor_email: string;
      encrypted_thumb_payload: string | null;
      kek_version: number;
    }>('SELECT * FROM expedientes ORDER BY created_at DESC');

    const expedientes: ExpedienteItem[] = result.rows.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      fullName: r.full_name,
      curpMasked: r.curp_masked,
      blindCurp: r.blind_curp,
      voterId: r.voter_id ?? undefined,
      address: r.address,
      phone: r.phone,
      requestedAmount: Number(r.requested_amount),
      termFortnights: Number(r.term_fortnights),
      productType: r.product_type as ProductId,
      status: r.status as 'capturado' | 'conciliado' | 'aprobado' | 'rechazado',
      promotorEmail: r.promotor_email,
      encryptedThumbPayload: r.encrypted_thumb_payload ?? undefined,
      kekVersion: r.kek_version,
    }));

    return res.json({
      expedientes,
      total: expedientes.length,
    });
  } catch (err) {
    console.error('Error consultando expedientes en BD:', err);
    return res.json({ expedientes: [], total: 0 });
  }
});

// Alias compatible para clientes con ruta previa /api/expedientes/:id/details
expedientesRouter.get('/expedientes/:id/details', requireAuth('dashboard:read_pii'), handleGetExpedientDetails);

