/**
 * ARRANQUE COMÚN DE SCRIPTS CLI DE AUTENTICACIÓN — CRUSE-APO-2026-005 / CRUSE-APO-2026-030
 * Carga .env, valida secretos (fail-fast) y aplica migraciones antes de operar sobre `users`.
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { loadServerEnv, ServerEnvError } from '../src/config/serverEnv';
import { runMigrations } from '../src/services/db/migrationRunner';
import { TEMP_PASSWORD_BYTES, AUTH_ISSUER_NAME } from '../src/config/authConfig';
import { generateTotpUri } from '../src/services/auth/totpService';
import { CreatedUserCredentials } from '../src/services/auth/userRepository';

export async function bootstrapCli(): Promise<void> {
  try {
    loadServerEnv();
  } catch (err) {
    console.error(err instanceof ServerEnvError ? `ALERTA FATAL: ${err.message}` : err);
    process.exit(1);
  }
  await runMigrations();
}

export function generateTempPassword(): string {
  return crypto.randomBytes(TEMP_PASSWORD_BYTES).toString('base64url');
}

/**
 * Muestra las credenciales UNA sola vez en la terminal (nunca en archivos ni bitácoras).
 */
export function printCredentialsOnce(created: CreatedUserCredentials, tempPassword: string): void {
  const { user, totpSecret } = created;
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`Usuario:              ${user.email}  (${user.role})`);
  console.log(`Contraseña temporal:  ${tempPassword}`);
  console.log(`Semilla 2FA:          ${totpSecret}`);
  console.log(`URI 2FA:              ${generateTotpUri(user.email, totpSecret, AUTH_ISSUER_NAME)}`);
  console.log('Entregue estas credenciales por un canal seguro. No se volverán a mostrar.');
}
