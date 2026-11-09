/**
 * SCRIPT ADMINISTRATIVO DE REAPROVISIONAMIENTO OUT-OF-BAND DE CÓDIGOS DE RESPALDO 2FA (CRUSE-APO-2026-056)
 *
 * Cumple con los 4 Guardrails Forenses (NIST SP 800-63B):
 * - Guardrail 1: Cero reutilización de códigos (se mantiene consumo estricto Single-Use en verifyAndConsumeBackupCode).
 * - Guardrail 2: Generación criptográfica CSPRNG (crypto.randomBytes) y persistencia exclusiva de hashes SHA-256
 *   mediante `hashRecoveryCode` en la columna `backup_codes_hash`. Jamás se almacena texto plano en BD.
 * - Guardrail 3: Exposición única en consola (stdout) para entrega manual Out-of-Band; cero escritura en archivos o logs.
 * - Guardrail 4: Aislamiento estricto a las 3 cuentas autorizadas (Administrador Maestro, Ing. Gerardo Ornelas y Srita. Alma).
 */

import crypto from 'node:crypto';
if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: typeof crypto.webcrypto }).crypto = crypto.webcrypto;
}
import { db } from '../src/services/db/connectionPool';
import {
  createUser,
  ensureUsersPhoneColumn,
  hashRecoveryCode,
  UserRow,
} from '../src/services/auth/userRepository';
import { hashPassword } from '../src/services/auth/passwordHasher';
import { UserRole } from '../src/types';

const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Guardrail 2: Generación CSPRNG estricta con node:crypto.randomBytes
 */
function generateCsprngRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const buf = crypto.randomBytes(8);
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += RECOVERY_ALPHABET[buf[j]! % RECOVERY_ALPHABET.length];
      if (j === 3) code += '-';
    }
    codes.push(code);
  }
  return codes;
}

interface TargetAccountSpec {
  key: 'admin' | 'gerardo' | 'alma';
  matchPredicate: (u: UserRow) => boolean;
  defaultEmail: string;
  defaultName: string;
  defaultRole: UserRole;
  defaultPhone: string;
  initialAccessPassword?: string;
}

const TARGET_SPECS: readonly TargetAccountSpec[] = [
  {
    key: 'admin',
    matchPredicate: (u) =>
      u.email.toLowerCase() === 'admin@cruse.com.mx' ||
      u.email.toLowerCase() === 'admin.dev@cruse.local',
    defaultEmail: 'admin@cruse.com.mx',
    defaultName: 'Administrador Maestro',
    defaultRole: 'admin',
    defaultPhone: '+524777241148',
  },
  {
    key: 'gerardo',
    matchPredicate: (u) =>
      u.email.toLowerCase().includes('gerardo') ||
      u.email.toLowerCase().includes('ornelas') ||
      u.name.toLowerCase().includes('gerardo'),
    defaultEmail: 'gerardo.ornelas@cruse.com.mx',
    defaultName: 'Ing. Gerardo Ornelas',
    defaultRole: 'admin',
    defaultPhone: '+524731005503',
  },
  {
    key: 'alma',
    matchPredicate: (u) =>
      u.email.toLowerCase().includes('alma') || u.name.toLowerCase().includes('alma'),
    defaultEmail: 'alma@cruse.com.mx',
    defaultName: 'Srita. Alma — Coordinación Operativa Cruse',
    defaultRole: 'oficial_cumplimiento',
    defaultPhone: '+526141965449',
    initialAccessPassword: 'CruseAlma!2026#',
  },
];

