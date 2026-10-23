/**
 * SERVICIO 2FA TOTP (RFC 6238) — MICROFINANCIERA CRUSE
 *
 * Implementa autenticación de doble factor basada en tiempo (Time-based One-Time Password):
 * - Clave secreta Base32 de 160 bits (20 bytes).
 * - Ventana temporal de 30 segundos con tolerancia de ±1 paso (para desincronización de móviles).
 * - Códigos de recuperación de emergencia (One-Time Recovery Codes).
 * - Compatible con Google Authenticator, Microsoft Authenticator y 1Password.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function fromBase32(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Genera una llave secreta de 160 bits (20 bytes) aleatoria en Base32.
 */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return toBase32(bytes);
}

/**
 * Genera el URI estándar otpauth:// para escanear en apps autenticadoras.
 */
export function generateTotpUri(email: string, secretBase32: string, issuer = 'Microfinanciera Cruse'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Calcula el código TOTP de 6 dígitos para un contador de tiempo específico.
 */
async function generateCodeForCounter(secretBase32: string, counter: number): Promise<string> {
  const secretBytes = fromBase32(secretBase32);
  const subtle = globalThis.crypto.subtle;

  // Buffer de 8 bytes para el contador (Big Endian)
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(counter), false);

  const key = await subtle.importKey(
    'raw',
    secretBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const hmac = await subtle.sign('HMAC', key, counterBuffer);
  const hmacBytes = new Uint8Array(hmac);

  // Dynamic truncation (RFC 4226)
  const offset = hmacBytes[hmacBytes.length - 1]! & 0x0f;
  const binaryCode =
    ((hmacBytes[offset]! & 0x7f) << 24) |
    ((hmacBytes[offset + 1]! & 0xff) << 16) |
    ((hmacBytes[offset + 2]! & 0xff) << 8) |
    (hmacBytes[offset + 3]! & 0xff);

  const code = (binaryCode % 1000000).toString().padStart(6, '0');
  return code;
}

export async function generateCurrentTotpCode(secretBase32: string, timeStepSeconds = 30): Promise<string> {
  const currentCounter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  return generateCodeForCounter(secretBase32, currentCounter);
}

/**
 * Valida un código TOTP proporcionado por el usuario con tolerancia de ventana de ±1 paso (30s).
 */
export async function verifyTotpToken(
  token: string,
  secretBase32: string,
  windowSteps = 1,
  timeStepSeconds = 30
): Promise<{ valid: boolean; matchedStep?: number }> {
  const cleanToken = token.trim().replace(/\s+/g, '');
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
    return { valid: false };
  }

  const currentCounter = Math.floor(Date.now() / 1000 / timeStepSeconds);

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = await generateCodeForCounter(secretBase32, currentCounter + offset);
    if (expected === cleanToken) {
      return { valid: true, matchedStep: offset };
    }
  }

  return { valid: false };
}

/**
 * Genera 8 códigos de recuperación de un solo uso (One-Time Recovery Codes).
 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Sin 0, 1, I, O confusos

  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += chars[bytes[j]! % chars.length];
      if (j === 3) code += '-';
    }
    codes.push(code);
  }

  return codes;
}
