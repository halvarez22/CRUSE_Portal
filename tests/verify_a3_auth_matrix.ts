/**
 * Verificación A.2/A.3 end-to-end contra el servidor local (http://localhost:3000).
 * Crea 3 usuarios efímeros (uno por rol), ejercita login 2FA, matriz RBAC, expiración,
 * revocación, rotación y la regla de identidad. NO imprime contraseñas, secretos ni tokens.
 * Ejecutar desde c:\CRUSE_PORTAL\cruse-fintech-portal con: npx tsx <ruta>
 */
import 'c:/CRUSE_PORTAL/cruse-fintech-portal/node_modules/dotenv/config.js';
import crypto from 'node:crypto';
import { loadServerEnv } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/config/serverEnv';
import { db } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/db/connectionPool';
import { createUser } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/auth/userRepository';
import { fromBase32 } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/auth/totpService';
import type { UserRole } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/types';

const BASE = 'http://localhost:3000/api';
let failures = 0;
function check(label: string, ok: boolean, info = ''): void {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${label}${info ? ` -> ${info}` : ''}`);
  if (!ok) failures++;
}

function totp(secret: string, offsetSteps = 0): string {
  const counter = Math.floor(Date.now() / 30000) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', Buffer.from(fromBase32(secret))).update(buf).digest();
  const o = h[h.length - 1]! & 0x0f;
  const code = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return (code % 1_000_000).toString().padStart(6, '0');
}

interface HttpResult { status: number; body: Record<string, unknown>; raw: string }
async function call(method: string, path: string, token?: string, body?: unknown): Promise<HttpResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { /* respuesta no JSON */ }
  return { status: res.status, body: parsed, raw };
}

interface QaUser { role: UserRole; email: string; password: string; secret: string; token?: string }

async function login(u: QaUser): Promise<{ first: HttpResult; second?: HttpResult }> {
  const first = await call('POST', '/auth/login', undefined, { email: u.email, password: u.password });
  const temp = String(first.body.tempToken ?? '');
  const second = temp ? await call('POST', '/auth/verify-totp', undefined, { tempToken: temp, code: totp(u.secret) }) : undefined;
  if (second?.status === 200) u.token = String(second.body.token);
  return { first, second };
}

async function main(): Promise<void> {
  loadServerEnv();
  const tag = crypto.randomBytes(3).toString('hex');
  const users: QaUser[] = [];
  for (const role of ['admin', 'oficial_cumplimiento', 'promotor'] as UserRole[]) {
    const password = crypto.randomBytes(18).toString('base64url');
    const email = `qa.${role}.${tag}@cruse.local`;
    const created = await createUser({ email, name: `QA ${role}`, role, password });
    users.push({ role, email, password, secret: created.totpSecret });
  }
  const [admin, oficial, promotor] = users as [QaUser, QaUser, QaUser];

  console.log('\n== A.2 Login y enrolamiento ==');
  const bad = await call('POST', '/auth/login', undefined, { email: admin.email, password: 'incorrecta-123456' });
  check('Contraseña incorrecta -> 401', bad.status === 401, String(bad.status));
  const ghost = await call('POST', '/auth/login', undefined, { email: `nadie.${tag}@cruse.local`, password: 'x'.repeat(16) });
  check('Usuario inexistente -> 401 (mismo mensaje)', ghost.status === 401 && ghost.body.error === bad.body.error);
  for (const u of users) {
    const { first, second } = await login(u);
    check(`[${u.role}] paso 1 -> 200 con tempToken`, first.status === 200 && typeof first.body.tempToken === 'string');
    check(`[${u.role}] sin campo totpSecretDemo`, !('totpSecretDemo' in first.body) && !first.raw.includes('totpSecretDemo'));
    check(`[${u.role}] primer acceso entrega enrolamiento`, typeof (first.body.enrollment as Record<string, unknown> | undefined)?.otpauthUri === 'string');
    check(`[${u.role}] paso 2 -> 200 con token`, second?.status === 200 && typeof u.token === 'string', `token ${u.token?.length ?? 0} chars`);
  }
  const relog = await call('POST', '/auth/login', undefined, { email: admin.email, password: admin.password });
  check('Segundo login: ya NO entrega enrolamiento ni secreto', relog.status === 200 && !('enrollment' in relog.body) && !relog.raw.includes(admin.secret));

  console.log('\n== A.3 Matriz RBAC ==');
  const matrix: Array<[string, string, Record<UserRole, number>]> = [
    ['GET', '/expedientes', { admin: 200, oficial_cumplimiento: 200, promotor: 403 }],
    ['GET', '/audit/events?limit=1', { admin: 200, oficial_cumplimiento: 200, promotor: 403 }],
    ['GET', '/audit/verify', { admin: 200, oficial_cumplimiento: 200, promotor: 403 }],
    ['GET', '/reconciliation/batches', { admin: 200, oficial_cumplimiento: 200, promotor: 403 }],
    ['GET', '/reconciliation/sample-data', { admin: 200, oficial_cumplimiento: 200, promotor: 403 }],
    ['POST', '/promotores/secure', { admin: 403, oficial_cumplimiento: 403, promotor: 400 }],
    ['POST', '/reconciliation/process', { admin: 403, oficial_cumplimiento: 400, promotor: 403 }],
  ];
  for (const [method, path, expected] of matrix) {
    const anon = await call(method, path, undefined, method === 'POST' ? {} : undefined);
    check(`${method} ${path} sin token -> 401`, anon.status === 401, String(anon.status));
    const garbage = await call(method, path, 'tokenInventado_abc123', method === 'POST' ? {} : undefined);
    check(`${method} ${path} token inventado -> 401`, garbage.status === 401, String(garbage.status));
    for (const u of users) {
      const r = await call(method, path, u.token, method === 'POST' ? {} : undefined);
      check(`${method} ${path} [${u.role}] -> ${expected[u.role]}`, r.status === expected[u.role], String(r.status));
    }
  }
  console.log('   (400 = autorizado por RBAC y rechazado por validación de cuerpo vacío)');

  const denied = await db.query<{ actor_email: string; details: string }>(
    "SELECT actor_email, details FROM audit_events WHERE action = 'ACCESS_DENIED' AND actor_email = ? ORDER BY ts DESC",
    [promotor.email]
  );
  check('Eventos ACCESS_DENIED del promotor en bitácora WORM', denied.rowCount >= 5, `${denied.rowCount} eventos; ej: ${denied.rows[0]?.details ?? '-'}`);

  console.log('\n== Regla de identidad (req.auth) ==');
  const sample = await call('GET', '/reconciliation/sample-data', oficial.token);
  const records = (sample.body.STSGECH as unknown[] | undefined) ?? [];
  const period = `QA-${tag}`;
  const proc = await call('POST', '/reconciliation/process', oficial.token, {
    agreementName: 'STSGECH', fortnightPeriod: period, records, officerEmail: 'atacante@externo.mx',
  });
  const batch = proc.body.batch as Record<string, unknown> | undefined;
  check('officerEmail del cuerpo ignorado: el lote registra al oficial de la sesión',
    proc.status === 200 && batch?.officerEmail === oficial.email, `officerEmail=${String(batch?.officerEmail)}`);
  const sealed = await db.query<{ actor_email: string; actor_role: string }>(
    "SELECT actor_email, actor_role FROM audit_events WHERE action='RECONCILIATION_BATCH_SEALED' AND details LIKE ? ", [`%${period}%`]);
  check('Sello WORM con actor y rol de la sesión', sealed.rows[0]?.actor_email === oficial.email && sealed.rows[0]?.actor_role === 'oficial_cumplimiento');

  console.log('\n== Tokens en reposo, expiración, rotación y logout ==');
  const tokenHash = crypto.createHash('sha256').update(admin.token!).digest('hex');
  const stored = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE token_hash = ?', [tokenHash]);
  const plain = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?', [admin.token!]);
  check('En BD solo existe SHA-256(token), nunca el token', stored.rowCount === 1 && plain.rows[0]!.n === 0);

  const oldAdmin = admin.token!;
  const rot = await call('POST', '/auth/refresh', oldAdmin);
  const newAdmin = String(rot.body.token ?? '');
  check('Refresh -> 200 con token nuevo distinto', rot.status === 200 && newAdmin.length > 0 && newAdmin !== oldAdmin);
  check('Token anterior revocado tras rotación -> 401', (await call('GET', '/expedientes', oldAdmin)).status === 401);
  check('Token rotado válido -> 200', (await call('GET', '/expedientes', newAdmin)).status === 200);

  await db.execute('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [
    new Date(Date.now() - 1000).toISOString(), crypto.createHash('sha256').update(oficial.token!).digest('hex'),
  ]);
  check('Sesión expirada -> 401', (await call('GET', '/expedientes', oficial.token)).status === 401);

  const out = await call('POST', '/auth/logout', newAdmin);
  check('Logout -> 200', out.status === 200);
  check('Token tras logout -> 401 (revocación real en servidor)', (await call('GET', '/expedientes', newAdmin)).status === 401);
  const logoutEvt = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events WHERE action='LOGOUT' AND actor_email = ?", [admin.email]);
  check('Evento LOGOUT registrado en bitácora', logoutEvt.rows[0]!.n === 1);

  console.log('\n== Rate limiting 2FA por usuario ==');
  let last: HttpResult | undefined;
  for (let i = 0; i < 6; i++) {
    const s1 = await call('POST', '/auth/login', undefined, { email: promotor.email, password: promotor.password });
    last = await call('POST', '/auth/verify-totp', undefined, { tempToken: s1.body.tempToken, code: totp(promotor.secret, 5) });
  }
  check('6º intento fallido (aun con tempToken nuevo) -> 429', last?.status === 429, String(last?.status));

  const chain = await call('GET', '/audit/verify', promotor.token);
  check('Promotor sigue sin acceso a la verificación de cadena', chain.status === 403);

  // Limpieza de usuarios efímeros (users/sessions/pending_totp no son WORM; la bitácora se conserva)
  const ids = (await db.query<{ id: string }>('SELECT id FROM users WHERE email LIKE ?', [`qa.%.${tag}@cruse.local`])).rows.map((r) => r.id);
  for (const id of ids) {
    await db.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
    await db.execute('DELETE FROM pending_totp WHERE user_id = ?', [id]);
    await db.execute('DELETE FROM users WHERE id = ?', [id]);
  }
  console.log(`\nLimpieza: ${ids.length} usuarios QA eliminados.`);
  console.log(`Resultado: ${failures === 0 ? 'TODAS LAS PRUEBAS OK' : `${failures} FALLO(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e: unknown) => { console.error(e); process.exitCode = 1; }).finally(() => db.close());
