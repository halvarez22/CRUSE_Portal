/**
 * REPOSITORIO DE USUARIOS INSTITUCIONALES — CRUSE-APO-2026-005 / 023 / 028
 *
 * - Contraseñas: solo hash scrypt (passwordHasher).
 * - Secreto TOTP: cifrado con Envelope Encryption (AES-GCM-256, KEK vigente) ANTES de persistir.
 * - Códigos de recuperación: solo hashes SHA-256 en `backup_codes_hash` (nunca en texto plano).
 * - Guardrail Forense 1 (CRUSE-APO-2026-028): Usuarios nacen con `totp_enrolled = 0` y
 *   `must_change_password = 1` con contraseña temporal criptográfica Out-of-Band.
 * - Guardrail Forense 2 (CRUSE-APO-2026-028): Actualización de estado/rol/credenciales y
 *   `revokeAllUserSessions` se ejecutan dentro de la misma transacción ACID (`db.transaction`).
 * - Guardrail Forense 3 (CRUSE-APO-2026-028): `resetTotp` sobrescribe `totp_secret_enc`,
 *   purga y reemplaza `backup_codes_hash`, restablece `totp_enrolled = 0` y revoca sesiones.
 * - Guardrail Forense 4 (CRUSE-APO-2026-028): Construye el diferencial forense `before`/`after`.
 */

import crypto from 'node:crypto';
import {
  AuthenticatedUser,
  TotpEnrollment,
  UserRole,
  UserUpdateAuditDiff,
  UserUpdateFieldDiff,
} from '../../types';
import { db, TxHandle } from '../db/connectionPool';
import { encryptEnvelope, decryptEnvelope, EnvelopeEncryptedPayload } from '../crypto/cryptoService';
import { getServerKms } from '../crypto/serverKeyring';
import { hashPassword } from './passwordHasher';
import { generateTotpSecret, generateTotpUri, generateRecoveryCodes } from './totpService';
import { revokeAllUserSessions } from './sessionStore';
import { CREDENTIAL_LIMITS, TEMP_PASSWORD_BYTES, TOTP_ISSUER } from '../../config/authConfig';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  phone_number?: string | null;
  password_hash: string;
  totp_secret_enc: string;
  backup_codes_hash?: string | null;
  totp_enrolled: number;
  must_change_password?: number | null;
  active: number;
  created_at: string;
}

export const USER_ROLES: readonly UserRole[] = ['admin', 'oficial_cumplimiento', 'promotor'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;

let schemaColsChecked = false;

export async function ensureUsersPhoneColumn(): Promise<void> {
  if (schemaColsChecked) return;
  const statements = db.isPostgres()
    ? [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes_hash TEXT;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0;',
      ]
    : [
        'ALTER TABLE users ADD COLUMN phone_number TEXT;',
        'ALTER TABLE users ADD COLUMN backup_codes_hash TEXT;',
        'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;',
      ];

  for (const sql of statements) {
    try {
      await db.execute(sql);
    } catch {
      // La columna ya existe en SQLite.
    }
  }
  schemaColsChecked = true;
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

export function maskPhoneForAudit(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length <= 6) return '***';
  return `${phone.slice(0, 4)}****${phone.slice(-4)}`;
}

export function generateCryptographicTempPassword(): string {
  return `${crypto.randomBytes(TEMP_PASSWORD_BYTES).toString('base64url')}!A9`;
}

export function hashRecoveryCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(clean, 'utf8').digest('hex');
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
    totpEnrolled: Number(row.totp_enrolled) === 1,
    mustChangePassword: Number(row.must_change_password ?? 0) === 1,
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
  const res = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0] ?? null;
}

