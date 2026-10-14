/**
 * CONSTANTES DE AUTENTICACIÓN Y SESIÓN — CRUSE-APO-2026-005 (Bloques A.2 / A.3)
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

/** Sesión institucional Zero-Trust. */
export const SESSION_TTL_MINUTES = 15;

/** Vigencia del desafío 2FA tras validar la contraseña. */
export const PENDING_TOTP_TTL_MINUTES = 5;

/** Entropía de tokens opacos (sesión y desafío 2FA): 256 bits. */
export const OPAQUE_TOKEN_BYTES = 32;

/** Tolerancia de desfase del reloj del móvil (pasos de 30 s). */
export const TOTP_WINDOW_STEPS = 1;

/** Emisor mostrado en la app autenticadora. */
export const TOTP_ISSUER = 'Microfinanciera Cruse';

/** Contraseña temporal generada por los scripts de alta (bytes aleatorios → base64url). */
export const TEMP_PASSWORD_BYTES = 18;

/** Límites de validación de entrada (Regla 5: validación estricta). */
export const CREDENTIAL_LIMITS = {
  emailMaxLength: 254,
  nameMaxLength: 255,
  passwordMinLength: 12,
  passwordMaxLength: 256,
  totpCodeLength: 6,
  opaqueTokenMaxLength: 128,
} as const;
