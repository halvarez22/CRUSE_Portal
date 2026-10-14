/**
 * REPOSITORIO DE USUARIOS INSTITUCIONALES — CRUSE-APO-2026-005 (Bloque A.2)
 *
 * - Contraseñas: solo hash scrypt (passwordHasher).
 * - Secreto TOTP: cifrado con Envelope Encryption (AES-GCM-256, KEK vigente) ANTES de persistir.
 * - Exclusivo de servidor: NUNCA importar desde componentes React.
 */

import crypto from 'node:crypto';
import { AuthenticatedUser, UserRole } from '../../types';
import { db } from '../db/connectionPool';
import { encryptEnvelope, decryptEnvelope, EnvelopeEncryptedPayload } from '../crypto/cryptoService';
import { getServerKms } from '../crypto/serverKeyring';
import { hashPassword } from './passwordHasher';
import { generateTotpSecret } from './totpService';
import { CREDENTIAL_LIMITS } from '../../config/authConfig';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  totp_secret_enc: string;
  totp_enrolled: number;
  active: number;
  created_at: string;
}

export const USER_ROLES: readonly UserRole[] = ['admin', 'oficial_cumplimiento', 'promotor'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > CREDENTIAL_LIMITS.emailMaxLength || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function toAuthenticatedUser(row: UserRow): AuthenticatedUser {
  if (!isUserRole(row.role)) {
    throw new Error(`Rol desconocido en BD para el usuario ${row.id}`);
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    totpEnrolled: row.totp_enrolled === 1,
  };
}

function isEnvelopePayload(value: unknown): value is EnvelopeEncryptedPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === 'number' &&
    typeof v.alg === 'string' &&
    typeof v.kekVersion === 'number' &&
    typeof v.wrappedDek === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.ciphertext === 'string' &&
    typeof v.keyId === 'string'
  );
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const res = await db.query<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  return res.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const res = await db.query<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  return res.rows[0] ?? null;
}

/**
 * Descifra el secreto TOTP del usuario (solo en memoria del servidor, nunca se registra).
 */
export async function decryptTotpSecret(row: UserRow): Promise<string> {
  const parsed: unknown = JSON.parse(row.totp_secret_enc);
  if (!isEnvelopePayload(parsed)) {
    throw new Error(`Secreto TOTP con formato inválido para el usuario ${row.id}`);
  }
  return decryptEnvelope(parsed, getServerKms());
}

export async function markTotpEnrolled(userId: string): Promise<void> {
  await db.execute('UPDATE users SET totp_enrolled = 1 WHERE id = ? AND totp_enrolled = 0', [userId]);
}

export interface NewUserInput {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}

export interface CreatedUserCredentials {
  user: AuthenticatedUser;
  /** Secreto TOTP en Base32: se devuelve UNA sola vez al llamador (CLI) y no se persiste en claro. */
  totpSecret: string;
}

/**
 * Alta de usuario: hash scrypt de la contraseña y secreto TOTP cifrado con la KEK vigente.
 */
export async function createUser(input: NewUserInput): Promise<CreatedUserCredentials> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('Correo electrónico inválido.');
  const name = input.name.trim();
  if (!name || name.length > CREDENTIAL_LIMITS.nameMaxLength) throw new Error('Nombre inválido.');
  if (!isUserRole(input.role)) throw new Error('Rol inválido.');
  if (
    input.password.length < CREDENTIAL_LIMITS.passwordMinLength ||
    input.password.length > CREDENTIAL_LIMITS.passwordMaxLength
  ) {
    throw new Error(`La contraseña debe tener entre ${CREDENTIAL_LIMITS.passwordMinLength} y ${CREDENTIAL_LIMITS.passwordMaxLength} caracteres.`);
  }
  if (await findUserByEmail(email)) throw new Error(`Ya existe un usuario con el correo ${email}.`);

  const totpSecret = generateTotpSecret();
  const passwordHash = await hashPassword(input.password);
  const encryptedSecret = await encryptEnvelope(totpSecret, getServerKms());
  const id = `usr_${crypto.randomBytes(12).toString('hex')}`;

  await db.execute(
    `INSERT INTO users (id, email, name, role, password_hash, totp_secret_enc, totp_enrolled, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?);`,
    [id, email, name, input.role, passwordHash, JSON.stringify(encryptedSecret), new Date().toISOString()]
  );

  return {
    user: { id, email, name, role: input.role, totpEnrolled: false },
    totpSecret,
  };
}
