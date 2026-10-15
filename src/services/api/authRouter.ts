/**
 * ENRUTADOR DE AUTENTICACIÓN 2FA — CRUSE-APO-2026-005 (Bloques A.2 / A.3)
 *
 * POST /auth/login        Paso 1: contraseña (scrypt) → desafío 2FA (tempToken opaco).
 *                         El URI de enrolamiento TOTP solo se entrega si totp_enrolled = 0.
 * POST /auth/verify-totp  Paso 2: código TOTP con rate limiting por usuario → sesión opaca de 15 min.
 * POST /auth/refresh      Rotación estricta del token (Bearer).
 * POST /auth/logout       Revocación real en servidor + evento LOGOUT.
 */

import { Router, Request, Response } from 'express';
import { LoginChallengeResponse } from '../../types';
import { totpRateLimiter, smsSendRateLimiter, refreshRateLimiter } from '../auth/rateLimiter';
import { sendSmsOtp, verifySmsOtp, SmsDeliveryError } from '../auth/smsService';
import { verifyPassword, verifyPasswordAgainstDummy } from '../auth/passwordHasher';
import {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  markTotpEnrolled,
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

const TOTP_CODE_PATTERN = new RegExp(`^\\d{${CREDENTIAL_LIMITS.totpCodeLength}}$`);

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
    const passwordOk = user ? await verifyPassword(password, user.password_hash) : await verifyPasswordAgainstDummy(password);
    if (!user || !passwordOk || user.active !== 1) {
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

    // Mitigación de SMS Pumping Fraud (CRUSE-APO-2026-009):
    // Máximo 3 solicitudes de envío SMS por hora por usuario o IP.
    const smsRateKeyUser = `sms_send_user_${user.id}`;
    const smsRateKeyIp = `sms_send_ip_${ip}`;
    const userRateCheck = smsSendRateLimiter.check(smsRateKeyUser);
    const ipRateCheck = smsSendRateLimiter.check(smsRateKeyIp);

    if (!userRateCheck.allowed || !ipRateCheck.allowed) {
      const retryAfterSeconds = Math.max(
        userRateCheck.retryAfterSeconds ?? 0,
        ipRateCheck.retryAfterSeconds ?? 0
      );
      await auditEventStore.append({
        actorEmail: user.email,
        actorRole: 'sistema',
        action: 'LOGIN_FAILURE',
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary,
        details: `Bloqueo anti SMS-Pumping por exceso de solicitudes OTP (reintentar en ${retryAfterSeconds} s)`,
      });
      return res.status(429).json({
        error: `Has excedido el límite de envíos de código SMS (máximo 3 por hora). Intenta nuevamente en ${Math.ceil((retryAfterSeconds || 3600) / 60)} minutos.`,
        retryAfterSeconds,
      });
    }

    const authUser = toAuthenticatedUser(user);
    const tempToken = await createPendingTotp(user.id);

    smsSendRateLimiter.recordFailure(smsRateKeyUser);
    smsSendRateLimiter.recordFailure(smsRateKeyIp);
    await sendSmsOtp(user.id, user.phone_number || undefined);

    const body: LoginChallengeResponse = {
      requireTotp: true,
      tempToken: tempToken,
      name: authUser.name,
      role: authUser.role,
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

authRouter.post('/verify-totp', async (req: Request, res: Response) => {
  const { ip, sourceSummary } = requestOrigin(req);
  try {
    const tempToken: unknown = req.body?.tempToken;
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!TOTP_CODE_PATTERN.test(code)) {
      return res.status(400).json({ error: `El código debe tener ${CREDENTIAL_LIMITS.totpCodeLength} dígitos.` });
    }

    const userId = await resolvePendingTotp(tempToken);
    const user = userId ? await findUserById(userId) : null;
    if (!user || user.active !== 1 || typeof tempToken !== 'string') {
      return res.status(401).json({ error: 'La sesión de autenticación 2FA ha expirado. Inicia sesión nuevamente.' });
    }

    // Rate limiting por usuario: re-iniciar sesión no reinicia el contador de intentos.
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
        details: `Bloqueo por exceso de intentos 2FA (reintentar en ${rateCheck.retryAfterSeconds} s)`,
      });
      return res.status(429).json({
        error: `Demasiados intentos fallidos de 2FA. Acceso bloqueado por seguridad durante ${Math.ceil((rateCheck.retryAfterSeconds ?? 900) / 60)} minutos.`,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
    }

    const authUser = toAuthenticatedUser(user);
    const valid = await verifySmsOtp(user.id, code);

    if (!valid) {
      const failure = totpRateLimiter.recordFailure(rateLimitKey);
      await auditEventStore.append({
        actorEmail: authUser.email,
        actorRole: authUser.role,
        action: 'LOGIN_FAILURE',
        outcome: 'failure',
        sourceIp: ip,
        sourceSummary,
        details: `Código SMS incorrecto. Intentos restantes antes de bloqueo: ${failure.remaining}`,
      });
      return res.status(401).json({
        error: 'Código SMS inválido o expirado.',
        remainingAttempts: failure.remaining,
        locked: failure.locked,
      });
    }

    totpRateLimiter.reset(rateLimitKey);
    await consumePendingTotp(tempToken);
    const firstEnrollment = !authUser.totpEnrolled;
    if (firstEnrollment) await markTotpEnrolled(authUser.id);
    const session = await createSession(authUser.id);

    await auditEventStore.append({
      actorEmail: authUser.email,
      actorRole: authUser.role,
      action: 'LOGIN_2FA_SUCCESS',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: firstEnrollment
        ? 'Enrolamiento 2FA SMS completado y acceso autorizado'
        : 'Acceso seguro mediante 2FA SMS autorizado correctamente',
    });

    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: { ...authUser, totpEnrolled: true },
    });
  } catch (err: unknown) {
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
    const token = parseBearer(req.headers.authorization);
    const rotated = token ? await rotateSession(token) : null;
    if (!rotated) {
      refreshRateLimiter.recordFailure(rateLimitKey);
      return res.status(401).json({ error: 'Sesión expirada' });
    }
    return res.json({ token: rotated.issued.token, expiresAt: rotated.issued.expiresAt, user: rotated.user });
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
      details: 'Sesión revocada en servidor por cierre voluntario',
    });
    return res.json({ ok: true });
  } catch (err: unknown) {
    console.error('Error en /auth/logout:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
});
