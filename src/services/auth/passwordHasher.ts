/**
 * HASH DE CONTRASEÑAS CON SCRYPT — CRUSE-APO-2026-005 (Bloque A.2)
 *
 * - node:crypto scrypt (N=2^15, r=8, p=1), salt de 16 bytes con crypto.randomBytes.
 * - Formato serializado: scrypt$N$r$p$saltB64$hashB64
 * - Comparación en tiempo constante con crypto.timingSafeEqual.
 * - Exclusivo de servidor: NUNCA importar desde componentes React.
 */

import crypto from 'node:crypto';
import { SCRYPT_PARAMS, PASSWORD_HASH_PREFIX } from '../../config/authConfig';

interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

function deriveKey(password: string, salt: Buffer, cost: ScryptCost, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      { N: cost.N, r: cost.r, p: cost.p, maxmem: SCRYPT_PARAMS.maxmemBytes },
      (err, derived) => (err ? reject(err) : resolve(derived))
    );
  });
}

/**
 * Genera el hash serializado de una contraseña.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SCRYPT_PARAMS.saltBytes);
  const derived = await deriveKey(password, salt, SCRYPT_PARAMS, SCRYPT_PARAMS.keyLength);
  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

interface ParsedHash {
  cost: ScryptCost;
  salt: Buffer;
  hash: Buffer;
}

function parseStoredHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_PREFIX) return null;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  // Solo se aceptan los parámetros aprobados: evita degradación de costo o DoS con hashes manipulados.
  if (N !== SCRYPT_PARAMS.N || r !== SCRYPT_PARAMS.r || p !== SCRYPT_PARAMS.p) return null;
  const salt = Buffer.from(saltB64, 'base64');
  const hash = Buffer.from(hashB64, 'base64');
  if (salt.length !== SCRYPT_PARAMS.saltBytes || hash.length !== SCRYPT_PARAMS.keyLength) return null;
  return { cost: { N, r, p }, salt, hash };
}

/**
 * Verifica una contraseña contra su hash serializado en tiempo constante.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  const derived = await deriveKey(password, parsed.salt, parsed.cost, parsed.hash.length);
  return derived.length === parsed.hash.length && crypto.timingSafeEqual(derived, parsed.hash);
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Ejecuta una verificación ficticia de mismo costo cuando el usuario no existe,
 * para que el tiempo de respuesta no revele qué correos están registrados.
 */
export async function verifyPasswordAgainstDummy(password: string): Promise<false> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(crypto.randomBytes(SCRYPT_PARAMS.saltBytes).toString('base64'));
  }
  await verifyPassword(password, await dummyHashPromise);
  return false;
}
