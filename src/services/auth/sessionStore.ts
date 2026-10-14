/**
 * ALMACÉN DE SESIONES OPACAS — CRUSE-APO-2026-005 (Bloque A.3, decisión Q2)
 *
 * - Tokens de 256 bits (crypto.randomBytes) en base64url; en BD solo se guarda SHA-256(token).
 * - Sesión de 15 min, rotación en refresh y revocación real en logout.
 * - Desafíos 2FA (tempToken) con el mismo esquema en `pending_totp`, TTL de 5 min.
 * - Exclusivo de servidor: NUNCA importar desde componentes React.
 */

import crypto from 'node:crypto';
import { AuthenticatedUser } from '../../types';
import { db } from '../db/connectionPool';
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

/**
 * Extrae el token de la cabecera `Authorization: Bearer <token>`; null si falta o está malformada.
 */
export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]+)$/.exec(header.trim());
  const token = match?.[1];
  return isPlausibleToken(token) ? token : null;
}

export async function createSession(userId: string): Promise<IssuedSession> {
  const token = newOpaqueToken();
  const sessionId = `ses_${crypto.randomBytes(12).toString('hex')}`;
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MINUTES * MS_PER_MINUTE).toISOString();
  await db.execute(
    'INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?);',
    [sessionId, hashToken(token), userId, new Date(now).toISOString(), expiresAt]
  );
  return { token, sessionId, expiresAt };
}

interface SessionJoinRow extends UserRow {
  session_id: string;
  session_expires_at: string;
  session_revoked_at: string | null;
}

/**
 * Resuelve un token: existe, no revocado, no expirado y usuario activo. En otro caso null.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  if (!isPlausibleToken(token)) return null;
  const res = await db.query<SessionJoinRow>(
    `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires_at, s.revoked_at AS session_revoked_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [hashToken(token)]
  );
  const row = res.rows[0];
  if (!row || row.session_revoked_at !== null || row.active !== 1) return null;
  if (Date.parse(row.session_expires_at) <= Date.now()) return null;
  return { sessionId: row.session_id, user: toAuthenticatedUser(row), expiresAt: row.session_expires_at };
}

export async function revokeSession(sessionId: string): Promise<boolean> {
  const result = await db.execute(
    'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL;',
    [new Date().toISOString(), sessionId]
  );
  return result.changes > 0;
}

/**
 * Rotación estricta: el token anterior queda revocado y se emite uno nuevo.
 */
export async function rotateSession(token: string): Promise<{ issued: IssuedSession; user: AuthenticatedUser } | null> {
  const current = await resolveSession(token);
  if (!current) return null;
  const revoked = await revokeSession(current.sessionId);
  if (!revoked) return null; // carrera: otro refresh ya consumió este token
  const issued = await createSession(current.user.id);
  return { issued, user: current.user };
}

// ─── Desafíos 2FA pendientes ──────────────────────────────────────────────────

export async function createPendingTotp(userId: string): Promise<string> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + PENDING_TOTP_TTL_MINUTES * MS_PER_MINUTE).toISOString();
  await db.execute('DELETE FROM pending_totp WHERE expires_at <= ?;', [new Date().toISOString()]);
  await db.execute('INSERT INTO pending_totp (token_hash, user_id, expires_at) VALUES (?, ?, ?);', [
    hashToken(token),
    userId,
    expiresAt,
  ]);
  return token;
}

/** Devuelve el user_id del desafío vigente (sin consumirlo) o null. */
export async function resolvePendingTotp(token: unknown): Promise<string | null> {
  if (!isPlausibleToken(token)) return null;
  const res = await db.query<{ user_id: string; expires_at: string }>(
    'SELECT user_id, expires_at FROM pending_totp WHERE token_hash = ?',
    [hashToken(token)]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await consumePendingTotp(token);
    return null;
  }
  return row.user_id;
}

export async function consumePendingTotp(token: string): Promise<void> {
  await db.execute('DELETE FROM pending_totp WHERE token_hash = ?;', [hashToken(token)]);
}
