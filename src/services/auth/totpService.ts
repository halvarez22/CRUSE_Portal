/**
 * SERVICIO DE SEMILLAS CRIPTOGRÁFICAS Y CÓDIGOS DE RESPALDO 2FA — MICROFINANCIERA CRUSE
 *
 * Provee generación de semillas criptográficas de 160 bits y los 8 códigos de
 * respaldo de emergencia (One-Time Recovery Codes XXXX-XXXX) para contingencias
 * cuando el usuario no tiene cobertura celular para recibir el SMS 2FA.
 */

const ALPHABET_32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

export function decodeAlphabet32(encoded: string): Uint8Array {
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

  return new Uint8Array(bytes);
}

/**
 * Genera una semilla secreta de 160 bits (20 bytes) aleatoria.
 */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return encodeAlphabet32(bytes);
}

/**
 * Genera el identificador interno de vinculación 2FA para el expediente del usuario.
 */
export function generateTotpUri(email: string, secretKey: string, issuer = 'Microfinanciera Cruse'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(email);
  return `urn:cruse:2fa-sms:${encodedIssuer}:${encodedAccount}?key=${secretKey}`;
}

async function generateCodeForCounter(secretKey: string, counter: number): Promise<string> {
  const secretBytes = decodeAlphabet32(secretKey);
  const subtle = globalThis.crypto.subtle;

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

  const offset = hmacBytes[hmacBytes.length - 1]! & 0x0f;
  const binaryCode =
    ((hmacBytes[offset]! & 0x7f) << 24) |
    ((hmacBytes[offset + 1]! & 0xff) << 16) |
    ((hmacBytes[offset + 2]! & 0xff) << 8) |
    (hmacBytes[offset + 3]! & 0xff);

  const code = (binaryCode % 1000000).toString().padStart(6, '0');
  return code;
}

export async function generateCurrentTotpCode(secretKey: string, timeStepSeconds = 30): Promise<string> {
  const currentCounter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  return generateCodeForCounter(secretKey, currentCounter);
}

export async function verifyTotpToken(
  token: string,
  secretKey: string,
  windowSteps = 1,
  timeStepSeconds = 30
): Promise<{ valid: boolean; matchedStep?: number }> {
  const cleanToken = token.trim().replace(/\s+/g, '');
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
    return { valid: false };
  }

  const currentCounter = Math.floor(Date.now() / 1000 / timeStepSeconds);

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = await generateCodeForCounter(secretKey, currentCounter + offset);
    if (expected === cleanToken) {
      return { valid: true, matchedStep: offset };
    }
  }

  return { valid: false };
}

/**
 * Genera 8 códigos de respaldo de un solo uso (One-Time Recovery Codes XXXX-XXXX).
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
