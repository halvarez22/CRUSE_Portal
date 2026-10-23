/**
 * ENRUTADOR DE PREVENCIÓN DE LAVADO DE DINERO (PLD/FT: 69-B SAT / UIF / OFAC / PEPs)
 *
 * @implements CRUSE-APO-2026-027 (Directrices 1, 2, 3 y 4)
 * @implements Regla 3 Anti-God-Object (< 600 líneas) y Regla 6 SQA (tipado estricto)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp } from '../audit/auditMask';
import { PldListType } from '../../types';
import {
  getPldComplianceOverview,
  ingestPldRiskListEntries,
  resolvePldHitAlert,
  runFullPortfolioPldScreening,
} from '../pld/pldScreeningService';

export const pldRouter = Router();

const VALID_LIST_TYPES: ReadonlySet<PldListType> = new Set<PldListType>([
  'SAT_69B_DEFINITIVO',
  'SAT_69B_PRESUNTO',
  'UIF_PERSONAS_BLOQUEADAS',
  'OFAC_SDN',
  'PEP_NACIONAL',
]);

/**
 * GET /api/pld/overview
 * Retorna KPIs, entradas cifradas en listas de riesgo, alertas proyectadas (Single-Pass CTE) y último lote de barrido.
 */
pldRouter.get('/overview', requireAuth('pld:read'), async (_req: Request, res: Response) => {
  try {
    const overview = await getPldComplianceOverview();
    return res.json({
      ok: true,
      ...overview,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error consultando consola PLD/FT';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/pld/lists/ingest
 * Ingiere de forma idempotente un archivo CSV/TXT de lista oficial (69-B SAT / UIF / OFAC / PEPs)
 * calculando sourceFileHash SHA-256 inmediato y aplicando Blind Indexing Zero-PII.
 */
pldRouter.post('/lists/ingest', requireAuth('pld:manage_lists'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);

    const body = req.body as {
      csvContent?: unknown;
      defaultListType?: unknown;
      defaultOfficialReference?: unknown;
    };

    const csvContent = typeof body.csvContent === 'string' ? body.csvContent : '';
    const rawListType = typeof body.defaultListType === 'string' ? body.defaultListType.trim().toUpperCase() : 'SAT_69B_DEFINITIVO';
    const defaultOfficialReference =
      typeof body.defaultOfficialReference === 'string' && body.defaultOfficialReference.trim().length > 0
        ? body.defaultOfficialReference.trim()
        : 'DOF-SAT-69B-2026';

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({ error: 'Se requiere el contenido CSV/TXT de la lista oficial PLD/FT (csvContent).' });
    }

    const defaultListType: PldListType = VALID_LIST_TYPES.has(rawListType as PldListType)
      ? (rawListType as PldListType)
      : 'SAT_69B_DEFINITIVO';

    const result = await ingestPldRiskListEntries({
      csvContent,
      defaultListType,
      defaultOfficialReference,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al ingerir lista PLD/FT';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/pld/screen-portfolio
 * Ejecuta el barrido integral de cartera e inversionistas en Una Sola Pasada CTE y sella el Acta Oficial CNBV/UIF en WORM.
 */
pldRouter.post('/screen-portfolio', requireAuth('pld:screen'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);

    const batch = await runFullPortfolioPldScreening({
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({
      ok: true,
      batch,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error ejecutando barrido integral PLD/FT';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/pld/alerts/:alertId/resolve
 * Emite un dictamen inmutable WORM sobre una alerta PLD/FT (Event-Sourced State Projection).
 */
pldRouter.post('/alerts/:alertId/resolve', requireAuth('pld:resolve_alert'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const alertId = String(req.params.alertId ?? '').trim();

    const body = req.body as {
      resolutionStatus?: unknown;
      justificationNotes?: unknown;
    };

    const rawStatus = typeof body.resolutionStatus === 'string' ? body.resolutionStatus.trim().toUpperCase() : '';
    const justificationNotes = typeof body.justificationNotes === 'string' ? body.justificationNotes : '';

    if (!['CONFIRMED_BLOCKED', 'CLEARED_EDD', 'FALSE_POSITIVE'].includes(rawStatus)) {
      return res.status(400).json({
        error: 'Estado de dictamen inválido. Use CONFIRMED_BLOCKED, CLEARED_EDD o FALSE_POSITIVE.',
      });
    }

    const result = await resolvePldHitAlert({
      alertId,
      resolutionStatus: rawStatus as 'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE',
      justificationNotes,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al registrar dictamen PLD/FT';
    return res.status(400).json({ error: msg });
  }
});