export async function findUserById(id: string, tx?: TxHandle): Promise<UserRow | null> {
  await ensureUsersPhoneColumn();
  const executor = tx ?? db;
  const res = await executor.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function decryptTotpSecret(row: UserRow): Promise<string> {
  const parsed: unknown = JSON.parse(row.totp_secret_enc);
  if (!isEnvelopePayload(parsed)) {
    throw new Error(`Secreto TOTP con formato inválido para el usuario ${row.id}`);
  }
  return decryptEnvelope(parsed, getServerKms());
}

export async function markTotpEnrolled(
  userId: string,
  newPasswordHash?: string,
  tx?: TxHandle
): Promise<void> {
  const executor = tx ?? db;
  if (newPasswordHash) {
    await executor.execute(
      'UPDATE users SET totp_enrolled = 1, password_hash = $1, must_change_password = 0 WHERE id = $2',
      [newPasswordHash, userId]
    );
  } else {
    await executor.execute('UPDATE users SET totp_enrolled = 1 WHERE id = $1', [userId]);
  }
}

export async function verifyAndConsumeBackupCode(
  userId: string,
  candidateCode: string,
  tx?: TxHandle
): Promise<boolean> {
  await ensureUsersPhoneColumn();
  const executor = tx ?? db;
  const row = await findUserById(userId, tx);
  if (!row || !row.backup_codes_hash) return false;

  let storedHashes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.backup_codes_hash);
    if (Array.isArray(parsed)) {
      storedHashes = parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    return false;
  }

  if (storedHashes.length === 0) return false;
  const candidateHash = hashRecoveryCode(candidateCode);
  const candidateBuf = Buffer.from(candidateHash, 'utf8');

  let matchedIndex = -1;
  for (let i = 0; i < storedHashes.length; i++) {
    const storedBuf = Buffer.from(storedHashes[i]!, 'utf8');
    if (storedBuf.length === candidateBuf.length && crypto.timingSafeEqual(storedBuf, candidateBuf)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) return false;

  const remainingHashes = storedHashes.filter((_, idx) => idx !== matchedIndex);
  await executor.execute('UPDATE users SET backup_codes_hash = $1 WHERE id = $2', [
    JSON.stringify(remainingHashes),
    userId,
  ]);
  return true;
}

export interface NewUserInput {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
  phoneNumber?: string;
  mustChangePassword?: boolean;
}

export interface CreatedUserCredentials {
  user: AuthenticatedUser & { phoneNumber?: string | null };
  totpSecret: string;
  recoveryCodes: string[];
  initialPassword: string;
}

export async function createUser(input: NewUserInput): Promise<CreatedUserCredentials> {
  await ensureUsersPhoneColumn();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('Correo electrónico inválido.');
  const name = input.name.trim();
  if (!name || name.length > CREDENTIAL_LIMITS.nameMaxLength) throw new Error('Nombre inválido.');
  if (!isUserRole(input.role)) throw new Error('Rol inválido.');

  const initialPassword =
    input.password && input.password.trim().length > 0
      ? input.password.trim()
      : generateCryptographicTempPassword();

  if (
    initialPassword.length < CREDENTIAL_LIMITS.passwordMinLength ||
    initialPassword.length > CREDENTIAL_LIMITS.passwordMaxLength
  ) {
    throw new Error(
      `La contraseña debe tener entre ${CREDENTIAL_LIMITS.passwordMinLength} y ${CREDENTIAL_LIMITS.passwordMaxLength} caracteres.`
    );
  }
  if (await findUserByEmail(email)) throw new Error(`Ya existe un usuario con el correo ${email}.`);

  const phoneNumber = input.phoneNumber ? normalizePhone(input.phoneNumber) : null;
  if (input.phoneNumber && !phoneNumber) {
    throw new Error('Teléfono móvil inválido. Usa formato de 10 dígitos o E.164 (+52...).');
  }

  const totpSecret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes(8);
  const backupCodesHash = JSON.stringify(recoveryCodes.map(hashRecoveryCode));
  const passwordHash = await hashPassword(initialPassword);
  const encryptedSecret = await encryptEnvelope(totpSecret, getServerKms());
  const id = `usr_${crypto.randomBytes(12).toString('hex')}`;
  const mustChangeFlag = input.mustChangePassword === false ? 0 : 1;

  await db.execute(
    `INSERT INTO users (
       id, email, name, role, phone_number, password_hash,
       totp_secret_enc, backup_codes_hash, totp_enrolled, must_change_password, active, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 1, $10);`,
    [
      id,
      email,
      name,
      input.role,
      phoneNumber,
      passwordHash,
      JSON.stringify(encryptedSecret),
      backupCodesHash,
      mustChangeFlag,
      new Date().toISOString(),
    ]
  );

  return {
    user: {
      id,
      email,
      name,
      role: input.role,
      totpEnrolled: false,
      mustChangePassword: mustChangeFlag === 1,
      phoneNumber,
    },
    totpSecret,
    recoveryCodes,
    initialPassword,
  };
}

export interface ManagedUserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber: string | null;
  totpEnrolled: boolean;
  mustChangePassword: boolean;
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
    totpEnrolled: Number(r.totp_enrolled) === 1,
    mustChangePassword: Number(r.must_change_password ?? 0) === 1,
    active: Number(r.active) === 1,
    createdAt: String(r.created_at),
  }));
}

