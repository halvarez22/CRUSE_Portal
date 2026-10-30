/**
 * ENRUTADOR DE EXPEDIENTES — CRUSE-APO-2026-005 (Bloque A.4) Y CRUSE-APO-2026-042 (Fase 2.3)
 */

import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import {
  CnbvRiskGrade,
  ExpedienteItem,
  OccupationRiskCategory,
  OcrDocumentSourceType,
  OcrValidationStatus,
  ProductId,
  RawLlmOcrStringsOutput,
} from '../../types';
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
import { extractAndEvaluateDocumentZeroPii } from '../ai/ocrDocumentExtractorService';
import { upsertExpedienteComplianceProfile } from '../pld/grayListDirectionWorkflowService';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import {
  approveCibBatchByComplianceOfficer,
  confirmCibBatchUploadToLogicSystems,
  createValidatedCibExportBatch,
  listCibExportBatches,
} from '../pld/cnbvAssistedComplianceService';

export const expedientesRouter = Router();

/**
 * Endpoint Fase 2.3: Extracción OCR Determinista con IA + Validación Mod-10 RENAPO + Matriz de Riesgo Inicial
 * Aplica Purga Criptográfica de Memoria RAM (rawImageBuffer.fill(0)) antes de responder.
 */
expedientesRouter.post(
  '/promotores/ocr-extract',
  requireAuth('expedientes:create'),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        imageBase64?: unknown;
        documentType?: unknown;
        requestedAmountMxn?: unknown;
        termFortnights?: unknown;
        productType?: unknown;
        hubRegion?: unknown;
        fallbackExtractedStrings?: Partial<RawLlmOcrStringsOutput>;
      };

      const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
      const rawDocType = typeof body.documentType === 'string' ? body.documentType : 'INE_FRONT';
      const documentType: OcrDocumentSourceType = (
        ['INE_FRONT', 'INE_BACK', 'PAYSTUB', 'PROOF_OF_ADDRESS'] as const
      ).includes(rawDocType as OcrDocumentSourceType)
        ? (rawDocType as OcrDocumentSourceType)
        : 'INE_FRONT';

      const requestedAmountMxn =
        typeof body.requestedAmountMxn === 'string' || typeof body.requestedAmountMxn === 'number'
          ? String(body.requestedAmountMxn)
          : '25000.00';

      const termDec = sanitizeDecimalString(
        typeof body.termFortnights === 'string' || typeof body.termFortnights === 'number'
          ? String(body.termFortnights)
          : '24',
        '24'
      );

      const rawProd = typeof body.productType === 'string' ? body.productType : 'normal';
      const productType: 'normal' | 'express' | 'especial' =
        rawProd === 'express' || rawProd === 'especial' ? rawProd : 'normal';

      const rawHub = typeof body.hubRegion === 'string' ? body.hubRegion : 'CHIHUAHUA';
      const hubRegion: 'CHIHUAHUA' | 'LEON' | 'CANCUN' | 'OTHER' =
        rawHub === 'LEON' || rawHub === 'CANCUN' || rawHub === 'OTHER' ? rawHub : 'CHIHUAHUA';

      const result = await extractAndEvaluateDocumentZeroPii({
        imageBase64,
        documentType,
        requestedAmountMxn,
        termFortnights: termDec.toNumber(),
        productType,
        hubRegion,
        fallbackExtractedStrings: body.fallbackExtractedStrings,
      });

      return res.json({
        ok: true,
        ...result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error ejecutando motor OCR determinista';
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * Endpoint: Sincronización Segura de Expedientes (Promotores en campo)
 * Aplica Envelope Encryption (AES-GCM-256), Blind Indexing (HMAC-SHA256) y persiste Matriz de Riesgo Inicial.
 */
expedientesRouter.post('/promotores/secure', requireAuth('expedientes:create'), async (req: Request, res: Response) => {
  const ip = extractClientIp(req.headers);
  const ua = req.headers['user-agent'];
  const sourceSummary = buildSourceSummary(ip, ua);

  const { user } = getAuth(req);
  const actorEmail = user.email;
  const actorRole = user.role;

  const { expediente, complianceMeta } = req.body as {
    expediente?: Record<string, unknown>;
    complianceMeta?: {
      documentImageSha256?: string;
      ocrConfidenceScore?: string;
      ocrStatus?: OcrValidationStatus;
      occupationCategory?: OccupationRiskCategory;
      occupationLabel?: string;
      fortnightlyNetIncomeMxn?: string;
      initialTransactionalProfileMxn?: string;
      riskMatrixScore?: string;
      initialRiskGrade?: CnbvRiskGrade;
      requiresDirectionAuthorization?: boolean;
    };
  };

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
  if (typeof expediente.thumbBase64 === 'string' && expediente.thumbBase64.length > 0) {
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

  const reqAmountDec = sanitizeDecimalString(String(expediente.requestedAmount ?? '10000'), '10000');
  const termDec = sanitizeDecimalString(String(expediente.termFortnights ?? '24'), '24');

  const newExpediente: ExpedienteItem = {
    id: (typeof expediente.id === 'string' && expediente.id) || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    convenio: (typeof expediente.convenio === 'string' && expediente.convenio) || 'STSGECH',
    fullName: maskFullName(rawFullName),
    curpMasked,
    blindCurp,
    voterId: typeof expediente.voterId === 'string' ? expediente.voterId : undefined,
    address: 'CIFRADO_ENVELOPE',
    phone: '0000000000',
    requestedAmount: reqAmountDec.toNumber(),
    termFortnights: termDec.toNumber(),
    productType: (expediente.productType as ProductId) || 'normal',
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

  // 7. Fase 2.3 (CRUSE-APO-2026-042): Persistir Perfil de Cumplimiento y Matriz de Riesgo Inicial
  const initialQuotaDec = reqAmountDec
    .dividedBy(termDec.greaterThan(new Decimal('0')) ? termDec : new Decimal('24'))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  await upsertExpedienteComplianceProfile({
    expedienteId: newExpediente.id,
    documentImageSha256: complianceMeta?.documentImageSha256 ?? null,
    ocrConfidenceScore: complianceMeta?.ocrConfidenceScore ?? '96.50',
    ocrStatus: complianceMeta?.ocrStatus ?? 'VALIDATED',
    occupationCategory: complianceMeta?.occupationCategory ?? 'PUBLIC_SERVANT_UNIONIZED',
    occupationLabel:
      complianceMeta?.occupationLabel ?? 'Servidor Público Sindicalizado STSGECH',
    fortnightlyNetIncomeMxn: complianceMeta?.fortnightlyNetIncomeMxn ?? '14500.00',
    initialTransactionalProfileMxn:
      complianceMeta?.initialTransactionalProfileMxn ?? initialQuotaDec.toFixed(2),
    riskMatrixScore:
      complianceMeta?.riskMatrixScore ?? (pldRealtime.hitDetected ? '78.50' : '13.50'),
    initialRiskGrade:
      complianceMeta?.initialRiskGrade ?? (pldRealtime.hitDetected ? 'ALTO' : 'BAJO'),
    requiresDirectionAuthorization:
      Boolean(complianceMeta?.requiresDirectionAuthorization) || pldRealtime.hitDetected,
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
      requested_amount: number | string;
      term_fortnights: number | string;
      product_type: string;
      status: string;
      promotor_email: string;
      encrypted_thumb_payload: string | null;
      encrypted_pii_payload: string | null;
      kek_version: number;
      fortnightly_payment: number | string | null;
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
        const reqAmt = sanitizeDecimalString(String(r.requested_amount), '0').toNumber();
        const fortPay = sanitizeDecimalString(String(r.fortnightly_payment ?? '0'), '0').toNumber();
        const termF = sanitizeDecimalString(String(r.term_fortnights), '24').toNumber();

        if (!canReadPii) {
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
            requestedAmount: reqAmt,
            fortnightlyPayment: fortPay,
            termFortnights: termF,
            productType: r.product_type as ProductId,
            status: r.status as ExpedienteItem['status'],
            promotorEmail: r.promotor_email,
            kekVersion: r.kek_version,
          };
        } else {
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
            requestedAmount: reqAmt,
            fortnightlyPayment: fortPay,
            termFortnights: termF,
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

/**
 * GET /api/cib-batches
 * Punto de Control #4 (FASE 2.4): Consulta el historial de lotes de carga semiautomática CIB / Logic Systems.
 */
expedientesRouter.get('/cib-batches', requireAuth('expedientes:list'), async (_req: Request, res: Response) => {
  try {
    const batches = await listCibExportBatches();
    return res.json({ ok: true, batches });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error consultando lotes CIB';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/cib-batches/generate
 * Paso 1 CIB: Genera un lote pre-validado (`GENERATED_PENDING_OC`) filtrando expedientes con OCR < 80% o bloqueados PLD.
 */
expedientesRouter.post('/cib-batches/generate', requireAuth('expedientes:list'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const result = await createValidatedCibExportBatch({
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generando lote CIB';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/cib-batches/:batchId/approve-oc
 * Paso 2 CIB: El Oficial de Cumplimiento aprueba el lote (`APPROVED_BY_OC`) y sella `CIB_BATCH_VALIDATED` en `audit_events`.
 */
expedientesRouter.post('/cib-batches/:batchId/approve-oc', requireAuth('expedientes:list'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const batchId = String(req.params.batchId ?? '').trim();
    const body = req.body as { ocReviewNotes?: unknown };
    const ocReviewNotes = typeof body.ocReviewNotes === 'string' ? body.ocReviewNotes.trim() : '';

    if (ocReviewNotes.length < 5) {
      return res.status(400).json({
        error: 'Se requieren las notas de revisión del Oficial de Cumplimiento (mínimo 5 caracteres).',
      });
    }

    const batch = await approveCibBatchByComplianceOfficer({
      batchId,
      ocReviewNotes,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });
    return res.json({ ok: true, batch });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error aprobando lote CIB por Oficial de Cumplimiento';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/cib-batches/:batchId/confirm-upload
 * Paso 3 CIB: Registra el folio de carga confirmada en CIB / Logic Systems (`UPLOADED_TO_CIB`).
 */
expedientesRouter.post('/cib-batches/:batchId/confirm-upload', requireAuth('expedientes:list'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const batchId = String(req.params.batchId ?? '').trim();
    const body = req.body as { cibConfirmationFolio?: unknown };
    const cibConfirmationFolio =
      typeof body.cibConfirmationFolio === 'string' ? body.cibConfirmationFolio.trim() : '';

    if (cibConfirmationFolio.length < 4) {
      return res.status(400).json({
        error: 'Ingrese un Folio de Confirmación CIB Logic Systems válido (mínimo 4 caracteres).',
      });
    }

    const batch = await confirmCibBatchUploadToLogicSystems({
      batchId,
      cibConfirmationFolio,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });
    return res.json({ ok: true, batch });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error confirmando carga en CIB Logic Systems';
    return res.status(400).json({ error: msg });
  }
});
