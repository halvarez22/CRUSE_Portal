/**
 * ALMACÉN DE SESIONES OPACAS — CRUSE-APO-2026-005 / CRUSE-APO-2026-023 / CRUSE-APO-2026-028
 *
 * - Tokens de 256 bits (crypto.randomBytes) en base64url; en BD solo se guarda SHA-256(token).
 * - Sesión de 15 min, rotación en refresh y revocación real en logout.
 * - Guardrail Forense 2 (CRUSE-APO-2026-028): `revokeAllUserSessions` opera dentro de la misma
 *   transacción ACID (`TxHandle`) que la baja o modificación del usuario (Kill-Switch sin race conditions).
 * - Guardrail Forense 3 (CRUSE-APO-2026-028): `tempToken` de un solo uso (single-use) estrictamente
 *   vinculado a `userId` para prevenir ataques de replay.
 */

import crypto from 'node:crypto';
import { AuthenticatedUser } from '../../types';
import { db, TxHandle } from '../db/connectionPool';
import { UserRow, toAuthenticatedUser } from './userRepository';
import {
  OPAQUE_TOKEN_BYTES,
  SESSION_TTL_MINUTES,
  PENDING_TOTP_TTL_MINUTES,
  CREDENTIAL_LIMITS,
} from '../../config/authConfig';

const MS_PER_MINUTE = 60_000;

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: string;
}

export interface ResolvedSession {
  sessionId: string;
  user: AuthenticatedUser;
  expiresAt: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function newOpaqueToken(): string {
  return crypto.randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
}

function isPlausibleToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0 && token.length <= CREDENTIAL_LIMITS.opaqueTokenMaxLength;
}

export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]+)$/.exec(header.trim());
  const token = match?.[1];
  return isPlausibleToken(token) ? token : null;
}

export async function createSession(userId: string, tx?: TxHandle): Promise<IssuedSession> {
  const executor = tx ?? db;
  const token = newOpaqueToken();
  const sessionId = `ses_${crypto.randomBytes(12).toString('hex')}`;
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MINUTES * MS_PER_MINUTE).toISOString();
  await executor.execute(
    'INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4, $5);',
    [sessionId, hashToken(token), userId, new Date(now).toISOString(), expiresAt]
  );
  return { token, sessionId, expiresAt };
}

interface SessionJoinRow extends UserRow {
  session_id: string;
  session_expires_at: string | Date;
  session_revoked_at: string | Date | null;
}

export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  if (!isPlausibleToken(token)) return null;
  const res = await db.query<SessionJoinRow>(
    `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires_at, s.revoked_at AS session_revoked_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [hashToken(token)]
  );
  const row = res.rows[0];
  if (!row || row.session_revoked_at !== null || Number(row.active) !== 1) return null;
  const expIso =
    row.session_expires_at instanceof Date
      ? row.session_expires_at.toISOString()
      : String(row.session_expires_at);
  if (Date.parse(expIso) <= Date.now()) return null;
  return { sessionId: row.session_id, user: toAuthenticatedUser(row), expiresAt: expIso };
}

export async function revokeSession(sessionId: string, tx?: TxHandle): Promise<boolean> {
  const executor = tx ?? db;
  const result = await executor.execute(
    'UPDATE sessions SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL;',
    [new Date().toISOString(), sessionId]
  );
  return result.changes > 0;
}

/**
 * Guardrail Forense 2 (CRUSE-APO-2026-028): Kill-Switch atómico de sesiones y desafíos 2FA.
 * Revoca todas las sesiones activas de un usuario y purga cualquier `tempToken` pendiente en `pending_totp`.
 * Acepta `tx: TxHandle` para ejecutarse dentro de la misma transacción ACID que el UPDATE sobre `users`.
 */
export async function revokeAllUserSessions(
  userId: string,
  tx?: TxHandle
): Promise<{ sessionsRevoked: number; pendingChallengesPurged: number }> {
  const executor = tx ?? db;
  const nowIso = new Date().toISOString();
  const revokedRes = await executor.execute(
    'UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL;',
    [nowIso, userId]
  );
  const pendingRes = await executor.execute(
    'DELETE FROM pending_totp WHERE user_id = $1;',
    [userId]
  );
  return {
    sessionsRevoked: revokedRes.changes,
    pendingChallengesPurged: pendingRes.changes,
  };
}

export async function rotateSession(token: string): Promise<{ issued: IssuedSession; user: AuthenticatedUser } | null> {
  const current = await resolveSession(token);
  if (!current) return null;
  const revoked = await revokeSession(current.sessionId);
  if (!revoked) return null;
  const issued = await createSession(current.user.id);
  return { issued, user: current.user };
}

/**
 * Guardrail Forense 3 (CRUSE-APO-2026-028): Emite un `tempToken` de un solo uso vinculado
 * exclusivamente a `userId`, invalidando cualquier desafío previo del mismo usuario.
 */
export async function createPendingTotp(userId: string, tx?: TxHandle): Promise<string> {
  const executor = tx ?? db;
  const token = newOpaqueToken();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PENDING_TOTP_TTL_MINUTES * MS_PER_MINUTE).toISOString();
  await executor.execute('DELETE FROM pending_totp WHERE user_id = $1 OR expires_at <= $2;', [userId, nowIso]);
  await executor.execute('INSERT INTO pending_totp (token_hash, user_id, expires_at) VALUES ($1, $2, $3);', [
    hashToken(token),
    userId,
    expiresAt,
  ]);
  return token;
}

export async function resolvePendingTotp(token: unknown): Promise<string | null> {
  if (!isPlausibleToken(token)) return null;
  const res = await db.query<{ user_id: string; expires_at: string | Date }>(
    'SELECT user_id, expires_at FROM pending_totp WHERE token_hash = $1',
    [hashToken(token)]
  );
  const row = res.rows[0];
  if (!row) return null;
  const expIso = row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at);
  if (Date.parse(expIso) <= Date.now()) {
    await consumePendingTotp(token, row.user_id);
    return null;
  }
  return row.user_id;
}

/**
 * Consume de forma atómica el `tempToken` verificando que pertenezca a `expectedUserId` (si se indica).
 * Retorna `true` únicamente si el token existía y fue eliminado en esta invocación (Single-Use Anti-Replay).
 */
export async function consumePendingTotp(
  token: string,
  expectedUserId?: string,
  tx?: TxHandle
): Promise<boolean> {
  const executor = tx ?? db;
  if (expectedUserId) {
    const res = await executor.execute(
      'DELETE FROM pending_totp WHERE token_hash = $1 AND user_id = $2;',
      [hashToken(token), expectedUserId]
    );
    return res.changes > 0;
  }
  const res = await executor.execute('DELETE FROM pending_totp WHERE token_hash = $1;', [hashToken(token)]);
  return res.changes > 0;
}
