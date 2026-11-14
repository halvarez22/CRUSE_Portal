/**
 * ENRUTADOR DE PADRÓN DE ASEGURADORA ($35,000) Y PÓLIZA CONTABLE ASPEL COI
 * Expediente: CRUSE-APO-2026-063 (Caso 5 — Guardrail Forense 5)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp } from '../audit/auditMask';
import {
  generateCoiAccountingPoliza,
  generateInsuranceRosterReport,
} from '../reconciliation/insuranceAndCoiService';

export const insuranceAndCoiRouter = Router();

/**
 * GET /api/insurance-coi/roster
 * Genera el Padrón de Aseguradora ('LISTA SEGUROS DE VIDA admon.xlsx') con Suma Asegurada $35,000.
 */
insuranceAndCoiRouter.get(
  '/roster',
  requireAuth('reconciliation:read'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const report = await generateInsuranceRosterReport({
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
      });
      return res.json({ ok: true, report });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error generando padrón de aseguradora';
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/insurance-coi/poliza
 * Genera la Póliza Contable Aspel COI (1104001001, 4101001001, 2104001001, 4103000001) con Partida Doble estricta.
 */
insuranceAndCoiRouter.get(
  '/poliza',
  requireAuth('reconciliation:read'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const period = typeof req.query.period === 'string' ? req.query.period.trim() : 'ALL';
      const poliza = await generateCoiAccountingPoliza({
        fortnightPeriod: period,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
      });
      return res.json({ ok: true, poliza });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error generando póliza contable Aspel COI';
      return res.status(400).json({ error: message });
    }
  }
);
