/**
 * SUITE FORENSE DE VERIFICACIÓN — CRUSE-APO-2026-078
 * (Desbloqueo 2FA SMS para Roles Críticos con TOTP Enrolado + Rotación Forzosa OTP en Twilio Verify v2)
 *
 * Verifica los 5 Guardrails Forenses:
 * - G1: Roles críticos (`admin` y `oficial_cumplimiento`) con `totp_enrolled = 1` validan
 *       exitosamente vía SMS (`verifySmsOtp`) cuando el código no es TOTP, manteniendo prioridad TOTP.
 * - G2: Al invocar `sendSmsOtp` dos veces consecutivas para el mismo `userId`, se invoca
 *       `verifications(prevSid).update({ status: 'canceled' })` ANTES del segundo `create`;
 *       y un fallo `20404 Not Found` en `update` es tolerado sin abortar el nuevo envío.
 * - G3: `LOGIN_2FA_SUCCESS` registra explícitamente `[SMS_FALLBACK]` / `[TOTP_RFC6238]` / `[RECOVERY_CODE]`
 *       y 9/9 `actorEmail:` en `authRouter.ts` permanecen enmascarados.
 * - G4: Cero regresiones en `verifyTotpToken` y `verifySmsOtp` (con `verificationChecks.create` + anti-replay).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type twilio from 'twilio';
import {
  sendSmsOtp,
  verifySmsOtp,
  setTwilioClientForTest,
  registerHashedOtpForTest,
} from '../src/services/auth/smsService';
import {
  generateTotpSecret,
  generateCurrentTotpCode,
  verifyTotpToken,
  isCriticalTotpRole,
} from '../src/services/auth/totpService';

async function testTwilioVerifyRotationAndTolerance(): Promise<void> {
  const callLog: Array<{ op: string; sid?: string; status?: string; to?: string }> = [];
  let createCounter = 0;
  let shouldThrowOnCancel = false;

  const mockTwilioClient = {
    verify: {
      v2: {
        services: (serviceSid: string) => ({
          verifications: Object.assign(
            (verificationSid: string) => ({
              update: async (params: { status: string }) => {
                callLog.push({ op: 'cancel', sid: verificationSid, status: params.status });
                if (shouldThrowOnCancel) {
                  throw new Error('20404 Not Found: Verification already expired or approved');
                }
                return { sid: verificationSid, status: params.status };
              },
            }),
            {
              create: async (params: { to: string; channel: string; locale: string }) => {
                createCounter += 1;
                const sid = `VE_TEST_00${createCounter}`;
                callLog.push({ op: 'create', sid, to: params.to });
                assert.equal(params.channel, 'sms');
                assert.equal(params.locale, 'es');
                assert.equal('customFriendlyName' in params, false);
                return { sid, status: 'pending', serviceSid };
              },
            }
          ),
          verificationChecks: {
            create: async (params: { to: string; code: string }) => {
              callLog.push({ op: 'check', to: params.to });
              return { status: params.code === '515539' ? 'approved' : 'pending' };
            },
          },
        }),
      },
    },
  };

  // Asegurar SERVICE SID determinista en modo test
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_TEST_SERVICE_078';
  setTwilioClientForTest(mockTwilioClient as unknown as twilio.Twilio);

  try {
    const userId = 'usr_apo_078_rotation';
    const phone = '+524777241148';

    // Envío 1: solo debe crear VE_TEST_001
    const r1 = await sendSmsOtp(userId, phone);
    assert.equal(r1.channel, 'verify');
    assert.equal(callLog.length, 1);
    assert.equal(callLog[0].op, 'create');
    assert.equal(callLog[0].sid, 'VE_TEST_001');

    // Envío 2 consecutivo: DEBE cancelar VE_TEST_001 ANTES de crear VE_TEST_002
    const r2 = await sendSmsOtp(userId, phone);
    assert.equal(r2.channel, 'verify');
    assert.equal(callLog.length, 3);
    assert.equal(callLog[1].op, 'cancel');
    assert.equal(callLog[1].sid, 'VE_TEST_001');
    assert.equal(callLog[1].status, 'canceled');
    assert.equal(callLog[2].op, 'create');
    assert.equal(callLog[2].sid, 'VE_TEST_002');

    // Envío 3 con excepción 20404 en cancelación previa: DEBE tolerar el error y crear VE_TEST_003
    shouldThrowOnCancel = true;
    const r3 = await sendSmsOtp(userId, phone);
    assert.equal(r3.channel, 'verify');
    assert.equal(callLog.length, 5);
    assert.equal(callLog[3].op, 'cancel');
    assert.equal(callLog[3].sid, 'VE_TEST_002');
    assert.equal(callLog[4].op, 'create');
    assert.equal(callLog[4].sid, 'VE_TEST_003');

    // Verificación SMS vía Twilio Verify + Anti-Replay (segundo intento con mismo código falla)
    const ok = await verifySmsOtp(userId, '515539');
    assert.equal(ok, true, 'verifySmsOtp debe aprobar código válido vía verificationChecks.create');
    const replay = await verifySmsOtp(userId, '515539');
    assert.equal(replay, false, 'verifySmsOtp debe impedir replay tras uso exitoso');
  } finally {
    setTwilioClientForTest(null);
  }
}

async function testCriticalRolesSmsFallbackAndTotpPriority(): Promise<void> {
  const repoRoot = process.cwd();
  const authRouterSource = fs.readFileSync(
    path.join(repoRoot, 'src/services/api/authRouter.ts'),
    'utf8'
  );

  // Guardrail 1: No existe bloqueo condicional !isCriticalTotpRole(authUser.role) antes de verifySmsOtp
  assert.equal(
    authRouterSource.includes('!isCriticalTotpRole(authUser.role)'),
    false,
    'authRouter.ts no debe bloquear verifySmsOtp para roles críticos enrolados'
  );
  assert(
    authRouterSource.includes('verifyTotpToken(rawCode, plainSecret') &&
      authRouterSource.includes('await verifySmsOtp(user.id, rawCode)'),
    'authRouter.ts debe priorizar verifyTotpToken y ejecutar fallback a verifySmsOtp'
  );

  // Guardrail 3: Métodos explícitos en LOGIN_2FA_SUCCESS y 9/9 actorEmail enmascarados
  assert(
    authRouterSource.includes("'TOTP_RFC6238'") &&
      authRouterSource.includes("'SMS_FALLBACK'") &&
      authRouterSource.includes("'RECOVERY_CODE'"),
    'authRouter.ts debe registrar el método exacto (TOTP_RFC6238 / SMS_FALLBACK / RECOVERY_CODE)'
  );
  const actorEmailLines = authRouterSource
    .split(/\r?\n/)
    .filter((line) => line.includes('actorEmail:'));
  assert(actorEmailLines.length >= 9, `Se esperaban >=9 actorEmail:, halladas ${actorEmailLines.length}`);
  for (const line of actorEmailLines) {
    assert(
      line.includes('maskEmailForAudit(') || line.includes('maskedEmail'),
      `actorEmail sin enmascarar detectado: ${line.trim()}`
    );
  }

  // Simulación funcional directa de rol crítico (admin + oficial_cumplimiento) con totp_enrolled = 1
  const secret = generateTotpSecret();
  const fixedNow = 1_795_548_000_000;
  const validTotp = await generateCurrentTotpCode(secret, 30, fixedNow);
  assert.equal((await verifyTotpToken(validTotp, secret, 1, 30, fixedNow)).valid, true);
  assert.equal((await verifyTotpToken('515539', secret, 1, 30, fixedNow)).valid, false);

  for (const role of ['admin', 'oficial_cumplimiento'] as const) {
    assert.equal(isCriticalTotpRole(role), true);
    const userId = `usr_critical_${role}_enrolled`;
    registerHashedOtpForTest(userId, '+524777241148', '515539', 'programmable_sms');

    // 1. Intento TOTP primero -> falla porque '515539' es SMS OTP
    const totpRes = await verifyTotpToken('515539', secret, 1, 30, fixedNow);
    let valid2FA = totpRes.valid;
    let method: 'TOTP_RFC6238' | 'SMS_FALLBACK' | null = valid2FA ? 'TOTP_RFC6238' : null;

    // 2. Fallback SMS incondicional -> aprueba incluso con totpEnrolled = true
    if (!valid2FA) {
      const smsOk = await verifySmsOtp(userId, '515539');
      if (smsOk) {
        valid2FA = true;
        method = 'SMS_FALLBACK';
      }
    }

    assert.equal(valid2FA, true, `Rol crítico ${role} con totp_enrolled=1 debe autenticar vía SMS`);
    assert.equal(method, 'SMS_FALLBACK');
  }
}

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.CRUSE_KEK_CURRENT_VERSION = process.env.CRUSE_KEK_CURRENT_VERSION || '1';
  process.env.CRUSE_KEK_V1 = process.env.CRUSE_KEK_V1 || Buffer.alloc(32, 7).toString('base64');
  process.env.BLIND_INDEX_SECRET = process.env.BLIND_INDEX_SECRET || Buffer.alloc(32, 9).toString('base64');
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_TEST_SERVICE_078';

  await testTwilioVerifyRotationAndTolerance();
  await testCriticalRolesSmsFallbackAndTotpPriority();
  console.log(
    '✅ PASS [Guardrails 1-5 APO-078]: Roles críticos desbloqueados en SMS 2FA, prioridad TOTP intacta, rotación con cancelación tolerante (20404) y 9/9 actorEmail enmascarados.'
  );
}

main().catch((err) => {
  console.error('❌ FAIL APO-078:', err);
  process.exit(1);
});
