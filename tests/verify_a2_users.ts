/**
 * Verificación A.2 — scrypt, TOTP cifrado en reposo y alta de usuarios.
 * Ejecutar desde c:\CRUSE_PORTAL\cruse-fintech-portal con: npx tsx <ruta>
 * No imprime contraseñas ni secretos TOTP: solo resultados booleanos y metadatos.
 */
import 'c:/CRUSE_PORTAL/cruse-fintech-portal/node_modules/dotenv/config.js';
import crypto from 'node:crypto';
import { loadServerEnv } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/config/serverEnv';
import { runMigrations } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/db/migrationRunner';
import { db } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/db/connectionPool';
import { hashPassword, verifyPassword } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/auth/passwordHasher';
import { createUser, findUserByEmail, decryptTotpSecret } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/auth/userRepository';

let failures = 0;
function check(label: string, ok: boolean, info = ''): void {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${label}${info ? ` -> ${info}` : ''}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  loadServerEnv();
  const mig = await runMigrations();
  console.log(`Migraciones: aplicadas=${mig.appliedCount} omitidas=${mig.skippedCount}`);
  console.log(mig.details.join('\n'));

  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','pending_totp') ORDER BY name"
  );
  check('Tablas 005 presentes', tables.rowCount === 3, tables.rows.map((t) => t.name).join(','));

  // 1. scrypt
  const pwd = crypto.randomBytes(18).toString('base64url');
  const t0 = Date.now();
  const h = await hashPassword(pwd);
  const ms = Date.now() - t0;
  const parts = h.split('$');
  check('Formato scrypt$N$r$p$salt$hash', parts.length === 6 && parts[0] === 'scrypt');
  check('N=32768 r=8 p=1', parts[1] === '32768' && parts[2] === '8' && parts[3] === '1', `${parts[1]}/${parts[2]}/${parts[3]}`);
  check('Salt de 16 bytes', Buffer.from(parts[4]!, 'base64').length === 16);
  check('Hash derivado de 64 bytes', Buffer.from(parts[5]!, 'base64').length === 64, `tiempo de derivación ${ms} ms`);
  check('Contraseña correcta verifica', await verifyPassword(pwd, h));
  check('Contraseña incorrecta rechazada', !(await verifyPassword(pwd + 'x', h)));
  const h2 = await hashPassword(pwd);
  check('Salt aleatorio (dos hashes distintos de la misma contraseña)', h !== h2);
  const downgraded = ['scrypt', '1024', '8', '1', parts[4], parts[5]].join('$');
  check('Hash con parámetros degradados rechazado', !(await verifyPassword(pwd, downgraded)));

  // 2. Alta de usuario y TOTP cifrado en reposo
  const email = `qa.a2.${crypto.randomBytes(4).toString('hex')}@cruse.local`;
  const created = await createUser({ email, name: 'QA A.2', role: 'promotor', password: pwd });
  const row = await findUserByEmail(email);
  check('Usuario persistido', row !== null);
  if (row) {
    check('password_hash no contiene la contraseña', !row.password_hash.includes(pwd));
    check('password_hash con prefijo scrypt$32768$8$1$', row.password_hash.startsWith('scrypt$32768$8$1$'));
    check('totp_secret_enc no contiene el secreto en claro', !row.totp_secret_enc.includes(created.totpSecret));
    const env = JSON.parse(row.totp_secret_enc) as Record<string, unknown>;
    check('totp_secret_enc es sobre AES-GCM-256', env.alg === 'AES-GCM-256' && typeof env.wrappedDek === 'string', `alg=${String(env.alg)} kekVersion=${String(env.kekVersion)}`);
    check('Descifrado devuelve el secreto original', (await decryptTotpSecret(row)) === created.totpSecret);
    check('totp_enrolled inicia en 0', row.totp_enrolled === 0);
  }
  let dupRejected = false;
  try { await createUser({ email, name: 'Dup', role: 'promotor', password: pwd }); } catch { dupRejected = true; }
  check('Correo duplicado rechazado', dupRejected);
  let shortRejected = false;
  try { await createUser({ email: `x.${email}`, name: 'Corta', role: 'promotor', password: 'corta' }); } catch { shortRejected = true; }
  check('Contraseña < 12 caracteres rechazada', shortRejected);

  await db.execute('DELETE FROM users WHERE email = ?', [email]);
  console.log(`\nResultado: ${failures === 0 ? 'TODAS LAS PRUEBAS OK' : `${failures} FALLO(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e: unknown) => { console.error(e); process.exitCode = 1; }).finally(() => db.close());
