import twilio from 'twilio';
import crypto from 'node:crypto';
import { getServerEnv } from '../../config/serverEnv';

interface PendingOtpRecord {
  mode: 'verify' | 'local_fallback';
  targetPhone: string;
  serviceSid?: string;
  code?: string;
  expires: number;
}

let client: twilio.Twilio | null = null;
let cachedVerifyServiceSid: string | null = null;

function getTwilioClient(): twilio.Twilio | null {
  if (client) return client;
  const env = getServerEnv();
  if (env.twilioAccountSid && env.twilioAuthToken) {
    client = twilio(env.twilioAccountSid, env.twilioAuthToken);
  }
  return client;
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
    friendlyName: 'CRUSE FINTECH',
    codeLength: 6,
  });
  cachedVerifyServiceSid = created.sid;
  return cachedVerifyServiceSid;
}

// Registro de sesiones OTP pendientes con TTL de 5 minutos
const otpMap = new Map<string, PendingOtpRecord>();
const OTP_TTL_MS = 5 * 60 * 1000;

export class SmsDeliveryError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 503) {
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

export async function sendSmsOtp(
  userId: string,
  toPhone?: string | null
): Promise<{ maskedPhone: string }> {
  const env = getServerEnv();
  // Regla 2 y Regla 5: Cero Hardcoding. Prioridad: 1. toPhone (DB), 2. TEST_PHONE_NUMBER (.env)
  const targetPhone = toPhone?.trim() || env.testPhoneNumber?.trim() || '';

  if (!targetPhone) {
    throw new SmsDeliveryError('No existe número telefónico móvil registrado para este usuario.', 503);
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
        });

      otpMap.set(userId, {
        mode: 'verify',
        targetPhone,
        serviceSid,
        expires: Date.now() + OTP_TTL_MS,
      });
      console.log(`[SMS Verify] OTP despachado vía Twilio Verify (${serviceSid}) a ${maskedPhone}.`);
      return { maskedPhone };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SMS Verify] Fallo al despachar con Twilio Verify: ${errMsg}`);

      // Fallback de Desarrollo (Condición Estricta CRUSE-APO-2026-009):
      // NUNCA imprimir ni generar fallback en consola si estamos en producción.
      if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
        const fallbackCode = crypto.randomInt(100000, 999999).toString();
        otpMap.set(userId, {
          mode: 'local_fallback',
          targetPhone,
          code: fallbackCode,
          expires: Date.now() + OTP_TTL_MS,
        });
        console.warn(
          `[FALLBACK DESARROLLO 2FA] Twilio rechazó el envío. Código OTP criptográfico local para ${userId}: ${fallbackCode} (expira en 5 min)`
        );
        return { maskedPhone };
      }

      throw new SmsDeliveryError(
        'Servicio de mensajería SMS 2FA temporalmente no disponible. Intente más tarde o utilice un código de recuperación.',
        503
      );
    }
  }

  // Si no hay credenciales de Twilio configuradas
  if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
    const fallbackCode = crypto.randomInt(100000, 999999).toString();
    otpMap.set(userId, {
      mode: 'local_fallback',
      targetPhone,
      code: fallbackCode,
      expires: Date.now() + OTP_TTL_MS,
    });
    console.warn(
      `[SIMULACIÓN DESARROLLO 2FA] Twilio no configurado. Código OTP criptográfico local para ${userId}: ${fallbackCode}`
    );
    return { maskedPhone };
  }

  throw new SmsDeliveryError('Proveedor de mensajería SMS 2FA no configurado en producción.', 503);
}

export async function verifySmsOtp(userId: string, code: string): Promise<boolean> {
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
          code,
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

  if (record.mode === 'local_fallback' && record.code) {
    // Comparación en tiempo constante (timing-safe) para mitigar Side-Channel Attacks
    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(record.code),
        Buffer.from(code)
      );
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
