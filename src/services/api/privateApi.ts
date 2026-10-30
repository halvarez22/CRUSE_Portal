/**
 * ORQUESTADOR DE API PRIVADA Y AUTENTICACIÓN 2FA — SERVIDOR
 *
 * Implementa endpoints seguros para:
 * - Autenticación 2FA SMS con usuarios en BD y sesiones opacas (authRouter, CRUSE-APO-2026-005 / CRUSE-APO-2026-030).
 * - Sincronización segura de expedientes con Envelope Encryption y Blind Indexing (OBS-2).
 * - Consulta y verificación criptográfica de la Bitácora Forense WORM de 5 años.
 * - Servicios 3FN v4 (CRUSE-APO-2026-021): Desglose Manual RN-13, Crédito Especial RN-01, Notas RN-02/RN-04 y Fondeo RN-09/RN-10/RN-11.
 *
 * Regla de identidad (A.3): todo endpoint privado exige requireAuth(permiso) y el actor
 * proviene exclusivamente de req.auth; nunca de req.body ni de req.params.
 */

import { Router } from 'express';
import { authRouter } from './authRouter';
import { reconciliationRouter } from './reconciliationRouter';
import { expedientesRouter } from './expedientesRouter';
import { auditRouter } from './auditRouter';
import { dashboardRouter } from './dashboardRouter';
import { usersRouter } from './usersRouter';
import { specialCreditAndNotesRouter } from './specialCreditAndNotesRouter';
import { fundingRouter } from './fundingRouter';
import { creditBureauRouter } from './creditBureauRouter';
import { collectionsRouter } from './collectionsRouter';
import { pldRouter } from './pldRouter';
import { executiveRouter } from './executiveRouter';
import { preApplicationsRouter } from './preApplicationsRouter';

export const privateApiRouter = Router();

// Autenticación 2FA (login, verify-totp, refresh, logout)
privateApiRouter.use('/auth', authRouter);

// Sub-enrutador del Dashboard de Administración
privateApiRouter.use('/dashboard', dashboardRouter);

// Sub-enrutador de conciliación quincenal automatizada y desglose manual (RN-13)
privateApiRouter.use('/reconciliation', reconciliationRouter);

// Sub-enrutador de auditoría forense WORM
privateApiRouter.use('/audit', auditRouter);

// Sub-enrutador de administración de usuarios y accesos 2FA
privateApiRouter.use('/users', usersRouter);

// Sub-enrutador de fondeo e inversionistas 3FN v4 (RN-09, RN-10, RN-11)
privateApiRouter.use('/funding', fundingRouter);

// Sub-enrutador de Círculo de Crédito SIC y Catálogos Oficiales (CRUSE-APO-2026-024: RN-05, RN-06)
privateApiRouter.use('/credit-bureau', creditBureauRouter);
privateApiRouter.use('/collections', collectionsRouter);
privateApiRouter.use('/pld', pldRouter);
privateApiRouter.use('/executive', executiveRouter);
privateApiRouter.use('/pre-applications', preApplicationsRouter);

// Sub-enrutador de línea abierta Crédito Especial (RN-01) y Block de Notas (RN-02, RN-04)
privateApiRouter.use('/', specialCreditAndNotesRouter);

// Sub-enrutador de expedientes (promotores/secure, expedientes)
privateApiRouter.use('/', expedientesRouter);
