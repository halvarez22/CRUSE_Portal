/**
 * CARGA VALIDADA DE SECRETOS DE SERVIDOR — CRUSE-APO-2026-005 (Bloque A.1)
 *
 * - Único punto del sistema que lee secretos desde process.env (Regla 5 SSD).
 * - Fail-fast: si una variable obligatoria falta o es inválida, se lanza un error
 *   que nombra la variable SIN imprimir su valor.
 * - Carga perezosa (lazy) para respetar el orden de dotenv.config() en server.ts.
 * - Exclusivo de servidor: NUNCA importar desde componentes React.
 */

export interface ServerEnv {
  kekCurrentVersion: number;
  keks: ReadonlyMap<number, Uint8Array>;
  blindIndexKey: Uint8Array;
  dbPath?: string;
  groqApiKey?: string;
  nodeEnv: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioVerifyServiceSid?: string;
  testPhoneNumber?: string;
}

export const KEK_BYTE_LENGTH = 32;
export const BLIND_INDEX_MIN_BYTES = 32;
const KEK_VAR_PATTERN = /^CRUSE_KEK_V(\d+)$/;

export class ServerEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerEnvError';
  }
}

function decodeBase64Strict(varName: string, raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    throw new ServerEnvError(`${varName} no es base64 válido.`);
  }
  return new Uint8Array(Buffer.from(trimmed, 'base64'));
}

function parseEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const errors: string[] = [];

  // 1. KEKs versionadas (CRUSE_KEK_V1, CRUSE_KEK_V2, ...)
  const keks = new Map<number, Uint8Array>();
  for (const [name, value] of Object.entries(source)) {
    const match = KEK_VAR_PATTERN.exec(name);
    if (!match || value === undefined) continue;
    try {
      const bytes = decodeBase64Strict(name, value);
      if (bytes.length !== KEK_BYTE_LENGTH) {
        errors.push(`${name} debe decodificar a exactamente ${KEK_BYTE_LENGTH} bytes.`);
        continue;
      }
      keks.set(Number(match[1]), bytes);
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : `${name} inválida.`);
    }
  }

  // 2. Versión vigente de KEK
  const rawVersion = source.CRUSE_KEK_CURRENT_VERSION;
  const kekCurrentVersion = rawVersion ? Number(rawVersion) : NaN;
  if (!Number.isInteger(kekCurrentVersion) || kekCurrentVersion < 1) {
    errors.push('CRUSE_KEK_CURRENT_VERSION es obligatoria y debe ser un entero >= 1.');
  } else if (!keks.has(kekCurrentVersion)) {
    errors.push(`No existe CRUSE_KEK_V${kekCurrentVersion} para la versión vigente declarada.`);
  }

  // 3. Llave HMAC del Blind Index
  let blindIndexKey: Uint8Array = new Uint8Array(0);
  const rawBlind = source.BLIND_INDEX_SECRET;
  if (!rawBlind) {
    errors.push('BLIND_INDEX_SECRET es obligatoria.');
  } else {
    try {
      blindIndexKey = decodeBase64Strict('BLIND_INDEX_SECRET', rawBlind);
      if (blindIndexKey.length < BLIND_INDEX_MIN_BYTES) {
        errors.push(`BLIND_INDEX_SECRET debe tener al menos ${BLIND_INDEX_MIN_BYTES} bytes.`);
      }
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : 'BLIND_INDEX_SECRET inválida.');
    }
  }

  if (errors.length > 0) {
    throw new ServerEnvError(
      `Configuración de secretos inválida (ver .env.example):\n - ${errors.join('\n - ')}`
    );
  }

  return {
    kekCurrentVersion,
    keks,
    blindIndexKey,
    dbPath: source.CRUSE_DB_PATH?.trim() || undefined,
    groqApiKey: source.GROQ_API_KEY?.trim() || undefined,
    nodeEnv: source.NODE_ENV ?? 'development',
    twilioAccountSid: source.TWILIO_ACCOUNT_SID?.trim() || undefined,
    twilioAuthToken: source.TWILIO_AUTH_TOKEN?.trim() || undefined,
    twilioPhoneNumber: source.TWILIO_PHONE_NUMBER?.trim() || undefined,
    twilioVerifyServiceSid: source.TWILIO_VERIFY_SERVICE_SID?.trim() || undefined,
    testPhoneNumber: source.TEST_PHONE_NUMBER?.trim() || undefined,
  };
}

let cachedEnv: ServerEnv | null = null;

/**
 * Devuelve la configuración validada. La primera invocación valida y cachea.
 */
export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

/**
 * Validación explícita al arranque (server.ts / scripts). Lanza ServerEnvError si falla.
 */
export function loadServerEnv(): ServerEnv {
  cachedEnv = null;
  return getServerEnv();
}
