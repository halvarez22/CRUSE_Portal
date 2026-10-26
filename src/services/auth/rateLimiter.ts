/**
 * RATE LIMITER ESTRICTO & MULTI-NIVEL ANTI-SMS-PUMPING — CRUSE-APO-2026-030 (Directriz 2)
 *
 * Protege endpoints sensibles (/api/auth/login, /api/auth/resend-otp, /api/auth/verify-totp, /api/auth/refresh):
 * 1. StrictRateLimiter: Límite de intentos fallidos para verificación 2FA y rotación de tokens.
 * 2. MultiTierSmsRateLimiter: Evalúa de forma independiente y acumulativa las 3 ventanas por `user_id`:
 *    - 1 SMS por minuto (60 s)
 *    - 3 SMS por hora (3,600 s)
 *    - 10 SMS por día (86,400 s)
 *    Retorna el límite específico violado (`violatedLimit`) y el tiempo de espera (`retryAfterSeconds`).
 */

import { SMS_RATE_LIMIT_TIERS } from '../../config/authConfig';

interface RateLimitRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export class StrictRateLimiter {
  private records: Map<string, RateLimitRecord> = new Map();
  private maxAttempts: number;
  private windowMs: number;
  private lockDurationMs: number;

  constructor(
    maxAttempts = 5,
    windowMinutes = 15,
    lockDurationMinutes = 15
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMinutes * 60 * 1000;
    this.lockDurationMs = lockDurationMinutes * 60 * 1000;
  }

  /**
   * Verifica si una solicitud está permitida bajo la cuota.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record) {
      return { allowed: true, remaining: this.maxAttempts };
    }

    if (record.lockedUntil && now < record.lockedUntil) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    if (now - record.firstAttemptAt > this.windowMs) {
      this.records.delete(key);
      return { allowed: true, remaining: this.maxAttempts };
    }

    const remaining = Math.max(0, this.maxAttempts - record.count);
    return {
      allowed: record.count < this.maxAttempts,
      remaining,
      retryAfterSeconds: record.count >= this.maxAttempts ? Math.ceil(this.lockDurationMs / 1000) : undefined,
    };
  }

  /**
   * Registra un intento y activa bloqueo si se supera el umbral.
   */
  recordFailure(key: string): { allowed: boolean; remaining: number; locked: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    let record = this.records.get(key);

    if (!record || now - record.firstAttemptAt > this.windowMs) {
      record = { count: 1, firstAttemptAt: now };
    } else {
      record.count += 1;
    }

    if (record.count >= this.maxAttempts) {
      record.lockedUntil = now + this.lockDurationMs;
      this.records.set(key, record);
      return {
        allowed: false,
        remaining: 0,
        locked: true,
        retryAfterSeconds: Math.ceil(this.lockDurationMs / 1000),
      };
    }

    this.records.set(key, record);
    return {
      allowed: true,
      remaining: this.maxAttempts - record.count,
      locked: false,
    };
  }

  /**
   * Restablece el contador al verificarse un acceso exitoso.
   */
  reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Limpia registros expirados para evitar fugas de memoria.
   */
  prune(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now - record.firstAttemptAt > this.windowMs && (!record.lockedUntil || now > record.lockedUntil)) {
        this.records.delete(key);
      }
    }
  }
}

export interface MultiTierSmsCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  violatedLimit?: string;
}

/**
 * Directriz 2 (Punto 1 — Rate Limiter Multi-Nivel Anti-SMS-Pumping):
 * Evalúa las 3 ventanas independientes pero acumulativas por `user_id`:
 * - 1 SMS/min (60,000 ms)
 * - 3 SMS/hora (3,600,000 ms)
 * - 10 SMS/día (86,400,000 ms)
 */
export class MultiTierSmsRateLimiter {
  private historyByUser: Map<string, number[]> = new Map();

  check(userId: string, now = Date.now()): MultiTierSmsCheckResult {
    const maxWindowMs = 24 * 60 * 60 * 1000;
    const existing = this.historyByUser.get(userId) ?? [];
    const activeTimestamps = existing.filter((ts) => now - ts < maxWindowMs);

    if (activeTimestamps.length !== existing.length) {
      this.historyByUser.set(userId, activeTimestamps);
    }

    for (const tier of SMS_RATE_LIMIT_TIERS) {
      const inWindow = activeTimestamps.filter((ts) => now - ts < tier.windowMs);
      if (inWindow.length >= tier.maxRequests) {
        const oldestInWindow = inWindow[0] ?? now;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + tier.windowMs - now) / 1000));
        return {
          allowed: false,
          retryAfterSeconds,
          violatedLimit: tier.label,
        };
      }
    }

    return { allowed: true };
  }

  recordSend(userId: string, now = Date.now()): void {
    const maxWindowMs = 24 * 60 * 60 * 1000;
    const existing = (this.historyByUser.get(userId) ?? []).filter((ts) => now - ts < maxWindowMs);
    existing.push(now);
    this.historyByUser.set(userId, existing);
  }

  reset(userId: string): void {
    this.historyByUser.delete(userId);
  }
}

// Limitadores institucionales para verificación 2FA SMS, prevención Anti-SMS-Pumping y rotación de sesión
export const totpRateLimiter = new StrictRateLimiter(5, 15, 15);
export const smsSendRateLimiter = new MultiTierSmsRateLimiter();
export const smsIpRateLimiter = new StrictRateLimiter(15, 60, 60);
export const refreshRateLimiter = new StrictRateLimiter(10, 1, 5);
