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
import { isRoleAuthorized } from '../../config/rbacPolicy';
import { handleGetExpedientDetails, decryptExpedientePiiIfAuthorized } from './dashboardRouter';
import { maskFullName } from '../etl/runETL';
import { screenSingleSubjectInRealtime } from '../pld/pldScreeningService';

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
  const dupCheck = await db.query<{ id: string }>('SELECT id FROM expedientes WHERE blind_curp = $1', [blindCurp]);
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

  const kms = getServerKms();

  // 3. Envelope Encryption para la miniatura de control de la INE (OBS-2)
  let encryptedThumbPayload: string | undefined;
  if (expediente.thumbBase64) {
    const encResult = await encryptEnvelope(expediente.thumbBase64, kms);
    encryptedThumbPayload = JSON.stringify(encResult);
  }

  // 4. Envelope Encryption para PII en reposo (CRUSE-APO-2026-015)
  const rawFullName = String(expediente.fullName || 'Cliente Cruse Nómina').trim();
  const rawAddress = String(expediente.address || 'Chihuahua, Chih.').trim();
  const rawPhone = String(expediente.phone || '614-000-0000').trim();
  const piiEnvelope = await encryptEnvelope(
    JSON.stringify({
      fullName: rawFullName,
      curp: rawCurp,
      rfc: 'NO REGISTRADO EN EXPEDIENTE',
      voterId: expediente.voterId || 'NO REGISTRADO',
      address: rawAddress,
      phone: rawPhone,
    }),
    kms
  );
  const encryptedPiiPayload = JSON.stringify(piiEnvelope);

  const newExpediente: ExpedienteItem = {
    id: expediente.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    convenio: expediente.convenio || 'STSGECH',
    fullName: maskFullName(rawFullName),
    curpMasked,
    blindCurp,
    voterId: expediente.voterId,
    address: 'CIFRADO_ENVELOPE',
    phone: '0000000000',
    requestedAmount: Number(expediente.requestedAmount) || 10000,
    termFortnights: Number(expediente.termFortnights) || 24,
    productType: expediente.productType || 'normal',
    status: 'capturado',
    promotorEmail: actorEmail,
    encryptedThumbPayload,
    encryptedPiiPayload,
    kekVersion: kms.getCurrentKekVersion(),
  };

  // Inserción en tabla relacional expedientes (Zero-PII en claro en disco)
  await db.execute(
    `INSERT INTO expedientes (
      id, created_at, updated_at, convenio, full_name, curp_masked, blind_curp,
      voter_id, address, phone, requested_amount, term_fortnights,
      product_type, status, promotor_email, encrypted_thumb_payload, encrypted_pii_payload, kek_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);`,
    [
      newExpediente.id,
      newExpediente.createdAt,
      newExpediente.createdAt,
      newExpediente.convenio,
      newExpediente.fullName,
      newExpediente.curpMasked,
      newExpediente.blindCurp,
      null,
      newExpediente.address,
      newExpediente.phone,
      newExpediente.requestedAmount,
      newExpediente.termFortnights,
      newExpediente.productType,
      newExpediente.status,
      newExpediente.promotorEmail,
      newExpediente.encryptedThumbPayload ?? null,
      newExpediente.encryptedPiiPayload ?? null,
      newExpediente.kekVersion ?? 1,
    ]
  );

  // 5. Registro en Bitácora Forense Inmutable WORM
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
    details: `Expediente registrado en BD relacional con PII cifrada AES-GCM-256 ($${newExpediente.requestedAmount.toLocaleString()} MXN a ${newExpediente.termFortnights}q)`,
  });

  // 6. Directriz 1 (CRUSE-APO-2026-027): Guardia preventiva PLD/FT en tiempo real con Zero-Information Leakage.
  const pldRealtime = await screenSingleSubjectInRealtime({
    expedienteId: newExpediente.id,
    blindCurp,
    curpMasked,
    maskedName: newExpediente.fullName,
    requestedAmount: newExpediente.requestedAmount,
    actorEmail,
    actorRole,
    sourceIp: ip,
  });

  return res.status(201).json({
    ok: true,
    success: true,
    syncId: `sync_${Date.now()}`,
    expedienteId: newExpediente.id,
    pldAlertTriggered: pldRealtime.hitDetected,
    thumbSaved: Boolean(encryptedThumbPayload),
  });
});

/**
 * Endpoint: Lista de Expedientes desde Base de Datos Relacional
 * Condición 3 (CRUSE-APO-2026-015): Desencripta PII condicionalmente si el rol posee dashboard:read_pii.
 */
expedientesRouter.get('/expedientes', requireAuth('expedientes:list'), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const canReadPii = isRoleAuthorized('dashboard:read_pii', auth.user.role);

    const result = await db.query<{
      id: string;
      created_at: string;
      convenio: string | null;
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
      encrypted_pii_payload: string | null;
      kek_version: number;
      fortnightly_payment: number | null;
    }>(`
      SELECT
        e.*,
        l.fortnightly_payment
      FROM expedientes e
      LEFT JOIN loan_accounts l ON e.id = l.expediente_id
      ORDER BY e.created_at DESC, e.id DESC
    `);

    const expedientes: ExpedienteItem[] = await Promise.all(
      result.rows.map(async (r) => {
        if (!canReadPii) {
          // Retornar solo curp_masked y full_name (ya enmascarado en BD)
          return {
            id: r.id,
            createdAt: r.created_at,
            convenio: r.convenio || 'STSGECH',
            fullName: r.full_name,
            curpMasked: r.curp_masked,
            blindCurp: r.blind_curp,
            voterId: r.voter_id ?? undefined,
            address: r.address,
            phone: r.phone,
            requestedAmount: Number(r.requested_amount),
            fortnightlyPayment: Number(r.fortnightly_payment ?? 0),
            termFortnights: Number(r.term_fortnights),
            productType: r.product_type as ProductId,
            status: r.status as ExpedienteItem['status'],
            promotorEmail: r.promotor_email,
            kekVersion: r.kek_version,
          };
        } else {
          // Ejecutar decryptEnvelope(encrypted_pii_payload, kms) y retornar datos completos
          const decrypted = await decryptExpedientePiiIfAuthorized(r.encrypted_pii_payload, true);
          const unmaskedName = decrypted?.fullName || r.full_name;
          const unmaskedCurp = decrypted?.curp || r.curp_masked;

          return {
            id: r.id,
            createdAt: r.created_at,
            convenio: r.convenio || 'STSGECH',
            fullName: unmaskedName,
            curpMasked: unmaskedCurp,
            curp: unmaskedCurp,
            blindCurp: r.blind_curp,
            voterId: decrypted?.voterId ?? r.voter_id ?? undefined,
            address: decrypted?.address || r.address,
            phone: decrypted?.phone || r.phone,
            requestedAmount: Number(r.requested_amount),
            fortnightlyPayment: Number(r.fortnightly_payment ?? 0),
            termFortnights: Number(r.term_fortnights),
            productType: r.product_type as ProductId,
            status: r.status as ExpedienteItem['status'],
            promotorEmail: r.promotor_email,
            kekVersion: r.kek_version,
          };
        }
      })
    );

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