export interface UpdateManagedUserInput {
  name?: string;
  role?: UserRole;
  phoneNumber?: string;
  active?: boolean;
  newPassword?: string;
  generateTemporaryPassword?: boolean;
  resetTotp?: boolean;
}

export interface UpdateManagedUserResult {
  auditDiff: UserUpdateAuditDiff;
  newTotpEnrollment?: TotpEnrollment;
  newRecoveryCodes?: string[];
  generatedTemporaryPassword?: string;
}

export async function updateManagedUser(
  userId: string,
  updates: UpdateManagedUserInput,
  actorId?: string
): Promise<UpdateManagedUserResult> {
  await ensureUsersPhoneColumn();

  // Pre-computar primitivas criptográficas asíncronas (scrypt / AES-GCM-256)
  let generatedTemporaryPassword: string | undefined;
  let newPasswordHash: string | undefined;
  if (updates.generateTemporaryPassword) {
    generatedTemporaryPassword = generateCryptographicTempPassword();
    newPasswordHash = await hashPassword(generatedTemporaryPassword);
  } else if (updates.newPassword && updates.newPassword.trim()) {
    const pwd = updates.newPassword.trim();
    if (pwd.length < CREDENTIAL_LIMITS.passwordMinLength || pwd.length > CREDENTIAL_LIMITS.passwordMaxLength) {
      throw new Error(
        `La contraseña debe tener entre ${CREDENTIAL_LIMITS.passwordMinLength} y ${CREDENTIAL_LIMITS.passwordMaxLength} caracteres.`
      );
    }
    newPasswordHash = await hashPassword(pwd);
  }

  let newTotpSecret: string | undefined;
  let newTotpSecretEncJson: string | undefined;
  let newRecoveryCodes: string[] | undefined;
  let newBackupCodesHashJson: string | undefined;

  if (updates.resetTotp) {
    newTotpSecret = generateTotpSecret();
    const enc = await encryptEnvelope(newTotpSecret, getServerKms());
    newTotpSecretEncJson = JSON.stringify(enc);
    newRecoveryCodes = generateRecoveryCodes(8);
    newBackupCodesHashJson = JSON.stringify(newRecoveryCodes.map(hashRecoveryCode));
  }

  // Guardrail Forense 2: Transacción ACID atómica que actualiza `users` y ejecuta `revokeAllUserSessions`
  return db.transaction(async (tx) => {
    const existing = await findUserById(userId, tx);
    if (!existing) throw new Error('Usuario no encontrado.');

    if (actorId && actorId === userId) {
      if (updates.active === false) {
        throw new Error(
          'Operación prohibida: un administrador no puede suspender o dar de baja su propia cuenta (SELF_SUSPENSION_FORBIDDEN).'
        );
      }
      if (updates.role !== undefined && updates.role !== existing.role) {
        throw new Error(
          'Operación prohibida: un administrador no puede degradar o cambiar su propio rol institucional (SELF_ROLE_DEMOTION_FORBIDDEN).'
        );
      }
    }

    const name = updates.name !== undefined ? updates.name.trim() : existing.name;
    if (!name || name.length > CREDENTIAL_LIMITS.nameMaxLength) {
      throw new Error('Nombre inválido.');
    }

    const role = updates.role !== undefined ? updates.role : (existing.role as UserRole);
    if (!isUserRole(role)) throw new Error('Rol inválido.');

    let phoneNumber = existing.phone_number ?? null;
    if (updates.phoneNumber !== undefined) {
      phoneNumber = updates.phoneNumber.trim() ? normalizePhone(updates.phoneNumber) : null;
      if (updates.phoneNumber.trim() && !phoneNumber) {
        throw new Error('Teléfono móvil inválido. Usa 10 dígitos o +52...');
      }
    }

    const prevActive = Number(existing.active) === 1;
    const nextActive = updates.active !== undefined ? updates.active : prevActive;
    const prevTotpEnrolled = Number(existing.totp_enrolled) === 1;
    const nextTotpEnrolled = updates.resetTotp ? false : prevTotpEnrolled;
    const prevMustChangePwd = Number(existing.must_change_password ?? 0) === 1;
    const nextMustChangePwd = newPasswordHash !== undefined ? true : prevMustChangePwd;

    const changes: UserUpdateFieldDiff[] = [];
    if (name !== existing.name) {
      changes.push({ field: 'name', before: existing.name, after: name });
    }
    if (role !== existing.role) {
      changes.push({ field: 'role', before: existing.role, after: role });
    }
    if ((phoneNumber ?? null) !== (existing.phone_number ?? null)) {
      changes.push({
        field: 'phoneNumber',
        before: maskPhoneForAudit(existing.phone_number),
        after: maskPhoneForAudit(phoneNumber),
      });
    }
    if (nextActive !== prevActive) {
      changes.push({ field: 'active', before: prevActive, after: nextActive });
    }
    if (nextTotpEnrolled !== prevTotpEnrolled || updates.resetTotp) {
      changes.push({ field: 'totpEnrolled', before: prevTotpEnrolled, after: nextTotpEnrolled });
    }
    if (newPasswordHash !== undefined) {
      changes.push({ field: 'mustChangePassword', before: prevMustChangePwd, after: true });
    }

    const finalPasswordHash = newPasswordHash ?? existing.password_hash;
    const finalTotpSecretEnc = newTotpSecretEncJson ?? existing.totp_secret_enc;
    const finalBackupCodesHash =
      newBackupCodesHashJson !== undefined ? newBackupCodesHashJson : (existing.backup_codes_hash ?? null);

    await tx.execute(
      `UPDATE users
          SET name = $1,
              role = $2,
              phone_number = $3,
              active = $4,
              password_hash = $5,
              totp_secret_enc = $6,
              backup_codes_hash = $7,
              totp_enrolled = $8,
              must_change_password = $9
        WHERE id = $10;`,
      [
        name,
        role,
        phoneNumber,
        nextActive ? 1 : 0,
        finalPasswordHash,
        finalTotpSecretEnc,
        finalBackupCodesHash,
        nextTotpEnrolled ? 1 : 0,
        nextMustChangePwd ? 1 : 0,
        userId,
      ]
    );

    const requiresSessionKillSwitch =
      !nextActive ||
      role !== existing.role ||
      Boolean(updates.resetTotp) ||
      newPasswordHash !== undefined;

    let sessionsRevoked = 0;
    let pendingChallengesPurged = 0;
    if (requiresSessionKillSwitch) {
      const revoked = await revokeAllUserSessions(userId, tx);
      sessionsRevoked = revoked.sessionsRevoked;
      pendingChallengesPurged = revoked.pendingChallengesPurged;
    }

    const auditDiff: UserUpdateAuditDiff = {
      targetUserId: userId,
      targetEmail: existing.email,
      changes,
      totpReset: Boolean(updates.resetTotp),
      passwordChanged: newPasswordHash !== undefined,
      sessionsRevoked,
      pendingChallengesPurged,
    };

    return {
      auditDiff,
      newTotpEnrollment:
        newTotpSecret !== undefined
          ? {
              otpauthUri: generateTotpUri(existing.email, newTotpSecret, TOTP_ISSUER),
              manualKey: newTotpSecret,
            }
          : undefined,
      newRecoveryCodes,
      generatedTemporaryPassword,
    };
  });
}
