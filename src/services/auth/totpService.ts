/**
 * SERVICIO 2FA TOTP RFC 6238 (APP AUTENTICADORA) Y CÓDIGOS DE RESPALDO SHA-256
 * Expediente: CRUSE-APO-2026-067 (Guardrail Forense 5: 2FA TOTP Obligatorio para Roles Críticos)
 *
 * - Implementa RFC 6238 usando `crypto.createHmac('sha1', ...)` con ventana de tolerancia ±1 paso (30 s).
 * - Genera códigos de respaldo de emergencia con `crypto.randomBytes(8)` y almacenamiento SHA-256.
 * - Roles críticos (`admin`, `cumplimiento`, `operaciones`) requieren TOTP; promotores pueden usar SMS.
 */

import crypto from 'node:crypto';
import { UserRole } from '../../types';

const ALPHABET_32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const CRITICAL_TOTP_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'admin',
  'oficial_cumplimiento',
]);

export function isCriticalTotpRole(role: UserRole | string): boolean {
  return CRITICAL_TOTP_ROLES.has(role as UserRole);
}

export function encodeAlphabet32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET_32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += ALPHABET_32[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeAlphabet32(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = ALPHABET_32.indexOf(clean[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Genera una semilla secreta Base32 de 160 bits (20 bytes) criptográficamente segura.
 */
export function generateTotpSecret(): string {
  return encodeAlphabet32(crypto.randomBytes(20));
}

/**
 * Genera URI estándar RFC 6238 compatible con Google Authenticator y Microsoft Authenticator.
 */
export function generateTotpUri(
  email: string,
  secretKey: string,
  issuer = 'Microfinanciera Cruse'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secretKey}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Calcula el código TOTP de 6 dígitos para un contador de tiempo dado usando Node `crypto.createHmac('sha1')`.
 */
export function generateTotpCodeForCounter(secretKey: string, counter: number): string {
  const secretBuffer = decodeAlphabet32(secretKey);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binaryCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (binaryCode % 1_000_000).toString().padStart(6, '0');
}

export async function generateCurrentTotpCode(
  secretKey: string,
  timeStepSeconds = 30,
  nowMs = Date.now()
): Promise<string> {
  const currentCounter = Math.floor(nowMs / 1000 / timeStepSeconds);
  return generateTotpCodeForCounter(secretKey, currentCounter);
}

/**
 * Verifica un código TOTP RFC 6238 con ventana de tolerancia ±windowSteps (por defecto ±1 paso = ±30 s)
 * usando comparación en tiempo constante (`crypto.timingSafeEqual`).
 */
export async function verifyTotpToken(
  token: string,
  secretKey: string,
  windowSteps = 1,
  timeStepSeconds = 30,
  nowMs = Date.now()
): Promise<{ valid: boolean; matchedStep?: number }> {
  const cleanToken = token.trim().replace(/\s+/g, '');
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
    return { valid: false };
  }

  const currentCounter = Math.floor(nowMs / 1000 / timeStepSeconds);
  const tokenBuf = Buffer.from(cleanToken, 'utf8');

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = generateTotpCodeForCounter(secretKey, currentCounter + offset);
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (expectedBuf.length === tokenBuf.length && crypto.timingSafeEqual(expectedBuf, tokenBuf)) {
      return { valid: true, matchedStep: offset };
    }
  }

  return { valid: false };
}

/**
 * Genera códigos de respaldo de un solo uso (XXXX-XXXX) con `crypto.randomBytes(8)`.
 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += chars[bytes[j]! % chars.length];
      if (j === 3) code += '-';
    }
    codes.push(code);
  }

  return codes;
}

/**
 * Calcula el hash SHA-256 de un código de respaldo normalizado para almacenamiento seguro.
 */
export function hashRecoveryCodeSha256(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
