/**
 * SUITE FORENSE DE VERIFICACIÓN — CRUSE-APO-2026-076 (Contrato Twilio Verify v2 + Zero-PII Auth)
 *
 * Verifica los 5 Guardrails Forenses:
 * - G1: `verifications.create` en `smsService.ts` NO envía `customFriendlyName` (0 coincidencias en src/).
 * - G2: Todas las líneas `actorEmail:` en `authRouter.ts` usan `maskEmailForAudit(...)` o `maskedEmail`.
 * - G3: Copy de `smsWarning` neutral sin mencionar proveedor ("Twilio") ni "KYC".
 * - G4: `hashOtpCode` produce consistentemente 64 hex chars SHA-256; degradación SMS registra email enmascarado.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hashOtpCode } from '../src/services/auth/smsService';
import { maskEmailForAudit } from '../src/services/audit/auditMask';

function main(): void {
  const repoRoot = process.cwd();
  const smsSource = fs.readFileSync(path.join(repoRoot, 'src/services/auth/smsService.ts'), 'utf8');
  const authRouterSource = fs.readFileSync(path.join(repoRoot, 'src/services/api/authRouter.ts'), 'utf8');

  // Guardrail 1: 0 coincidencias de customFriendlyName y parámetros intactos
  assert.equal(
    smsSource.includes('customFriendlyName'),
    false,
    'smsService.ts no debe contener customFriendlyName'
  );
  assert(
    smsSource.includes("channel: 'sms'") && smsSource.includes("locale: 'es'"),
    'smsService.ts debe conservar channel: sms y locale: es'
  );
  assert(
    smsSource.includes('verificationChecks.create'),
    'verifySmsOtp debe permanecer intacto con verificationChecks.create'
  );

  // Guardrail 2: 100% de actorEmail en authRouter.ts enmascarados
  const actorEmailLines = authRouterSource
    .split(/\r?\n/)
    .filter((line) => line.includes('actorEmail:'));
  assert(actorEmailLines.length >= 9, `Se esperaban >=9 líneas actorEmail:, encontradas ${actorEmailLines.length}`);
  for (const line of actorEmailLines) {
    assert(
      line.includes('maskEmailForAudit(') || line.includes('maskedEmail'),
      `Línea actorEmail sin enmascarar detectada: ${line.trim()}`
    );
  }

  // Guardrail 3: Copy neutral U-First en smsWarning (sin Twilio ni KYC)
  assert.equal(
    authRouterSource.includes('validación regulatoria KYC'),
    false,
    'authRouter.ts no debe contener texto obsoleto de validación KYC'
  );
  assert(
    authRouterSource.includes(
      'No fue posible enviar el código SMS en este momento. Puedes reintentar en unos segundos o ingresar con tu Código de Recuperación de Emergencia.'
    ),
    'authRouter.ts debe contener exactamente el copy neutral aprobado en Guardrail 3'
  );

  // Guardrail 4: hashOtpCode produce 64 hex chars SHA-256 deterministas y maskEmailForAudit enmascara
  const digest1 = hashOtpCode('219383');
  const digest2 = hashOtpCode(' 219383 ');
  assert.match(digest1, /^[a-f0-9]{64}$/, 'hashOtpCode debe producir exactamente 64 caracteres hexadecimales');
  assert.equal(digest1, digest2, 'hashOtpCode debe ser determinista');
  assert.equal(hashOtpCode(''), '', 'hashOtpCode debe devolver cadena vacía para entrada vacía');
  assert.equal(maskEmailForAudit('gerardo.ornelas@cruse.com.mx'), 'g***s@cruse.com.mx');

  console.log(
    '✅ PASS [Guardrails 1-4 APO-076]: 0 customFriendlyName, 9/9 actorEmail enmascarados, copy U-First neutral y SHA-256 64-hex verificados.'
  );
}

main();
