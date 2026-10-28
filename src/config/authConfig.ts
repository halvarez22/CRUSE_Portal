/**
 * CONSTANTES DE AUTENTICACIÓN Y SESIÓN — CRUSE-APO-2026-005 / CRUSE-APO-2026-030
 *
 * Única fuente de verdad para parámetros criptográficos y de sesión (Regla 2 HRU).
 * No contiene secretos: solo parámetros públicos de configuración.
 */

/** Parámetros scrypt aprobados por auditoría (N=2^15, r=8, p=1, salt 16 bytes). */
export const SCRYPT_PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 64,
  saltBytes: 16,
  // scrypt requiere ~128 * N * r bytes (32 MiB); se eleva el techo para no rozar el límite por defecto.
  maxmemBytes: 64 * 1024 * 1024,
} as const;

/** Prefijo del formato serializado: scrypt$N$r$p$saltB64$hashB64 */
export const PASSWORD_HASH_PREFIX = 'scrypt';

/** Sesión institucional Zero-Trust (Access Token). */
export const SESSION_TTL_MINUTES = 15;

/** Sesión Persistente Segura de 8 Horas (Refresh Token rotativo con tope inamovible de 8h desde el login inicial). */
export const REFRESH_TOKEN_TTL_HOURS = 8;

/** Entropía del Refresh Token (64 bytes = 512 bits → 128 caracteres hexadecimales). */
export const REFRESH_TOKEN_BYTES = 64;

/** Vigencia del desafío 2FA SMS tras validar la contraseña. */
export const PENDING_CHALLENGE_TTL_MINUTES = 5;

/** Entropía de tokens opacos (sesión y desafío 2FA): 256 bits. */
export const OPAQUE_TOKEN_BYTES = 32;

/** Umbrales Anti-SMS-Pumping por user_id (1 SMS/min, 3 SMS/hora, 10 SMS/día). */
export const SMS_RATE_LIMIT_TIERS = [
  { id: '1_PER_MINUTE', maxRequests: 1, windowMs: 60 * 1000, label: '1 SMS/min' },
  { id: '3_PER_HOUR', maxRequests: 3, windowMs: 60 * 60 * 1000, label: '3 SMS/hora' },
  { id: '10_PER_DAY', maxRequests: 10, windowMs: 24 * 60 * 60 * 1000, label: '10 SMS/día' },
] as const;

/** Emisor institucional para notificaciones SMS 2FA. */
export const AUTH_ISSUER_NAME = 'Micro Financiera CRUSE';

/** Contraseña temporal generada por los scripts de alta (bytes aleatorios → base64url). */
export const TEMP_PASSWORD_BYTES = 18;

/** Límites de validación de entrada (Regla 5: validación estricta). */
export const CREDENTIAL_LIMITS = {
  emailMaxLength: 254,
  nameMaxLength: 255,
  passwordMinLength: 12,
  passwordMaxLength: 256,
  totpCodeLength: 6,
  opaqueTokenMaxLength: 160,
} as const;
