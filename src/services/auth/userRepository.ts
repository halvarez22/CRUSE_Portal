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
  phone_number?: string | null;
  password_hash: string;
  totp_secret_enc: string;
  totp_enrolled: number;
  active: number;
  created_at: string;
}

export const USER_ROLES: readonly UserRole[] = ['admin', 'oficial_cumplimiento', 'promotor'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;

let phoneColChecked = false;

export async function ensureUsersPhoneColumn(): Promise<void> {
  if (phoneColChecked) return;
  try {
    const info = await db.query<Record<string, unknown>>('PRAGMA table_info(users);');
    const hasPhone = info.rows.some((r) => String(r.name) === 'phone_number');
    if (!hasPhone) {
      await db.execute('ALTER TABLE users ADD COLUMN phone_number TEXT;');
    }
    phoneColChecked = true;
  } catch {
    // Ignore if already exists
    phoneColChecked = true;
  }
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > CREDENTIAL_LIMITS.emailMaxLength || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const cleaned = raw.replace(/[\s\-()]/g, '');
  const normalized = cleaned.startsWith('+') ? cleaned : `+52${cleaned}`;
  return E164_PHONE_PATTERN.test(normalized) ? normalized : null;
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
  await ensureUsersPhoneColumn();
  const res = await db.query<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  return res.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  await ensureUsersPhoneColumn();
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
  phoneNumber?: string;
}

export interface CreatedUserCredentials {
  user: AuthenticatedUser & { phoneNumber?: string | null };
  /** Secreto TOTP en Base32: se devuelve UNA sola vez al llamador (CLI) y no se persiste en claro. */
  totpSecret: string;
}

/**
 * Alta de usuario: hash scrypt de la contraseña y secreto TOTP cifrado con la KEK vigente.
 */
export async function createUser(input: NewUserInput): Promise<CreatedUserCredentials> {
  await ensureUsersPhoneColumn();
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

  const phoneNumber = input.phoneNumber ? normalizePhone(input.phoneNumber) : null;
  if (input.phoneNumber && !phoneNumber) {
    throw new Error('Teléfono móvil inválido. Usa formato de 10 dígitos o E.164 (+52...).');
  }

  const totpSecret = generateTotpSecret();
  const passwordHash = await hashPassword(input.password);
  const encryptedSecret = await encryptEnvelope(totpSecret, getServerKms());
  const id = `usr_${crypto.randomBytes(12).toString('hex')}`;

  await db.execute(
    `INSERT INTO users (id, email, name, role, phone_number, password_hash, totp_secret_enc, totp_enrolled, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?);`,
    [id, email, name, input.role, phoneNumber, passwordHash, JSON.stringify(encryptedSecret), new Date().toISOString()]
  );

  return {
    user: { id, email, name, role: input.role, totpEnrolled: true, phoneNumber },
    totpSecret,
  };
}

export interface ManagedUserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber: string | null;
  active: boolean;
  createdAt: string;
}

export async function listAllUsers(): Promise<ManagedUserSummary[]> {
  await ensureUsersPhoneColumn();
  const res = await db.query<UserRow>('SELECT * FROM users ORDER BY created_at DESC');
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: isUserRole(r.role) ? r.role : 'promotor',
    phoneNumber: r.phone_number ?? null,
    active: r.active === 1,
    createdAt: r.created_at,
  }));
}

export async function updateManagedUser(
  userId: string,
  updates: { name?: string; role?: UserRole; phoneNumber?: string; active?: boolean; newPassword?: string }
): Promise<void> {
  await ensureUsersPhoneColumn();
  const existing = await findUserById(userId);
  if (!existing) throw new Error('Usuario no encontrado.');

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const role = updates.role !== undefined ? updates.role : (existing.role as UserRole);
  if (!isUserRole(role)) throw new Error('Rol inválido.');

  let phoneNumber = existing.phone_number ?? null;
  if (updates.phoneNumber !== undefined) {
    phoneNumber = updates.phoneNumber.trim() ? normalizePhone(updates.phoneNumber) : null;
    if (updates.phoneNumber.trim() && !phoneNumber) {
      throw new Error('Teléfono móvil inválido. Usa 10 dígitos o +52...');
    }
  }

  const active = updates.active !== undefined ? (updates.active ? 1 : 0) : existing.active;

  if (updates.newPassword && updates.newPassword.trim()) {
    const pwd = updates.newPassword.trim();
    if (pwd.length < CREDENTIAL_LIMITS.passwordMinLength || pwd.length > CREDENTIAL_LIMITS.passwordMaxLength) {
      throw new Error(`La contraseña debe tener entre ${CREDENTIAL_LIMITS.passwordMinLength} y ${CREDENTIAL_LIMITS.passwordMaxLength} caracteres.`);
    }
    const newHash = await hashPassword(pwd);
    await db.execute(
      'UPDATE users SET name = ?, role = ?, phone_number = ?, active = ?, password_hash = ? WHERE id = ?',
      [name, role, phoneNumber, active, newHash, userId]
    );
  } else {
    await db.execute(
      'UPDATE users SET name = ?, role = ?, phone_number = ?, active = ? WHERE id = ?',
      [name, role, phoneNumber, active, userId]
    );
  }
}
