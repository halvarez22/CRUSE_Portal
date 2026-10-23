/**
 * ENRUTADOR DE CÍRCULO DE CRÉDITO (SIC) — CRUSE-APO-2026-024
 *
 * - Guardrail 2: Trazabilidad WORM (`audit_events` + `credit_bureau_reports`).
 * - Guardrail 3: RBAC/2FA estricto (`requireAuth`) e inyección exclusiva del actor desde `getAuth(req)`.
 * - Guardrail 4: Cero fuga de PII en previsualizaciones, logs o respuestas de error.
 * - Directriz 4: Cero `any` y límite Anti-God-Object (< 600 líneas).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import {
  executeCreditBureauReportWorkflow,
  listCreditBureauCatalogs,
  listHistoricalCreditBureauReports,
  upsertCreditBureauCatalog,
} from '../reconciliation/creditBureauService';
import { CreditBureauPersonScope } from '../../types';

export const creditBureauRouter = Router();

function parseScope(raw: unknown): CreditBureauPersonScope {
  const s = String(raw ?? 'ALL').trim().toUpperCase();
  if (s === 'PF' || s === 'PM') return s;
  return 'ALL';
}

function parseCutoffDateIso(raw: unknown): string {
  const s = String(raw ?? '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  return '2026-10-31';
}

/**
 * GET /api/credit-bureau/catalogs
 * Consulta los catálogos oficiales de Círculo de Crédito en PostgreSQL 16 (RN-06).
 */
creditBureauRouter.get(
  '/catalogs',
  requireAuth('credit_bureau:read'),
  async (_req: Request, res: Response) => {
    try {
      const catalogs = await listCreditBureauCatalogs();
      return res.json({ ok: true, catalogs });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'Error al consultar catálogos oficiales de Círculo de Crédito',
        details: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }
);

/**
 * POST /api/credit-bureau/catalogs
 * Crea o actualiza una clave del catálogo oficial SIC (exclusivo rol 'admin' según RN-06).
 * El actor se extrae estrictamente desde getAuth(req).user.email (Regla A.3).
 */
creditBureauRouter.post(
  '/catalogs',
  requireAuth('credit_bureau:catalogs_manage'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);

      const { catalogGroup, code, description, active } = req.body as Record<string, unknown>;
      if (
        typeof catalogGroup !== 'string' ||
        !catalogGroup.trim() ||
        typeof code !== 'string' ||
        !code.trim() ||
        typeof description !== 'string' ||
        !description.trim()
      ) {
        return res.status(400).json({
          error: 'Parámetros inválidos: se requiere catalogGroup, code y description.',
        });
      }

      const item = await upsertCreditBureauCatalog({
        catalogGroup,
        code,
        description,
        active: active !== false,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
        sourceSummary,
      });

      return res.json({ ok: true, catalog: item });
    } catch (err: unknown) {
      return res.status(400).json({
        error: 'No se pudo actualizar el catálogo de Círculo de Crédito',
        details: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }
);

/**
 * GET /api/credit-bureau/reports
 * Lista el historial inmutable (WORM) de lotes mensuales generados en credit_bureau_reports.
 */
creditBureauRouter.get(
  '/reports',
  requireAuth('credit_bureau:read'),
  async (_req: Request, res: Response) => {
    try {
      const reports = await listHistoricalCreditBureauReports();
      return res.json({ ok: true, reports });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'Error al consultar historial de reportes SIC',
        details: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }
);

/**
 * POST /api/credit-bureau/preview
 * Genera la previsualización determinista enmascarada (Zero-PII) y registra el hash SHA-256 en audit_events.
 */
creditBureauRouter.post(
  '/preview',
  requireAuth('credit_bureau:generate'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);
      const body = (req.body ?? {}) as Record<string, unknown>;

      const result = await executeCreditBureauReportWorkflow({
        cutoffDateIso: parseCutoffDateIso(body.cutoffDate),
        scope: parseScope(body.scope),
        commitSeal: false,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
        sourceSummary,
      });

      return res.json({ ok: true, result });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'Fallo al previsualizar el corte de Círculo de Crédito',
        details: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }
);

/**
 * POST /api/credit-bureau/generate
 * Sella en firme el reporte oficial en credit_bureau_reports + credit_bureau_report_details + audit_events
 * y entrega el layout 001496_MICROFINANCIERACRUSE_YYYYMMDD para descarga autorizada.
 */
creditBureauRouter.post(
  '/generate',
  requireAuth('credit_bureau:generate'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);
      const body = (req.body ?? {}) as Record<string, unknown>;

      const result = await executeCreditBureauReportWorkflow({
        cutoffDateIso: parseCutoffDateIso(body.cutoffDate),
        scope: parseScope(body.scope),
        commitSeal: true,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
        sourceSummary,
      });

      return res.json({ ok: true, result });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'Fallo al generar y sellar el reporte oficial de Círculo de Crédito',
        details: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }
);
