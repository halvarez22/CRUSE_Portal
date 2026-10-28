/**
 * ENRUTADOR DE AUTENTICACIÓN 2FA VÍA CÓDIGO SMS AL MÓVIL REGISTRADO (CERO APPS EXTERNAS)
 * Expediente: CRUSE-APO-2026-009 / 028 / 030 / 030-R2
 *
 * POST /auth/login        Paso 1: contraseña (scrypt) → evaluación de MultiTierSmsRateLimiter
 *                         (1 SMS/min, 3 SMS/hora, 10 SMS/día por `user_id`) → envío de código SMS
 *                         de 6 dígitos al teléfono móvil registrado (`sendSmsOtp`) + desafío `tempToken`
 *                         opaco single-use + teléfono enmascarado (`+52 •••• •••• 1234`).
 * POST /auth/resend-otp   Reenvío controlado del código SMS de 6 dígitos con MultiTierSmsRateLimiter
 *                         y registro WORM `SMS_RATE_LIMIT_EXCEEDED` en HTTP 429.
 * POST /auth/verify-totp  Paso 2: código SMS de 6 dígitos (o código de respaldo XXXX-XXXX)
 *                         + cambio obligatorio de contraseña temporal en primer acceso (Guardrail 1)
 *                         → consumo atómico de `tempToken` (Guardrail 3) → emisión de Access Token (15 min)
 *                         + Refresh Token criptográfico (`crypto.randomBytes(64).toString('hex')`, 8 horas).
 * POST /auth/refresh      Rotación estricta del par Access Token (15 min) + Refresh Token sin extender
 *                         jamás el `refresh_expires_at` original de 8 horas desde el login inicial.
 * POST /auth/logout       Revocación real en servidor + evento LOGOUT.
 */

import { Router, Request, Response } from 'express';
import { LoginChallengeResponse } from '../../types';
import { db } from '../db/connectionPool';
import {
  totpRateLimiter,
  smsSendRateLimiter,
  smsIpRateLimiter,
  refreshRateLimiter,
} from '../auth/rateLimiter';
import { verifyPassword, verifyPasswordAgainstDummy, hashPassword } from '../auth/passwordHasher';
import {
  sendSmsOtp,
  verifySmsOtp,
  SmsDeliveryError,
  formatMaskedPhoneForDisplay,
} from '../auth/smsService';
import {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  markTotpEnrolled,
  verifyAndConsumeBackupCode,
  toAuthenticatedUser,
} from '../auth/userRepository';
import {
  createSession,
  createPendingTotp,
  resolvePendingTotp,
  consumePendingTotp,
  parseBearer,
  resolveSession,
  revokeSession,
  rotateSession,
} from '../auth/sessionStore';
import { auditEventStore } from '../audit/auditEventStore';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { CREDENTIAL_LIMITS } from '../../config/authConfig';

export const authRouter = Router();

const SMS_CODE_PATTERN = new RegExp(`^\\d{${CREDENTIAL_LIMITS.totpCodeLength}}$`);
const RECOVERY_CODE_PATTERN = /^[A-Za-z2-9]{4}-?[A-Za-z2-9]{4}$/;

function requestOrigin(req: Request): { ip: string; sourceSummary: string } {
  const ip = extractClientIp(req.headers);
  return { ip, sourceSummary: buildSourceSummary(ip, req.headers['user-agent']) };
}

