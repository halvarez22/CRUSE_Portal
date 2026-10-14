/**
 * RATE LIMITER ESTRICTO — PREVENCIÓN DE FUERZA BRUTA (OBS-3)
 *
 * Protege endpoints sensibles (/api/auth/verify-totp, /api/auth/refresh).
 * Límite estricto: Máximo 5 intentos fallidos en una ventana de 15 minutos.
 * Bloquea temporalmente solicitudes excedentes y provee tiempo de espera (retryAfterSeconds).
 */

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

    // Verificar si está bloqueado temporalmente
    if (record.lockedUntil && now < record.lockedUntil) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    // Si la ventana expiró, reiniciar contador
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
   * Registra un intento fallido y activa bloqueo si se supera el umbral.
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

// Limitador por defecto para autenticación TOTP, envío de SMS (anti SMS-Pumping) y refresh
export const totpRateLimiter = new StrictRateLimiter(5, 15, 15);
export const smsSendRateLimiter = new StrictRateLimiter(3, 60, 60);
export const refreshRateLimiter = new StrictRateLimiter(10, 1, 5);