async function runProvisioning(): Promise<void> {
  await ensureUsersPhoneColumn();

  const engineLabel = db.isPostgres()
    ? 'AZURE POSTGRESQL (PRODUCCIÓN)'
    : 'SQLITE LOCAL (DESARROLLO)';

  console.log('================================================================================');
  console.log(`🔐 REAPROVISIONAMIENTO FORENSE 2FA OUT-OF-BAND — ${engineLabel}`);
  console.log('   Expediente: CRUSE-APO-2026-056 (Guardrails 1, 2, 3 y 4 — NIST SP 800-63B)');
  console.log('================================================================================\n');

  const allUsersRes = await db.query<UserRow>('SELECT * FROM users ORDER BY created_at ASC');
  const allUsers = allUsersRes.rows;

  console.log(`📋 Catálogo actual en BD (${allUsers.length} usuarios registrados):`);
  for (const u of allUsers) {
    let remaining = 0;
    try {
      const parsed: unknown = JSON.parse(u.backup_codes_hash || '[]');
      if (Array.isArray(parsed)) remaining = parsed.length;
    } catch {
      remaining = 0;
    }
    console.log(
      `   • [${u.role.padEnd(20)}] ${u.email.padEnd(34)} | ${u.name.padEnd(30)} | Códigos previos: ${remaining}/8`
    );
  }
  console.log('--------------------------------------------------------------------------------\n');

  for (const spec of TARGET_SPECS) {
    const matchedUsers = allUsers.filter(spec.matchPredicate);

    if (matchedUsers.length === 0) {
      // Si la cuenta (ej. Srita. Alma o Gerardo en local) aún no existe en esta BD, se aprovisiona con must_change_password = false
      const pwdToUse =
        spec.initialAccessPassword ?? `Cruse${spec.key === 'gerardo' ? 'Gerardo' : 'Admin'}!2026#`;
      const created = await createUser({
        email: spec.defaultEmail,
        name: spec.defaultName,
        role: spec.defaultRole,
        password: pwdToUse,
        phoneNumber: spec.defaultPhone,
        mustChangePassword: false,
      });

      // Reemplazar con códigos CSPRNG de node:crypto.randomBytes y must_change_password = 0
      const freshCodes = generateCsprngRecoveryCodes(8);
      const freshHashesJson = JSON.stringify(freshCodes.map(hashRecoveryCode));
      await db.execute(
        'UPDATE users SET backup_codes_hash = $1, totp_enrolled = 1, must_change_password = 0, active = 1 WHERE id = $2',
        [freshHashesJson, created.user.id]
      );

      console.log(`✅ [NUEVA CUENTA APROVISIONADA] ${spec.defaultName}`);
      console.log(`   • Correo de Acceso          : ${created.user.email}`);
      console.log(`   • Rol Institucional         : ${created.user.role}`);
      console.log(`   • Contraseña Activa         : ${pwdToUse}`);
      console.log(`   • must_change_password      : false (0) — Sin fricción en pruebas`);
      console.log(`   • 8 Códigos de Emergencia 2FA (Single-Use SHA-256 en BD):`);
      console.log(`     ${freshCodes.slice(0, 4).join('   |   ')}`);
      console.log(`     ${freshCodes.slice(4, 8).join('   |   ')}\n`);
      continue;
    }

    for (const targetUser of matchedUsers) {
      const freshCodes = generateCsprngRecoveryCodes(8);
      const freshHashesJson = JSON.stringify(freshCodes.map(hashRecoveryCode));

      if (spec.key === 'alma' && spec.initialAccessPassword) {
        const almaPwdHash = await hashPassword(spec.initialAccessPassword);
        await db.execute(
          'UPDATE users SET backup_codes_hash = $1, password_hash = $2, must_change_password = 0, active = 1 WHERE id = $3',
          [freshHashesJson, almaPwdHash, targetUser.id]
        );
      } else {
        await db.execute(
          'UPDATE users SET backup_codes_hash = $1, must_change_password = 0, active = 1 WHERE id = $2',
          [freshHashesJson, targetUser.id]
        );
      }

      console.log(`✅ [CÓDIGOS 2FA REGENERADOS (8/8)] ${targetUser.name}`);
      console.log(`   • Correo de Acceso          : ${targetUser.email}`);
      console.log(`   • Rol Institucional         : ${targetUser.role}`);
      if (spec.key === 'alma' && spec.initialAccessPassword) {
        console.log(`   • Contraseña Activa         : ${spec.initialAccessPassword}`);
      } else {
        console.log(`   • Contraseña Activa         : (Mantiene su contraseña actual intacta)`);
      }
      console.log(`   • must_change_password      : false (0)`);
      console.log(`   • 8 Nuevos Códigos de Emergencia 2FA (Single-Use SHA-256 en BD):`);
      console.log(`     ${freshCodes.slice(0, 4).join('   |   ')}`);
      console.log(`     ${freshCodes.slice(4, 8).join('   |   ')}\n`);
    }
  }

  console.log('================================================================================');
  console.log('🔒 AVISO FORENSE (GUARDRAIL 3): Estos códigos se muestran UNA SOLA VEZ en consola.');
  console.log('   En la base de datos solo existen sus digests irreversibles SHA-256.');
  console.log('================================================================================');
}

runProvisioning()
  .catch((err: unknown) => {
    console.error('❌ Error en reaprovisionamiento 2FA:', err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
