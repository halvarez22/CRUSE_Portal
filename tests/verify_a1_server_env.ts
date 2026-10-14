/**
 * Verificación A.1 — fail-fast de serverEnv y funcionamiento del llavero.
 * Ejecutar desde c:\CRUSE_PORTAL\cruse-fintech-portal con: npx tsx <ruta>
 */
import { randomBytes } from 'crypto';
import { loadServerEnv, ServerEnvError } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/config/serverEnv';
import { computeServerBlindIndex, getServerKms } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/crypto/serverKeyring';
import { encryptEnvelope, decryptEnvelope } from 'c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/crypto/cryptoService';

const b64 = (n: number) => randomBytes(n).toString('base64');
const KEYS = ['CRUSE_KEK_CURRENT_VERSION', 'CRUSE_KEK_V1', 'CRUSE_KEK_V2', 'BLIND_INDEX_SECRET'];

function withEnv(vars: Record<string, string>): void {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}

let failures = 0;
function expectFail(label: string, vars: Record<string, string>, mustMention: string): void {
  withEnv(vars);
  try {
    loadServerEnv();
    console.log(`FALLO  ${label}: se aceptó una configuración inválida`);
    failures++;
  } catch (err: unknown) {
    const ok = err instanceof ServerEnvError && err.message.includes(mustMention);
    const leaks = Object.values(vars).some((v) => v.length > 8 && err instanceof Error && err.message.includes(v));
    console.log(`${ok && !leaks ? 'OK    ' : 'FALLO '} ${label}${leaks ? ' (¡filtra el valor!)' : ''}`);
    if (!ok || leaks) failures++;
  }
}

async function main(): Promise<void> {
  expectFail('sin variables', {}, 'CRUSE_KEK_CURRENT_VERSION');
  expectFail('KEK de 16 bytes', { CRUSE_KEK_CURRENT_VERSION: '1', CRUSE_KEK_V1: b64(16), BLIND_INDEX_SECRET: b64(32) }, 'exactamente 32 bytes');
  expectFail('KEK no base64', { CRUSE_KEK_CURRENT_VERSION: '1', CRUSE_KEK_V1: 'no-es-base64!!', BLIND_INDEX_SECRET: b64(32) }, 'base64');
  expectFail('versión vigente inexistente', { CRUSE_KEK_CURRENT_VERSION: '2', CRUSE_KEK_V1: b64(32), BLIND_INDEX_SECRET: b64(32) }, 'CRUSE_KEK_V2');
  expectFail('blind index corto', { CRUSE_KEK_CURRENT_VERSION: '1', CRUSE_KEK_V1: b64(32), BLIND_INDEX_SECRET: b64(16) }, 'BLIND_INDEX_SECRET');
  expectFail('blind index ausente', { CRUSE_KEK_CURRENT_VERSION: '1', CRUSE_KEK_V1: b64(32) }, 'BLIND_INDEX_SECRET');

  // Configuración válida con dos versiones de KEK
  withEnv({ CRUSE_KEK_CURRENT_VERSION: '2', CRUSE_KEK_V1: b64(32), CRUSE_KEK_V2: b64(32), BLIND_INDEX_SECRET: b64(32) });
  const env = loadServerEnv();
  const kms = getServerKms();
  const payload = await encryptEnvelope('miniatura-sintetica', kms);
  const roundTrip = await decryptEnvelope(payload, kms);
  const bi1 = await computeServerBlindIndex('AAGH650922HCHLTC04');
  const bi2 = await computeServerBlindIndex(' aagh650922hchltc04 ');
  const checks: [string, boolean][] = [
    ['config válida aceptada (2 KEK)', env.keks.size === 2 && env.kekCurrentVersion === 2],
    ['envelope usa KEK vigente v2', payload.kekVersion === 2],
    ['envelope ida y vuelta', roundTrip === 'miniatura-sintetica'],
    ['blind index determinista y normalizado', bi1 === bi2 && bi1.length === 32],
  ];
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'OK    ' : 'FALLO '} ${label}`);
    if (!ok) failures++;
  }

  console.log(failures === 0 ? '\nA.1: TODAS LAS VERIFICACIONES PASARON' : `\nA.1: ${failures} FALLO(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
