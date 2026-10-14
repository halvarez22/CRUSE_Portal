/**
 * SEMBRADO DE USUARIOS DE DESARROLLO — `npm run seed:dev`
 * CRUSE-APO-2026-005 (Bloque A.2)
 *
 * - Crea un usuario por rol (admin, oficial_cumplimiento, promotor) con credenciales ALEATORIAS.
 * - Las credenciales se imprimen una sola vez; los perfiles ya existentes se omiten sin reimprimir nada.
 * - Se niega a ejecutarse con NODE_ENV=production.
 */

import { bootstrapCli, generateTempPassword, printCredentialsOnce } from './authCliShared';
import { getServerEnv } from '../src/config/serverEnv';
import { createUser, findUserByEmail } from '../src/services/auth/userRepository';
import { db } from '../src/services/db/connectionPool';
import { DEV_SEED_PROFILES } from '../src/data/devSeedProfiles';

async function main(): Promise<void> {
  await bootstrapCli();

  if (getServerEnv().nodeEnv === 'production') {
    throw new Error('seed:dev está prohibido con NODE_ENV=production. Use `npm run user:create`.');
  }

  for (const profile of DEV_SEED_PROFILES) {
    if (await findUserByEmail(profile.email)) {
      console.log(`[Omitido] ${profile.email} ya existe (sus credenciales no se vuelven a mostrar).`);
      continue;
    }
    const tempPassword = generateTempPassword();
    const created = await createUser({ ...profile, password: tempPassword });
    printCredentialsOnce(created, tempPassword);
  }
}

main()
  .catch((err: unknown) => {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
