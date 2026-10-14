/**
 * MIDDLEWARE DE AUTENTICACIÓN Y RBAC — CRUSE-APO-2026-005 (Bloque A.3)
 *
 * requireAuth(permission):
 *   - 401 si falta el token o la sesión no existe / expiró / fue revocada.
 *   - 403 + evento ACCESS_DENIED en bitácora WORM si el rol no está autorizado.
 *   - 404 para permisos de solo-desarrollo cuando NODE_ENV=production.
 *   - Puebla req.auth: la identidad del actor proviene EXCLUSIVAMENTE de aquí,
 *     nunca de req.body ni req.params (actorEmail/officerEmail/promotorEmail se ignoran).
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthContext, RbacPermission } from '../../types';
import { isRoleAuthorized, NON_PRODUCTION_ONLY_PERMISSIONS } from '../../config/rbacPolicy';
import { getServerEnv } from '../../config/serverEnv';
import { parseBearer, resolveSession } from './sessionStore';
import { auditEventStore } from '../audit/auditEventStore';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';

export function requireAuth(permission: RbacPermission): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (NON_PRODUCTION_ONLY_PERMISSIONS.has(permission) && getServerEnv().nodeEnv === 'production') {
        return res.status(404).json({ error: 'Recurso no disponible' });
      }

      const token = parseBearer(req.headers.authorization);
      const session = token ? await resolveSession(token) : null;
      if (!session) {
        return res.status(401).json({ error: 'Sesión requerida o expirada. Inicia sesión nuevamente.' });
      }

      if (!isRoleAuthorized(permission, session.user.role)) {
        const ip = extractClientIp(req.headers);
        await auditEventStore.append({
          actorEmail: session.user.email,
          actorRole: session.user.role,
          action: 'ACCESS_DENIED',
          outcome: 'denied',
          sourceIp: ip,
          sourceSummary: buildSourceSummary(ip, req.headers['user-agent']),
          details: `Permiso requerido: ${permission} · ${req.method} ${req.baseUrl}${req.path}`,
        });
        return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
      }

      req.auth = { user: session.user, sessionId: session.sessionId };
      return next();
    } catch (err: unknown) {
      console.error('Error en middleware de autenticación:', err);
      return res.status(500).json({ error: 'Error interno de autenticación' });
    }
  };
}

/**
 * Obtiene el contexto autenticado dentro de un handler protegido por requireAuth.
 * Lanza si se invoca sin el middleware (error de programación, nunca de usuario).
 */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new Error('getAuth() invocado en una ruta sin requireAuth()');
  }
  return req.auth;
}
