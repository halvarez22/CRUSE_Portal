/**
 * ENRUTADOR DE AUDITORÍA FORENSE — CRUSE-APO-2026-005 (Bloque A.4)
 */

import { Router, Request, Response } from 'express';
import { auditEventStore } from '../audit/auditEventStore';
import { requireAuth } from '../auth/authMiddleware';

export const auditRouter = Router();

/**
 * Endpoint: Consulta de Bitácora Forense Inmutable WORM
 */
auditRouter.get('/events', requireAuth('audit:read'), async (req: Request, res: Response) => {
  const { action, actorEmail, limit } = req.query;
  const events = await auditEventStore.list({
    action: action ? String(action) : undefined,
    actorEmail: actorEmail ? String(actorEmail) : undefined,
    limit: limit ? parseInt(String(limit), 10) : 50,
  });
  return res.json({ events, count: events.length });
});

/**
 * Endpoint: Verificación Criptográfica de la Integridad de la Bitácora
 */
auditRouter.get('/verify', requireAuth('audit:read'), async (_req: Request, res: Response) => {
  const result = await auditEventStore.verifyChainIntegrity();
  return res.json(result);
});
