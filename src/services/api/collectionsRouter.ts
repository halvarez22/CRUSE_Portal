/**
 * ENRUTADOR DE COBRANZA EXTRAJUDICIAL, CONGELAMIENTO DE MORA, SUSPENSIONES Y REESTRUCTURAS N-A-1
 * Expediente: CRUSE-APO-2026-025 (RN-05, RN-07, RN-08, RN-10, RN-11)
 *
 * - RBAC/2FA estricto (`requireAuth`) e inyección exclusiva del actor desde `getAuth(req)`.
 * - Directriz 4: Zero-PII absoluto en payloads de respuesta y manejo de errores.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import {
  executeLoanRestructure,
  listPortfolioRiskAndCollections,
  registerSuspensionOrAgreement,
} from '../reconciliation/collectionsAndAgreementsService';
import { SuspensionOrFreezeReason } from '../../types';

export const collectionsRouter = Router();

const VALID_REASONS: ReadonlySet<SuspensionOrFreezeReason> = new Set<SuspensionOrFreezeReason>([
  'LICENCIA_SIN_GOCE',
  'BAJA_LABORAL',
  'COBRANZA_EXTRAJUDICIAL',
  'DEMANDA_JUDICIAL',
  'CONVENIO_EXTRAJUDICIAL',
]);

function parseSuspensionReason(raw: unknown): SuspensionOrFreezeReason {
  const s = String(raw ?? 'COBRANZA_EXTRAJUDICIAL').trim().toUpperCase() as SuspensionOrFreezeReason;
  return VALID_REASONS.has(s) ? s : 'COBRANZA_EXTRAJUDICIAL';
}

/**
 * GET /api/collections/portfolio
 * Retorna el portafolio con proyección de estado (CTE) y enmascaramiento Zero-PII (Directriz 1 y 4).
 */
collectionsRouter.get(
  '/portfolio',
  requireAuth('collections:read'),
  async (_req: Request, res: Response) => {
    try {
      const data = await listPortfolioRiskAndCollections();
      res.status(200).json(data);
    } catch {
      res.status(500).json({ error: 'Error al proyectar el portafolio de cobranza y riesgo.' });
    }
  }
);

/**
 * POST /api/collections/suspension
 * Registra congelamiento de mora (`RN-05`), convenio extrajudicial (`RN-07`) o suspensión/reactivación por licencia (`RN-10`),
 * sincronizando atómicamente la póliza de seguro de vida (`RN-08`, Directriz 3).
 */
collectionsRouter.post(
  '/suspension',
  requireAuth('collections:manage'),
  async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const loanAccountId = String(body.loanAccountId ?? '').trim();
      const action = String(body.action ?? 'SUSPEND_OR_FREEZE').trim().toUpperCase() === 'REACTIVATE'
        ? 'REACTIVATE'
        : 'SUSPEND_OR_FREEZE';
      const reason = parseSuspensionReason(body.reason);
      const startPeriod = String(body.startPeriod ?? '2026-Q20').trim().slice(0, 15);
      const endPeriod = body.endPeriod ? String(body.endPeriod).trim().slice(0, 15) : null;
      const agreementNotes = String(body.agreementNotes ?? '').trim().slice(0, 500);

      if (!loanAccountId) {
        res.status(400).json({ error: 'El identificador de la cuenta de crédito (loanAccountId) es obligatorio.' });
        return;
      }

      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);

      const result = await registerSuspensionOrAgreement({
        loanAccountId,
        action,
        reason,
        startPeriod,
        endPeriod,
        agreementNotes,
        actorEmail: auth.user.email,
        actorRole: auth.user.role,
        sourceIp,
        sourceSummary,
      });

      res.status(200).json({ ok: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar suspensión o congelamiento.';
      res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/collections/restructure
 * Ejecuta una reestructura N-a-1 (1 hasta 4 créditos NOMINA_NORMAL hacia 1 nuevo contrato),
 * bloqueando créditos EXPRESS (`RN-11`, Directriz 2).
 */
collectionsRouter.post(
  '/restructure',
  requireAuth('restructures:execute'),
  async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const expedienteId = String(body.expedienteId ?? '').trim();
      const rawPrevIds = Array.isArray(body.previousLoanIds) ? body.previousLoanIds : [];
      const previousLoanIds = rawPrevIds.map((item) => String(item ?? '').trim()).filter(Boolean);
      const newPrincipalAmount = Number(body.newPrincipalAmount ?? 0);
      const newTermFortnights = Number(body.newTermFortnights ?? 24);
      const firstDeductionPeriod = String(body.firstDeductionPeriod ?? '2026-Q21').trim().slice(0, 15);
      const paymentFrequency =
        String(body.paymentFrequency ?? 'QUINCENAL').trim().toUpperCase() === 'MENSUAL'
          ? 'MENSUAL'
          : 'QUINCENAL';
      const notes = body.notes ? String(body.notes).trim().slice(0, 500) : '';

      if (!expedienteId || previousLoanIds.length === 0) {
        res.status(400).json({
          error: 'Se requiere expedienteId y al menos un crédito origen (previousLoanIds) para ejecutar la reestructura.',
        });
        return;
      }

      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);

      const result = await executeLoanRestructure({
        expedienteId,
        previousLoanIds,
        newPrincipalAmount,
        newTermFortnights,
        firstDeductionPeriod,
        paymentFrequency,
        notes,
        actorEmail: auth.user.email,
        actorRole: auth.user.role,
        sourceIp,
        sourceSummary,
      });

      res.status(200).json({ ok: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar la reestructura N-a-1.';
      res.status(400).json({ error: msg });
    }
  }
);
