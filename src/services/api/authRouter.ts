/**
 * ENRUTADOR DE AUTENTICACIÓN 2FA TOTP (RFC 6238) — CRUSE-APO-2026-005 / 028
 *
 * POST /auth/login        Paso 1: contraseña (scrypt) → desafío 2FA (`tempToken` opaco single-use).
 *                         El URI de enrolamiento TOTP (`enrollment`) solo se entrega si `totp_enrolled = 0`.
 * POST /auth/verify-totp  Paso 2: código TOTP de 6 dígitos (o código de recuperación de emergencia)
 *                         + cambio obligatorio de contraseña temporal en primer acceso (Guardrail 1)
 *                         → consumo atómico de `tempToken` (Guardrail 3) → sesión opaca de 15 min.
 * POST /auth/refresh      Rotación estricta del token (Bearer).
 * POST /auth/logout       Revocación real en servidor + evento LOGOUT.
 */

import { Router, Request, Response } from 'express';
import { LoginChallengeResponse } from '../../types';
import { db } from '../db/connectionPool';
import { totpRateLimiter, smsSendRateLimiter, refreshRateLimiter } from '../auth/rateLimiter';
import { verifyPassword, verifyPasswordAgainstDummy, hashPassword } from '../auth/passwordHasher';
import { verifyTotpToken, generateTotpUri } from '../auth/totpService';
import {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  decryptTotpSecret,
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
import { CREDENTIAL_LIMITS, TOTP_ISSUER } from '../../config/authConfig';

export const authRouter = Router();

const TOTP_CODE_PATTERN = new RegExp(`^\\d{${CREDENTIAL_LIMITS.totpCodeLength}}$`);
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

    const rateKeyUser = `login_challenge_user_${user.id}`;
    const rateKeyIp = `login_challenge_ip_${ip}`;
    const userRateCheck = smsSendRateLimiter.check(rateKeyUser);
    const ipRateCheck = smsSendRateLimiter.check(rateKeyIp);

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
        details: `Bloqueo por exceso de desafíos 2FA solicitados (reintentar en ${retryAfterSeconds} s)`,
      });
      return res.status(429).json({
        error: `Has excedido el límite de solicitudes de desafío 2FA. Intenta nuevamente en ${Math.ceil((retryAfterSeconds || 3600) / 60)} minutos.`,
        retryAfterSeconds,
      });
    }

    const authUser = toAuthenticatedUser(user);
    const tempToken = await createPendingTotp(user.id);

    const body: LoginChallengeResponse = {
      requireTotp: true,
      tempToken,
      name: authUser.name,
      role: authUser.role,
      totpEnrolled: authUser.totpEnrolled,
      mustChangePassword: authUser.mustChangePassword,
    };

    // Guardrail 3 y Punto 2: Si el usuario aún no ha enrolado su teléfono móvil (totp_enrolled === 0),
    // desencriptamos en memoria su semilla AES-GCM-256 y entregamos el URI otpauth:// para su app autenticadora.
    if (!authUser.totpEnrolled) {
      const totpSecret = await decryptTotpSecret(user);
      body.enrollment = {
        otpauthUri: generateTotpUri(authUser.email, totpSecret, TOTP_ISSUER),
        manualKey: totpSecret,
      };
    }

    return res.json(body);
  } catch (err: unknown) {
    console.error('Error en /auth/login:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
});

authRouter.post('/verify-totp', async (req: Request, res: Response) => {
  const { ip, sourceSummary } = requestOrigin(req);
  try {
    const tempToken: unknown = req.body?.tempToken;
    const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const newPassword: unknown = req.body?.newPassword;

    const isSixDigitTotp = TOTP_CODE_PATTERN.test(rawCode);
    const isRecoveryCode = RECOVERY_CODE_PATTERN.test(rawCode);

    if (!isSixDigitTotp && !isRecoveryCode) {
      return res.status(400).json({
        error: `Introduce un código TOTP de ${CREDENTIAL_LIMITS.totpCodeLength} dígitos de tu app autenticadora o un código de recuperación válido (XXXX-XXXX).`,
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
        details: `Bloqueo por exceso de intentos 2FA (reintentar en ${rateCheck.retryAfterSeconds} s)`,
      });
      return res.status(429).json({
        error: `Demasiados intentos fallidos de 2FA. Acceso bloqueado por seguridad durante ${Math.ceil((rateCheck.retryAfterSeconds ?? 900) / 60)} minutos.`,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
    }

    const authUser = toAuthenticatedUser(user);
    const firstEnrollment = !authUser.totpEnrolled;
    const mustChangePassword = Boolean(authUser.mustChangePassword);

    // En el primer enrolamiento (totp_enrolled === 0), obligamos a verificar con código TOTP de 6 dígitos
    // generado en el teléfono móvil del usuario para certificar que vinculó su app autenticadora.
    if (firstEnrollment && !isSixDigitTotp) {
      return res.status(400).json({
        error: 'Para completar el enrolamiento inicial debes ingresar el código de 6 dígitos generado por la aplicación autenticadora en tu teléfono móvil.',
      });
    }

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

    if (isSixDigitTotp) {
      const secretBase32 = await decryptTotpSecret(user);
      const verification = await verifyTotpToken(rawCode, secretBase32);
      valid2FA = verification.valid;
    }

    if (!valid2FA) {
      // Si ya estaba enrolado y proporcionó un código de recuperación de emergencia (XXXX-XXXX)
      if (!firstEnrollment && isRecoveryCode) {
        valid2FA = await verifyAndConsumeBackupCode(user.id, rawCode);
        usedRecoveryCode = valid2FA;
      }
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
        details: `Código 2FA TOTP inválido. Intentos restantes antes de bloqueo: ${failure.remaining}`,
      });
      return res.status(401).json({
        error: 'Código 2FA inválido o expirado. Verifica la hora de tu teléfono móvil.',
        remainingAttempts: failure.remaining,
        locked: failure.locked,
      });
    }

    // Guardrail 3: Consumo atómico single-use del tempToken vinculado a userId + actualización de estado + emisión de sesión
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
        ? `Enrolamiento 2FA TOTP en teléfono móvil completado${mustChangePassword ? ' con cambio de contraseña temporal' : ''}`
        : usedRecoveryCode
          ? 'Acceso autorizado mediante código de recuperación de emergencia de un solo uso'
          : `Acceso seguro mediante 2FA TOTP autorizado correctamente${mustChangePassword ? ' (contraseña temporal actualizada)' : ''}`,
    });

    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
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
