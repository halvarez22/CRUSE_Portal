import twilio from 'twilio';
import crypto from 'node:crypto';
import { getServerEnv } from '../../config/serverEnv';
import { AUTH_ISSUER_NAME } from '../../config/authConfig';

export type SmsDispatchMode = 'verify' | 'programmable_sms' | 'local_fallback';

interface PendingOtpRecord {
  mode: SmsDispatchMode;
  targetPhone: string;
  serviceSid?: string;
  /** Guardrail Forense 1 (CRUSE-APO-2026-038): Solo hash SHA-256 (64 hex chars), jamás OTP en texto plano */
  codeHash?: string;
  expires: number;
}

let client: twilio.Twilio | null = null;
let clientSidKey: string | null = null;
let cachedVerifyServiceSid: string | null = null;
let cachedSenderPhone: string | null = null;

/**
 * Guardrail Forense 1: Deriva el digest SHA-256 irreversible del código OTP de 6 dígitos.
 * Defensa en Profundidad (R7 Zero Trust): Valida explícitamente que `code` sea string no vacío.
 */
export function hashOtpCode(code: unknown): string {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return '';
  }
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

function getTwilioClient(): twilio.Twilio | null {
  const env = getServerEnv();
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    return null;
  }
  const key = `${env.twilioAccountSid}:${env.twilioAuthToken}`;
  if (!client || clientSidKey !== key) {
    client = twilio(env.twilioAccountSid, env.twilioAuthToken);
    clientSidKey = key;
    cachedVerifyServiceSid = null;
    cachedSenderPhone = null;
  }
  return client;
}

/**
 * Resuelve dinámicamente el número remitente para Programmable SMS (CRUSE-APO-2026-040).
 * Prioriza TWILIO_PHONE_NUMBER del entorno y, si no está definido o difiere de los números
 * activos en la cuenta, consulta incomingPhoneNumbers de la cuenta activa con caché en memoria.
 */
