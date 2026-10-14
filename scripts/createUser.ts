/**
 * CLI DE ALTA DE USUARIO INSTITUCIONAL — `npm run user:create`
 * CRUSE-APO-2026-005 (Bloque A.2)
 *
 * Uso interactivo:      npm run user:create
 * Uso con argumentos:   npm run user:create -- --email a@b.mx --name "Nombre" --role oficial_cumplimiento
 *
 * Genera contraseña temporal y secreto TOTP aleatorios y los muestra UNA sola vez en la terminal.
 */

import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { bootstrapCli, generateTempPassword, printCredentialsOnce } from './authCliShared';
import { createUser, isUserRole, USER_ROLES } from '../src/services/auth/userRepository';
import { db } from '../src/services/db/connectionPool';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
    },
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = values.email ?? (await rl.question('Correo institucional: '));
  const name = values.name ?? (await rl.question('Nombre completo: '));
  const role = values.role ?? (await rl.question(`Rol (${USER_ROLES.join(' | ')}): `));
  rl.close();

  const roleValue = role.trim();
  if (!isUserRole(roleValue)) {
    throw new Error(`Rol inválido. Valores permitidos: ${USER_ROLES.join(', ')}`);
  }

  await bootstrapCli();
  const tempPassword = generateTempPassword();
  const created = await createUser({ email, name, role: roleValue, password: tempPassword });
  printCredentialsOnce(created, tempPassword);
}

main()
  .catch((err: unknown) => {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
