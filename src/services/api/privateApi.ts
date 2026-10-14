/**
 * ORQUESTADOR DE API PRIVADA Y AUTENTICACIÓN 2FA — SERVIDOR
 *
 * Implementa endpoints seguros para:
 * - Autenticación 2FA TOTP con usuarios en BD y sesiones opacas (authRouter, CRUSE-APO-2026-005 A.2/A.3).
 * - Sincronización segura de expedientes con Envelope Encryption y Blind Indexing (OBS-2).
 * - Consulta y verificación criptográfica de la Bitácora Forense WORM de 5 años.
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

export const privateApiRouter = Router();

// Autenticación 2FA (login, verify-totp, refresh, logout)
privateApiRouter.use('/auth', authRouter);

// Sub-enrutador del Dashboard de Administración
privateApiRouter.use('/dashboard', dashboardRouter);

// Sub-enrutador de conciliación quincenal automatizada (Fase 4)
privateApiRouter.use('/reconciliation', reconciliationRouter);

// Sub-enrutador de auditoría forense WORM
privateApiRouter.use('/audit', auditRouter);

// Sub-enrutador de expedientes (promotores/secure, expedientes)
privateApiRouter.use('/', expedientesRouter);