export async function resolveSenderPhoneNumber(twilioClient: twilio.Twilio): Promise<string | null> {
  if (cachedSenderPhone) {
    return cachedSenderPhone;
  }
  const env = getServerEnv();
  try {
    const incoming = await twilioClient.incomingPhoneNumbers.list({ limit: 5 });
    if (incoming.length > 0) {
      const envMatch = env.twilioPhoneNumber
        ? incoming.find((n) => n.phoneNumber === env.twilioPhoneNumber)
        : undefined;
      const smsCapable = incoming.find((n) => n.capabilities?.sms);
      cachedSenderPhone = (envMatch ?? smsCapable ?? incoming[0]).phoneNumber;
      return cachedSenderPhone;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[SMS Sender Resolver] No se pudo listar incomingPhoneNumbers: ${msg}`);
  }
  if (env.twilioPhoneNumber) {
    cachedSenderPhone = env.twilioPhoneNumber;
    return cachedSenderPhone;
  }
  return null;
}

async function resolveVerifyServiceSid(twilioClient: twilio.Twilio): Promise<string> {
  const env = getServerEnv();
  if (env.twilioVerifyServiceSid) {
    return env.twilioVerifyServiceSid;
  }
  if (cachedVerifyServiceSid) {
    return cachedVerifyServiceSid;
  }

  const existingServices = await twilioClient.verify.v2.services.list({ limit: 5 });
  if (existingServices.length > 0) {
    cachedVerifyServiceSid = existingServices[0].sid;
    return cachedVerifyServiceSid;
  }

  const created = await twilioClient.verify.v2.services.create({
    friendlyName: AUTH_ISSUER_NAME,
    codeLength: 6,
    customCodeEnabled: false,
  });
  cachedVerifyServiceSid = created.sid;
  return cachedVerifyServiceSid;
}

/**
 * Construye el cuerpo institucional canónico para el canal secundario Programmable SMS (CRUSE-APO-2026-039).
 */
export function buildInstitutionalSmsBody(otpCode: string): string {
  return `Su código de verificación para ${AUTH_ISSUER_NAME} es: ${otpCode}`;
}

// Registro de sesiones OTP pendientes con TTL de 10 minutos (CRUSE-APO-2026-038)
const otpMap = new Map<string, PendingOtpRecord>();
const OTP_TTL_MS = 10 * 60 * 1000;

export class SmsDeliveryError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'SmsDeliveryError';
    this.statusCode = statusCode;
  }
}

export function formatMaskedPhoneForDisplay(phone: string | null | undefined): string {
  const cleaned = (phone ?? '').trim();
  if (!cleaned) return '+52 •••• •••• ••••';
  const last4 = cleaned.slice(-4);
  const countryPrefix = cleaned.startsWith('+52')
    ? '+52'
    : cleaned.slice(0, Math.max(0, cleaned.length - 10)) || '+52';
  return `${countryPrefix} •••• •••• ${last4}`;
}

/**
 * Helper de inspección forense SQA (sin exponer secretos): certifica que otpMap
 * almacena exclusivamente hashes SHA-256 de 64 caracteres hexadecimales y jamás texto plano.
 */
export function inspectPendingOtpState(userId: string): {
  exists: boolean;
  mode?: SmsDispatchMode;
  hasCodeHash: boolean;
  codeHashLength: number;
  expires?: number;
} {
  const rec = otpMap.get(userId);
  if (!rec) {
    return { exists: false, hasCodeHash: false, codeHashLength: 0 };
  }
  return {
    exists: true,
    mode: rec.mode,
    hasCodeHash: typeof rec.codeHash === 'string' && /^[a-f0-9]{64}$/.test(rec.codeHash),
    codeHashLength: rec.codeHash ? rec.codeHash.length : 0,
    expires: rec.expires,
  };
}

/**
 * Permite registrar un OTP con canal específico en pruebas unitarias SQA (Guardrails 1 y 2).
 */
export function registerHashedOtpForTest(
  userId: string,
  targetPhone: string,
  plainOtp: string,
  mode: 'programmable_sms' | 'local_fallback' = 'programmable_sms'
): void {
  const env = getServerEnv();
  if (env.nodeEnv === 'production') {
    throw new Error('registerHashedOtpForTest está prohibido en entorno de producción.');
  }
  otpMap.set(userId, {
    mode,
    targetPhone,
    codeHash: hashOtpCode(plainOtp),
    expires: Date.now() + OTP_TTL_MS,
  });
}

export async function sendSmsOtp(
  userId: string,
  toPhone?: string | null
): Promise<{ maskedPhone: string; channel?: SmsDispatchMode }> {
  const env = getServerEnv();
  // Regla 2 y Regla 5: Cero Hardcoding. Prioridad: 1. toPhone (DB), 2. TEST_PHONE_NUMBER (.env)
  const targetPhone = toPhone?.trim() || env.testPhoneNumber?.trim() || '';

  if (!targetPhone) {
    throw new SmsDeliveryError('No existe número telefónico móvil registrado para este usuario.', 502);
  }

  const maskedPhone = formatMaskedPhoneForDisplay(targetPhone);
  const twilioClient = getTwilioClient();

  if (twilioClient) {
    try {
      const serviceSid = await resolveVerifyServiceSid(twilioClient);
      await twilioClient.verify.v2
        .services(serviceSid)
        .verifications.create({
          to: targetPhone,
          channel: 'sms',
          locale: 'es',
          customFriendlyName: AUTH_ISSUER_NAME,
        });

      otpMap.set(userId, {
        mode: 'verify',
        targetPhone,
        serviceSid,
        expires: Date.now() + OTP_TTL_MS,
      });
      console.log(`[SMS Verify] OTP despachado vía Twilio Verify (${serviceSid}) a ${maskedPhone}.`);
      return { maskedPhone, channel: 'verify' };
    } catch (verifyErr: unknown) {
      const verifyMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      console.warn(`[SMS Verify] Canal primario Twilio Verify rechazó el envío (${verifyMsg}). Evaluando fallback Programmable SMS...`);

      // Canal Secundario Resiliente (CRUSE-APO-2026-038 / 040): Twilio Programmable SMS con resolución dinámica de remitente
      const senderNumber = await resolveSenderPhoneNumber(twilioClient);
      if (senderNumber) {
        try {
          const generatedOtp = crypto.randomInt(100000, 999999).toString();
          const otpSha256 = hashOtpCode(generatedOtp);

          const message = await twilioClient.messages.create({
            from: senderNumber,
            to: targetPhone,
            body: buildInstitutionalSmsBody(generatedOtp),
          });

          otpMap.set(userId, {
            mode: 'programmable_sms',
            targetPhone,
            codeHash: otpSha256,
            expires: Date.now() + OTP_TTL_MS,
          });
          console.log(`[SMS Programmable Fallback] OTP despachado vía número dedicado (${message.sid}) desde ${senderNumber} a ${maskedPhone}.`);
          return { maskedPhone, channel: 'programmable_sms' };
        } catch (progErr: unknown) {
          const progMsg = progErr instanceof Error ? progErr.message : String(progErr);
          console.error(`[SMS Programmable Fallback] Fallo en envío con número dedicado (${senderNumber}): ${progMsg}`);
        }
      }

      // Fallback de Desarrollo (Condición Estricta CRUSE-APO-2026-009):
      // NUNCA imprimir ni generar fallback local en consola si estamos en producción.
      if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
        const fallbackCode = crypto.randomInt(100000, 999999).toString();
        otpMap.set(userId, {
          mode: 'local_fallback',
          targetPhone,
          codeHash: hashOtpCode(fallbackCode),
          expires: Date.now() + OTP_TTL_MS,
        });
        console.warn(
          `[FALLBACK DESARROLLO 2FA] Twilio rechazó el envío. Código OTP criptográfico local para ${userId}: ${fallbackCode} (expira en 10 min)`
        );
        return { maskedPhone, channel: 'local_fallback' };
      }

      throw new SmsDeliveryError(
        'Servicio de mensajería SMS 2FA temporalmente no disponible. Intente más tarde o utilice un código de recuperación.',
        502
      );
    }
  }

  // Si no hay credenciales de Twilio configuradas
  if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
    const fallbackCode = crypto.randomInt(100000, 999999).toString();
    otpMap.set(userId, {
      mode: 'local_fallback',
      targetPhone,
      codeHash: hashOtpCode(fallbackCode),
      expires: Date.now() + OTP_TTL_MS,
    });
    console.warn(
      `[SIMULACIÓN DESARROLLO 2FA] Twilio no configurado. Código OTP criptográfico local para ${userId}: ${fallbackCode}`
    );
    return { maskedPhone, channel: 'local_fallback' };
  }

  throw new SmsDeliveryError('Proveedor de mensajería SMS 2FA no configurado en producción.', 502);
}

export async function verifySmsOtp(userId: string, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return false;
  }
  const trimmedCode = code.trim();
  const record = otpMap.get(userId);
  if (!record) return false;

  if (Date.now() > record.expires) {
    otpMap.delete(userId);
    return false;
  }

  if (record.mode === 'verify' && record.serviceSid) {
    const twilioClient = getTwilioClient();
    if (!twilioClient) return false;
    try {
      const check = await twilioClient.verify.v2
        .services(record.serviceSid)
        .verificationChecks.create({
          to: record.targetPhone,
          code: trimmedCode,
        });
      const isApproved = check.status === 'approved';
      if (isApproved) {
        // Anti-Replay Attack: eliminar registro tras uso exitoso
        otpMap.delete(userId);
      }
      return isApproved;
    } catch (err: unknown) {
      console.error('[SMS Verify] Error verificando código en Twilio Verify:', err);
      return false;
    }
  }

  if ((record.mode === 'programmable_sms' || record.mode === 'local_fallback') && record.codeHash) {
    // Guardrail Forense 1 y 2: Comparación en tiempo constante sobre digests SHA-256 (32 bytes / 64 hex)
    let isValid = false;
    try {
      const inputHashHex = hashOtpCode(code);
      const expectedBuf = Buffer.from(record.codeHash, 'hex');
      const actualBuf = Buffer.from(inputHashHex, 'hex');
      if (expectedBuf.length === actualBuf.length && expectedBuf.length === 32) {
        isValid = crypto.timingSafeEqual(expectedBuf, actualBuf);
      }
    } catch {
      isValid = false;
    }

    if (isValid) {
      // Anti-Replay Attack: eliminar registro tras uso exitoso
      otpMap.delete(userId);
    }
    return isValid;
  }

  return false;
}
