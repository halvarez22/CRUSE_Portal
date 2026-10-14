/**
 * Ampliación tipada de Express.Request con el contexto de autenticación (CRUSE-APO-2026-005 A.3).
 * Poblado exclusivamente por requireAuth() tras validar el token opaco en sessionStore.
 */

import type { AuthContext } from './index';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