authRouter.post('/login', async (req: Request, res: Response) => {
  const { ip, sourceSummary } = requestOrigin(req);
  try {
    const email = normalizeEmail(req.body?.email);
    const password: unknown = req.body?.password;
    if (!email || typeof password !== 'string' || !password || password.length > CREDENTIAL_LIMITS.passwordMaxLength) {
      return res.status(400).json({ error: 'Credenciales incompletas o con formato inválido' });
    }

    const user = await findUserByEmail(email);
    const passwordOk = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPasswordAgainstDummy(password);

    if (!user || !passwordOk || Number(user.active) !== 1) {
      await auditEventStore.append({
        actorEmail: email,
        actorRole: 'sistema',
        action: 'LOGIN_FAILURE',
        outcome: 'failure',
        sourceIp: ip,
        sourceSummary,
        details: 'Usuario, contraseña o estado de cuenta inválido en paso 1 de autenticación',
      });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const rateKeyIp = `sms_send_ip_${ip}`;
    const userRateCheck = smsSendRateLimiter.check(user.id);
    const ipRateCheck = smsIpRateLimiter.check(rateKeyIp);

    if (!userRateCheck.allowed || !ipRateCheck.allowed) {
      const retryAfterSeconds = Math.max(
        userRateCheck.retryAfterSeconds ?? 0,
        ipRateCheck.retryAfterSeconds ?? 0
      );
      const violatedLimit = !userRateCheck.allowed
        ? (userRateCheck.violatedLimit ?? '1 SMS/min')
        : '15 SMS/hora por IP';

      await auditEventStore.append({
        actorEmail: user.email,
        actorRole: 'sistema',
        action: 'SMS_RATE_LIMIT_EXCEEDED',
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary,
        details: `Bloqueo Anti-SMS-Pumping para user_id=${user.id}: límite violado [${violatedLimit}] (reintentar en ${retryAfterSeconds} s)`,
      });

      return res.status(429).json({
        error: `Has excedido el límite de envíos de código SMS 2FA (${violatedLimit}). Intenta nuevamente en ${retryAfterSeconds} segundos.`,
        retryAfterSeconds,
        violatedLimit,
      });
    }

    let maskedPhone = formatMaskedPhoneForDisplay(user.phone_number);
    let smsDelivered = true;
    let smsWarning: string | undefined;

    try {
      const dispatchResult = await sendSmsOtp(user.id, user.phone_number);
      maskedPhone = dispatchResult.maskedPhone;
      smsSendRateLimiter.recordSend(user.id);
      smsIpRateLimiter.recordFailure(rateKeyIp);
    } catch (smsErr: unknown) {
      if (smsErr instanceof SmsDeliveryError) {
        smsDelivered = false;
        smsWarning =
          'El canal SMS externo (Twilio) se encuentra en validación regulatoria KYC. Puedes ingresar inmediatamente utilizando cualquiera de tus Códigos de Recuperación de Emergencia (XXXX-XXXX).';
        await auditEventStore.append({
          actorEmail: user.email,
          actorRole: 'sistema',
          action: 'LOGIN_FAILURE',
          outcome: 'failure',
          sourceIp: ip,
          sourceSummary,
          details: `Degradación de pasarela SMS 2FA en paso 1 (${smsErr.message}). Se habilita desafío 2FA en modo Código de Recuperación de Emergencia (XXXX-XXXX).`,
        });
      } else {
        throw smsErr;
      }
    }

    const authUser = toAuthenticatedUser(user);
    const tempToken = await createPendingTotp(user.id);

    const body: LoginChallengeResponse = {
      requireTotp: true,
      tempToken,
      name: authUser.name,
      role: authUser.role,
      maskedPhone,
      smsDelivered,
      smsWarning,
      totpEnrolled: authUser.totpEnrolled,
      mustChangePassword: authUser.mustChangePassword,
    };

    return res.json(body);
  } catch (err: unknown) {
    if (err instanceof SmsDeliveryError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error en /auth/login:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
});

authRouter.post('/resend-otp', async (req: Request, res: Response) => {
  const { ip, sourceSummary } = requestOrigin(req);
  try {
    const tempToken: unknown = req.body?.tempToken;
    const userId = await resolvePendingTotp(tempToken);
    const user = userId ? await findUserById(userId) : null;
    if (!user || Number(user.active) !== 1) {
      return res.status(401).json({
        error: 'La sesión de verificación 2FA ha expirado. Inicia sesión nuevamente.',
      });
    }

    const rateKeyIp = `sms_send_ip_${ip}`;
    const userRateCheck = smsSendRateLimiter.check(user.id);
    const ipRateCheck = smsIpRateLimiter.check(rateKeyIp);

    if (!userRateCheck.allowed || !ipRateCheck.allowed) {
      const retryAfterSeconds = Math.max(
        userRateCheck.retryAfterSeconds ?? 0,
        ipRateCheck.retryAfterSeconds ?? 0
      );
      const violatedLimit = !userRateCheck.allowed
        ? (userRateCheck.violatedLimit ?? '1 SMS/min')
        : '15 SMS/hora por IP';

      await auditEventStore.append({
        actorEmail: user.email,
        actorRole: 'sistema',
        action: 'SMS_RATE_LIMIT_EXCEEDED',
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary,
        details: `Bloqueo Anti-SMS-Pumping en reenvío para user_id=${user.id}: límite violado [${violatedLimit}] (reintentar en ${retryAfterSeconds} s)`,
      });

      return res.status(429).json({
        error: `Límite de reenvíos SMS alcanzado por seguridad (${violatedLimit}). Intenta en ${retryAfterSeconds} segundos.`,
        retryAfterSeconds,
        violatedLimit,
      });
    }

    const { maskedPhone } = await sendSmsOtp(user.id, user.phone_number);
    smsSendRateLimiter.recordSend(user.id);
    smsIpRateLimiter.recordFailure(rateKeyIp);

    return res.json({
      ok: true,
      maskedPhone,
      message: `Nuevo código SMS de 6 dígitos enviado a ${maskedPhone}`,
    });
  } catch (err: unknown) {
    if (err instanceof SmsDeliveryError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error en /auth/resend-otp:', err);
    return res.status(500).json({ error: 'Error al reenviar código SMS' });
  }
});

authRouter.post('/verify-totp', async (req: Request, res: Response) => {
  const { ip, sourceSummary } = requestOrigin(req);
  try {
    const tempToken: unknown = req.body?.tempToken;
    const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const newPassword: unknown = req.body?.newPassword;

    const isSixDigitSms = SMS_CODE_PATTERN.test(rawCode);
    const isRecoveryCode = RECOVERY_CODE_PATTERN.test(rawCode);

    if (!isSixDigitSms && !isRecoveryCode) {
      return res.status(400).json({
        error: `Introduce el código SMS de ${CREDENTIAL_LIMITS.totpCodeLength} dígitos enviado a tu móvil registrado o un código de respaldo válido (XXXX-XXXX).`,
      });
    }

    const userId = await resolvePendingTotp(tempToken);
    const user = userId ? await findUserById(userId) : null;
    if (!user || Number(user.active) !== 1 || typeof tempToken !== 'string') {
      return res.status(401).json({
        error: 'La sesión de autenticación 2FA ha expirado o fue invalidada. Inicia sesión nuevamente.',
      });
    }

    const rateLimitKey = `totp_user_${user.id}`;
    const rateCheck = totpRateLimiter.check(rateLimitKey);
    if (!rateCheck.allowed) {
      await auditEventStore.append({
        actorEmail: user.email,
        actorRole: 'sistema',
        action: 'LOGIN_FAILURE',
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary,
        details: `Bloqueo por exceso de intentos 2FA SMS (reintentar en ${rateCheck.retryAfterSeconds} s)`,
      });
      return res.status(429).json({
        error: `Demasiados intentos fallidos de código SMS 2FA. Acceso bloqueado por seguridad durante ${Math.ceil((rateCheck.retryAfterSeconds ?? 900) / 60)} minutos.`,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
    }

    const authUser = toAuthenticatedUser(user);
    const firstEnrollment = !authUser.totpEnrolled;
    const mustChangePassword = Boolean(authUser.mustChangePassword);

    // Guardrail Forense 1: Cambio obligatorio de contraseña temporal en el primer inicio de sesión
    let updatedPasswordHash: string | undefined;
    if (mustChangePassword) {
      if (typeof newPassword !== 'string' || !newPassword.trim()) {
        return res.status(400).json({
          error: 'Cambio de contraseña obligatorio: debes definir una nueva contraseña personal para activar tu cuenta.',
          requirePasswordChange: true,
        });
      }
      const trimmedNewPwd = newPassword.trim();
      if (
        trimmedNewPwd.length < CREDENTIAL_LIMITS.passwordMinLength ||
        trimmedNewPwd.length > CREDENTIAL_LIMITS.passwordMaxLength
      ) {
        return res.status(400).json({
          error: `La nueva contraseña debe tener entre ${CREDENTIAL_LIMITS.passwordMinLength} y ${CREDENTIAL_LIMITS.passwordMaxLength} caracteres.`,
          requirePasswordChange: true,
        });
      }
      const sameAsTemp = await verifyPassword(trimmedNewPwd, user.password_hash);
      if (sameAsTemp) {
        return res.status(400).json({
          error: 'La nueva contraseña personal debe ser diferente a la contraseña temporal entregada por el administrador.',
          requirePasswordChange: true,
        });
      }
      updatedPasswordHash = await hashPassword(trimmedNewPwd);
    }

    let valid2FA = false;
    let usedRecoveryCode = false;

    if (isSixDigitSms) {
      valid2FA = await verifySmsOtp(user.id, rawCode);
    }

    if (!valid2FA && isRecoveryCode) {
      valid2FA = await verifyAndConsumeBackupCode(user.id, rawCode);
      usedRecoveryCode = valid2FA;
    }

    if (!valid2FA) {
      const failure = totpRateLimiter.recordFailure(rateLimitKey);
      await auditEventStore.append({
        actorEmail: authUser.email,
        actorRole: authUser.role,
        action: 'LOGIN_FAILURE',
        outcome: 'failure',
        sourceIp: ip,
        sourceSummary,
        details: `Código SMS 2FA inválido. Intentos restantes antes de bloqueo: ${failure.remaining}`,
      });
      return res.status(401).json({
        error: 'Código SMS 2FA inválido o expirado. Verifica el mensaje en tu teléfono móvil registrado.',
        remainingAttempts: failure.remaining,
        locked: failure.locked,
      });
    }

    // Guardrail 3 + Directriz 1: Consumo atómico single-use del tempToken + emisión de Access Token (15m) y Refresh Token (8h)
    const session = await db.transaction(async (tx) => {
      const consumed = await consumePendingTotp(tempToken, authUser.id, tx);
      if (!consumed) {
        throw new Error('TEMP_TOKEN_ALREADY_CONSUMED');
      }
      if (firstEnrollment || updatedPasswordHash) {
        await markTotpEnrolled(authUser.id, updatedPasswordHash, tx);
      }
      return createSession(authUser.id, tx);
    });

    totpRateLimiter.reset(rateLimitKey);

    await auditEventStore.append({
      actorEmail: authUser.email,
      actorRole: authUser.role,
      action: 'LOGIN_2FA_SUCCESS',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: firstEnrollment
        ? `Verificación inicial 2FA vía SMS en teléfono móvil completada${mustChangePassword ? ' con cambio de contraseña temporal' : ''} (Sesión persistente 8h emitida)`
        : usedRecoveryCode
          ? 'Acceso autorizado mediante código de respaldo de emergencia de un solo uso (Sesión persistente 8h emitida)'
          : `Acceso seguro mediante código SMS 2FA al móvil registrado autorizado correctamente${mustChangePassword ? ' (contraseña temporal actualizada)' : ''} (Sesión persistente 8h emitida)`,
    });

    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user: {
        ...authUser,
        totpEnrolled: true,
        mustChangePassword: false,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'TEMP_TOKEN_ALREADY_CONSUMED') {
      return res.status(401).json({
        error: 'Este desafío de autenticación ya fue utilizado (Single-Use Anti-Replay). Inicia sesión nuevamente.',
      });
    }
    console.error('Error en /auth/verify-totp:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { ip } = requestOrigin(req);
  try {
    const rateLimitKey = `refresh_${ip}`;
    if (!refreshRateLimiter.check(rateLimitKey).allowed) {
      return res.status(429).json({ error: 'Frecuencia de refresco excesiva.' });
    }
    const bodyRefreshToken =
      typeof req.body?.refreshToken === 'string' && req.body.refreshToken.trim()
        ? req.body.refreshToken.trim()
        : null;
    const candidateToken = bodyRefreshToken ?? parseBearer(req.headers.authorization);
    const rotated = candidateToken ? await rotateSession(candidateToken) : null;
    if (!rotated) {
      refreshRateLimiter.recordFailure(rateLimitKey);
      return res.status(401).json({
        error: 'La sesión persistente de 8 horas ha expirado o fue revocada. Ingresa nuevamente con tu contraseña y código SMS.',
      });
    }
    return res.json({
      token: rotated.issued.token,
      expiresAt: rotated.issued.expiresAt,
      refreshToken: rotated.issued.refreshToken,
      refreshExpiresAt: rotated.issued.refreshExpiresAt,
      user: rotated.user,
    });
  } catch (err: unknown) {
    console.error('Error en /auth/refresh:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  const { ip, sourceSummary } = requestOrigin(req);
  try {
    const token = parseBearer(req.headers.authorization);
    const session = token ? await resolveSession(token) : null;
    if (!session) {
      return res.status(401).json({ error: 'Sesión inexistente o ya cerrada' });
    }
    await revokeSession(session.sessionId);
    await auditEventStore.append({
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: 'LOGOUT',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: 'Sesión y Refresh Token revocados en servidor por cierre voluntario',
    });
    return res.json({ ok: true });
  } catch (err: unknown) {
    console.error('Error en /auth/logout:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
});
