/**
 * SERVICIO CRIPTOGRÁFICO INDUSTRIAL — MICROFINANCIERA CRUSE
 *
 * Implementa los estándares obligatorios de Fase 2 (Auditoría Forense CRUSE-APO-2026-002):
 * - Envelope Encryption (AES-GCM 256 + KEK/DEK) para miniaturas y datos confidenciales.
 * - Blind Indexing (HMAC-SHA256) para búsquedas deterministas de CURP/RFC sin descifrado masivo.
 * - Hash Chaining criptográfico (SHA-256) para bitácora forense inmutable de 5 años.
 * - OBS-2: KEK versionada y lista para integración con KMS externo (AWS KMS / HashiCorp Vault).
 */

export const CRYPTO_VERSION = 1;
export const ENVELOPE_ALG = 'AES-GCM-256';

export interface EnvelopeEncryptedPayload {
  version: number;
  alg: string;
  kekVersion: number;
  wrappedDek: string; // Base64 de la DEK cifrada con KEK
  iv: string;         // Base64 del Vector de Inicialización (12 bytes)
  ciphertext: string; // Base64 del contenido cifrado
  authTag?: string;   // Incluido en Web Crypto ciphertext o explicit
  keyId: string;
}

export interface KmsProvider {
  wrapKey(dekBytes: Uint8Array, kekVersion: number): Promise<string>;
  unwrapKey(wrappedDekBase64: string, kekVersion: number): Promise<Uint8Array>;
  getCurrentKekVersion(): number;
}

// Codificadores auxiliares universales (Node y Browser)
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) no disponible en este entorno.');
  }
  return subtle;
}

function getRandomBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

/**
 * Proveedor KMS Local que modela la interfaz de AWS KMS / HashiCorp Vault (OBS-2).
 * CRUSE-APO-2026-005 (N1): las KEK se inyectan desde el entorno validado (serverEnv);
 * no existe ninguna semilla ni derivación en el código fuente.
 */
export class LocalKmsProvider implements KmsProvider {
  private readonly masterKeys: ReadonlyMap<number, Uint8Array>;
  private readonly currentVersion: number;

  constructor(keks: ReadonlyMap<number, Uint8Array>, currentVersion: number) {
    for (const [version, key] of keks) {
      if (key.length !== 32) {
        throw new Error(`KEK versión ${version} debe medir 32 bytes (AES-256).`);
      }
    }
    if (!keks.has(currentVersion)) {
      throw new Error(`KEK vigente versión ${currentVersion} no disponible.`);
    }
    this.masterKeys = keks;
    this.currentVersion = currentVersion;
  }

  getCurrentKekVersion(): number {
    return this.currentVersion;
  }

  async wrapKey(dekBytes: Uint8Array, kekVersion: number): Promise<string> {
    const kek = this.masterKeys.get(kekVersion);
    if (!kek) throw new Error(`KEK versión ${kekVersion} no encontrada en KMS`);

    const subtle = getSubtle();
    const cryptoKey = await subtle.importKey('raw', kek as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = getRandomBytes(12);
    const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, dekBytes as BufferSource);

    // Empaqueta iv + ciphertext
    const combined = new Uint8Array(iv.length + wrapped.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(wrapped), iv.length);
    return toBase64(combined);
  }

  async unwrapKey(wrappedDekBase64: string, kekVersion: number): Promise<Uint8Array> {
    const kek = this.masterKeys.get(kekVersion);
    if (!kek) throw new Error(`KEK versión ${kekVersion} no encontrada en KMS`);

    const combined = fromBase64(wrappedDekBase64);
    const iv = combined.slice(0, 12);
    const wrappedCiphertext = combined.slice(12);

    const subtle = getSubtle();
    const cryptoKey = await subtle.importKey('raw', kek as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, wrappedCiphertext as BufferSource);
    return new Uint8Array(decrypted);
  }
}

/**
 * Cifrado Envelope de datos o miniaturas con DEK única por expediente y KEK administrada (OBS-2).
 */
