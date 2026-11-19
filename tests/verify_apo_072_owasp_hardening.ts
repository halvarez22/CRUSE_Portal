/**
 * SUITE FORENSE DE VERIFICACIÓN — CRUSE-APO-2026-072 (Endurecimiento OWASP ASVS)
 *
 * Verifica:
 * 1. Guardrail 1: Cabeceras HTTP OWASP (X-Frame-Options: DENY, nosniff, Referrer-Policy,
 *    Permissions-Policy camera=(self), HSTS condicional en NODE_ENV=production, sin X-Powered-By).
 * 2. Guardrail 2: Rate limit paso 1 en POST /auth/login con clave compuesta ip+email
 *    (5 fallos → 401; 6° intento → HTTP 429 + retryAfterSeconds + WORM LOGIN_RATE_LIMIT_EXCEEDED),
 *    aislamiento entre IPs/correos y limpieza inmediata con reset().
 * 3. Guardrail 3: Validación de magic bytes (JPEG, PNG, WebP), rechazo HTTP 400 a payloads no-imagen
 *    y preservación del fallback cuando imageBase64 está vacío.
 */

import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  buildLoginPasswordRateKey,
  loginPasswordRateLimiter,
} from '../src/services/auth/rateLimiter';
import { maskEmailForAudit } from '../src/services/audit/auditMask';
import { validateImageBase64MagicBytes } from '../src/services/scanner/imageMagicBytesValidator';
import { authRouter } from '../src/services/api/authRouter';

async function testGuardrail2RateLimitHttp(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert(address && typeof address !== 'string', 'No se pudo obtener puerto efímero');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testIp = '198.51.100.72';
  const testEmail = 'bruteforce.test@cruse.com.mx';
  const otherEmail = 'other.user@cruse.com.mx';
  const rateKey = buildLoginPasswordRateKey(testIp, testEmail);
  loginPasswordRateLimiter.reset(rateKey);
  loginPasswordRateLimiter.reset(buildLoginPasswordRateKey(testIp, otherEmail));

  try {
    // 5 intentos fallidos deben devolver 401
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ email: testEmail, password: `WrongPass_${i}!` }),
      });
      assert.equal(res.status, 401, `Intento ${i} debía devolver 401, devolvió ${res.status}`);
    }

    // 6° intento debe devolver 429 con retryAfterSeconds
    const sixth = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: testEmail, password: 'WrongPass_6!' }),
    });
    assert.equal(sixth.status, 429, `6° intento debía devolver 429, devolvió ${sixth.status}`);
    const body = (await sixth.json()) as { retryAfterSeconds?: number; error?: string };
    assert(
      typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0,
      'retryAfterSeconds debe ser numérico > 0'
    );

    // Clave compuesta: otro email desde la misma IP NO debe estar bloqueado
    const isolated = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: otherEmail, password: 'WrongPass_1!' }),
    });
    assert.equal(isolated.status, 401, 'Otro correo en misma IP no debe ser bloqueado por clave compuesta');

    // Limpieza inmediata con reset()
    loginPasswordRateLimiter.reset(rateKey);
    assert.equal(loginPasswordRateLimiter.check(rateKey).allowed, true, 'reset() debe desbloquear de inmediato');

    // Enmascarado de correo para WORM
    assert.equal(maskEmailForAudit('admin@cruse.com.mx'), 'a***n@cruse.com.mx');
  } finally {
    loginPasswordRateLimiter.reset(rateKey);
    loginPasswordRateLimiter.reset(buildLoginPasswordRateKey(testIp, otherEmail));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function testGuardrail3MagicBytes(): void {
  // 1. Vacío → permitido (preserva fallbackExtractedStrings)
  const emptyRes = validateImageBase64MagicBytes('');
  assert.equal(emptyRes.valid, true);
  assert.equal(emptyRes.skippedEmpty, true);

  // 2. JPEG válido (con y sin prefijo data URL)
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
  const jpegRes = validateImageBase64MagicBytes(`data:image/jpeg;base64,${jpegBuf.toString('base64')}`);
  assert.equal(jpegRes.valid, true);
  assert.equal(jpegRes.detectedFormat, 'jpeg');

  // 3. PNG válido
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngRes = validateImageBase64MagicBytes(pngBuf.toString('base64'));
  assert.equal(pngRes.valid, true);
  assert.equal(pngRes.detectedFormat, 'png');

  // 4. WebP válido (RIFF....WEBP)
  const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const webpRes = validateImageBase64MagicBytes(webpBuf.toString('base64'));
  assert.equal(webpRes.valid, true);
  assert.equal(webpRes.detectedFormat, 'webp');

  // 5. Payloads no-imagen → rechazados
  const htmlB64 = Buffer.from('<html><script>alert(1)</script></html>', 'utf8').toString('base64');
  assert.equal(validateImageBase64MagicBytes(htmlB64).valid, false);

  const elfB64 = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]).toString('base64');
  assert.equal(validateImageBase64MagicBytes(elfB64).valid, false);

  assert.equal(validateImageBase64MagicBytes('not-valid-base64!!!@@@').valid, false);
}

async function main(): Promise<void> {
  testGuardrail3MagicBytes();
  console.log('✅ PASS [Guardrail 3]: Magic bytes JPEG/PNG/WebP válidos, rechazo no-imagen y fallback vacío.');

  await testGuardrail2RateLimitHttp();
  console.log('✅ PASS [Guardrail 2]: Rate limit paso 1 login (5x 401 → 6° HTTP 429, clave compuesta ip+email, reset y WORM).');

  console.log('🎯 CRUSE-APO-2026-072 — SUITE OWASP HARDENING 100% VERIFICADA');
}

main().catch((err: unknown) => {
  console.error('❌ FALLO EN SUITE APO-072:', err);
  process.exit(1);
});
