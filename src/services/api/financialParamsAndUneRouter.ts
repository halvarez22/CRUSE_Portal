/**
 * ENRUTADOR DE PARÁMETROS FINANCIEROS DINÁMICOS Y BITÁCORA UNE / REDECO-REUNE
 * Expediente: CRUSE-APO-2026-067 (Guardrail Forense 7 + Hallazgo C.2)
 */

import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { auditEventStore } from '../audit/auditEventStore';
import { db } from '../db/connectionPool';
import {
  getLiveFinancialParameters,
  isEditableFinancialParamKey,
  listEditableFinancialParameters,
  updateFinancialParameterWithAudit,
} from '../config/financialParamsService';

export const financialParamsAndUneRouter = Router();

// GET /api/system-params
financialParamsAndUneRouter.get('/', requireAuth('dashboard:read'), async (_req: Request, res: Response) => {
  try {
    const [parameters, snapshot] = await Promise.all([
      listEditableFinancialParameters(),
      getLiveFinancialParameters(),
    ]);
    return res.json({ ok: true, parameters, snapshot });
  } catch (err) {
    console.error('[SystemParams GET] Error:', err);
    return res.status(500).json({ error: 'Error consultando los parámetros financieros vigentes.' });
  }
});

// PATCH /api/system-params/:key (Exclusivo Dirección / admin)
financialParamsAndUneRouter.patch('/:key', requireAuth('users:manage'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const paramKey = String(req.params.key ?? '').trim().toUpperCase();
    if (!isEditableFinancialParamKey(paramKey)) {
      return res.status(400).json({ error: `El parámetro '${paramKey}' no es editable desde configuración.` });
    }

    const rawValue = req.body?.value;
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
      return res.status(400).json({ error: 'Debes proporcionar el nuevo valor numérico del parámetro.' });
    }

    const sourceIp = extractClientIp(req.headers);
    const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);

    const updated = await updateFinancialParameterWithAudit({
      paramKey,
      newValue: String(rawValue),
      effectiveFrom: typeof req.body?.effectiveFrom === 'string' ? req.body.effectiveFrom : undefined,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp,
      sourceSummary,
    });

    return res.json({ ok: true, parameter: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando parámetro financiero.';
    return res.status(400).json({ error: message });
  }
});

// GET /api/system-params/une-complaints
financialParamsAndUneRouter.get(
  '/une-complaints',
  requireAuth('pld:read'),
  async (_req: Request, res: Response) => {
    try {
      const rows = await db.query<{
        id: string;
        folio_une: string;
        report_channel: string;
        expediente_id: string | null;
        subject_masked_name: string;
        category: string;
        summary_text: string;
        status: string;
        resolution_notes: string | null;
        recorded_by: string;
        created_at: string;
        resolved_at: string | null;
      }>(`SELECT * FROM une_complaints_log ORDER BY created_at DESC LIMIT 100`);
      return res.json({ ok: true, complaints: rows.rows });
    } catch (err) {
      console.error('[UNE GET] Error:', err);
      return res.status(500).json({ error: 'Error consultando bitácora UNE / REDECO-REUNE.' });
    }
  }
);

// POST /api/system-params/une-complaints
financialParamsAndUneRouter.post(
  '/une-complaints',
  requireAuth('pld:read'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);

      const reportChannel =
        req.body?.reportChannel === 'REDECO' || req.body?.reportChannel === 'PRESENCIAL_UNE'
          ? req.body.reportChannel
          : 'REUNE';
      const subjectMaskedName = String(req.body?.subjectMaskedName ?? '').trim();
      const category = String(req.body?.category ?? 'ACLARACION_SALDO').trim();
      const summaryText = String(req.body?.summaryText ?? '').trim();
      const expedienteId =
        typeof req.body?.expedienteId === 'string' && req.body.expedienteId.trim()
          ? req.body.expedienteId.trim()
          : null;

      if (!subjectMaskedName || summaryText.length < 10) {
        return res.status(400).json({
          error: 'Debes indicar el nombre enmascarado del usuario y un resumen de al menos 10 caracteres.',
        });
      }

      const id = `une_${crypto.randomUUID()}`;
      const folioUne = `UNE-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      await db.execute(
        `INSERT INTO une_complaints_log
          (id, folio_une, report_channel, expediente_id, subject_masked_name, category, summary_text, status, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8)`,
        [id, folioUne, reportChannel, expedienteId, subjectMaskedName, category, summaryText, user.email]
      );

      await auditEventStore.append({
        actorEmail: user.email,
        actorRole: user.role,
        action: 'UNE_COMPLAINT_LOGGED',
        outcome: 'success',
        sourceIp,
        sourceSummary,
        expedienteId: expedienteId ?? undefined,
        details: JSON.stringify({ id, folioUne, reportChannel, category }),
      });

      return res.status(201).json({ ok: true, id, folioUne });
    } catch (err) {
      console.error('[UNE POST] Error:', err);
      return res.status(500).json({ error: 'Error registrando folio UNE.' });
    }
  }
);