export async function encryptEnvelope(
  plainText: string,
  kms: KmsProvider
): Promise<EnvelopeEncryptedPayload> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const plainBytes = enc.encode(plainText);

  // 1. Genera DEK de 256 bits exclusiva para este registro
  const dekBytes = getRandomBytes(32);
  const dekKey = await subtle.importKey('raw', dekBytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);

  // 2. Cifra el contenido con la DEK
  const iv = getRandomBytes(12);
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dekKey,
    plainBytes as BufferSource
  );

  // 3. Envuelve la DEK usando la KEK del KMS
  const kekVersion = kms.getCurrentKekVersion();
  const wrappedDek = await kms.wrapKey(dekBytes, kekVersion);

  const keyId = `dek_${Date.now()}_${toBase64(getRandomBytes(6)).replace(/[/+=]/g, '')}`;

  return {
    version: CRYPTO_VERSION,
    alg: ENVELOPE_ALG,
    kekVersion,
    wrappedDek,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipherBuffer)),
    keyId,
  };
}

/**
 * Descifrado Envelope: Desenvuelve DEK vía KMS y descifra con AES-GCM.
 */
export async function decryptEnvelope(
  payload: EnvelopeEncryptedPayload,
  kms: KmsProvider
): Promise<string> {
  const subtle = getSubtle();

  // 1. Desenvuelve la DEK con la KEK correspondiente
  const dekBytes = await kms.unwrapKey(payload.wrappedDek, payload.kekVersion);
  const dekKey = await subtle.importKey('raw', dekBytes as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);

  // 2. Descifra el ciphertext
  const iv = fromBase64(payload.iv);
  const cipherBytes = fromBase64(payload.ciphertext);

  const decryptedBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dekKey,
    cipherBytes as BufferSource
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}

/**
 * Blind Indexing (HMAC-SHA256)
 * Genera un índice ciego determinista y seguro para búsquedas exactas sin revelar el PII en reposo.
 */
export async function computeBlindIndex(
  input: string,
  hmacKey: Uint8Array
): Promise<string> {
  if (hmacKey.length < 32) {
    throw new Error('La llave de Blind Index debe tener al menos 32 bytes.');
  }
  const normalized = input.trim().toUpperCase().replace(/\s+/g, '');
  const enc = new TextEncoder();
  const subtle = getSubtle();

  const key = await subtle.importKey(
    'raw',
    hmacKey as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await subtle.sign('HMAC', key, enc.encode(normalized) as BufferSource);
  const hashArray = Array.from(new Uint8Array(signature));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 32); // Retorna los primeros 32 caracteres hexadecimales
}

import crypto from 'node:crypto';

/**
 * Hash Chaining SHA-256 para Bitácora Forense Inmutable v1 (Síncrono)
 * recordHash = SHA-256(prevHash + id + ts + actorEmail + action + outcome + sourceIp + curpMasked)
 */
export function computeRecordHashV1Sync(data: {
  prevHash: string;
  id: string;
  ts: string;
  actorEmail: string;
  action: string;
  outcome: string;
  sourceIp: string;
  curpMasked?: string;
}): string {
  const payload = [
    data.prevHash,
    data.id,
    data.ts,
    data.actorEmail,
    data.action,
    data.outcome,
    data.sourceIp,
    data.curpMasked ?? '',
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Hash Chaining SHA-256 v2 (Síncrono)
 * Incluye campos adicionales y JSON canónico
 */
export function computeRecordHashV2Sync(data: {
  chain_seq: number;
  id: string;
  ts: string;
  actor_email: string;
  actor_role: string;
  action: string;
  outcome: string;
  source_ip: string;
  source_summary: string;
  curp_masked?: string;
  blind_curp_prefix?: string;
  expediente_id?: string;
  details?: string;
  prev_hash: string;
}): string {
  // JSON canónico: claves ordenadas alfabéticamente
  const canonicalObj = {
    action: data.action,
    actor_email: data.actor_email,
    actor_role: data.actor_role,
    blind_curp_prefix: data.blind_curp_prefix ?? null,
    chain_seq: data.chain_seq,
    curp_masked: data.curp_masked ?? null,
    details: data.details ?? null,
    expediente_id: data.expediente_id ?? null,
    id: data.id,
    outcome: data.outcome,
    prev_hash: data.prev_hash,
    source_ip: data.source_ip,
    source_summary: data.source_summary,
    ts: data.ts,
    v: 2
  };
  
  const payload = JSON.stringify(canonicalObj);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Mantenemos la versión async para compatibilidad si alguien la usaba,
 * o la marcamos obsoleta
 */
export async function computeRecordHash(data: {
  prevHash: string;
  id: string;
  ts: string;
  actorEmail: string;
  action: string;
  outcome: string;
  sourceIp: string;
  curpMasked?: string;
}): Promise<string> {
  return computeRecordHashV1Sync(data);
}
