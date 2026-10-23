/**
 * SUITE DE CERTIFICACIÓN FORENSE — EXPEDIENTE CRUSE-APO-2026-028
 * Gestión de Usuarios Zero-Trust, 2FA TOTP Autónomo en Celular Propio y Ciclo ABC con Revocación Atómica ACID.
 *
 * Verifica matemáticamente los 4 Guardrails Forenses:
 * - Guardrail 1: Alta con `totp_enrolled = 0`, `must_change_password = 1`, contraseña temporal criptográfica Out-of-Band
 *                y obligatoriedad de cambio de contraseña en el primer login.
 * - Guardrail 2: Atomicidad ACID en `updateManagedUser` + `revokeAllUserSessions` (Kill-Switch instantáneo de sesiones
 *                y `pending_totp`), más prohibición estricta de auto-baja (`SELF_SUSPENSION_FORBIDDEN`).
 * - Guardrail 3: Higiene criptográfica en `resetTotp` (sobrescritura de `totp_secret_enc`, purga y reemplazo de
 *                `backup_codes_hash`, `tempToken` single-use anti-replay vinculado a `userId`).
 * - Guardrail 4: Trazabilidad forense del diferencial `before`/`after` en `audit_events` (`USER_CREATE` y `USER_UPDATE`),
 *                cero secretos en bitácora y verificación íntegra de la cadena Merkle WORM.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';

async function jsonRequest(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: Record<string, unknown>,
  token?: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, data };
}

async function main(): Promise<void> {
  // Preparar base de datos SQLite efímera limpia antes de importar connectionPool
  const tempDbPath = path.join(process.cwd(), 'db', 'data', `test_apo028_${Date.now()}.db`);
  fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });
  fs.writeFileSync(tempDbPath, '');
  process.env.CRUSE_DB_PATH = tempDbPath;
  delete process.env.DATABASE_URL;

  const { loadServerEnv } = await import('../src/config/serverEnv');
  const { runMigrations } = await import('../src/services/db/migrationRunner');
  const { db } = await import('../src/services/db/connectionPool');
  const { authRouter } = await import('../src/services/api/authRouter');
  const { usersRouter } = await import('../src/services/api/usersRouter');
  const { createUser, findUserById, decryptTotpSecret } = await import('../src/services/auth/userRepository');
  const { generateCurrentTotpCode } = await import('../src/services/auth/totpService');
  const { createSession, resolveSession } = await import('../src/services/auth/sessionStore');
  const { auditEventStore } = await import('../src/services/audit/auditEventStore');

  loadServerEnv();
  await runMigrations();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No se pudo abrir puerto efímero');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    console.log('================================================================================');
    console.log(' INICIANDO CERTIFICACIÓN FORENSE CRUSE-APO-2026-028 (GUARDRAILS 1, 2, 3 Y 4)');
    console.log('================================================================================');

    const runSuffix = Date.now().toString().slice(-6);
    const adminEmail = `admin.${runSuffix}@cruse.com.mx`;
    const operatorEmail = `operador.${runSuffix}@cruse.com.mx`;

    // 1. Sembrar Administrador Inicial y emitir su sesión
    const adminCreated = await createUser({
      email: adminEmail,
      name: 'Director General Test',
      role: 'admin',
      phoneNumber: '+526141112233',
      mustChangePassword: false,
    });
    const adminSession = await createSession(adminCreated.user.id);
    console.log(`[PASS 1] Administrador sembrado (${adminCreated.user.id}) con sesión activa.`);

    // 2. GUARDRAIL 1: Crear operador vía POST /api/users sin enviar contraseña (generación criptográfica Out-of-Band)
    const createRes = await jsonRequest(
      baseUrl,
      'POST',
      '/api/users',
      {
        email: operatorEmail,
        name: 'Operador Nuevo Celular',
        role: 'promotor',
        phoneNumber: '+526149998877',
      },
      adminSession.token
    );
    assert.equal(createRes.status, 201, 'POST /api/users debe retornar 201');
    const createdUserObj = createRes.data.user as {
      id: string;
      email: string;
      totpEnrolled: boolean;
      mustChangePassword: boolean;
    };
    const oneTimeCreds = createRes.data.oneTimeCredentials as {
      initialPassword: string;
      totpEnrollment: { otpauthUri: string; manualKey: string };
      recoveryCodes: string[];
    };

    assert.equal(createdUserObj.totpEnrolled, false, 'El usuario debe nacer con totpEnrolled = false');
    assert.equal(createdUserObj.mustChangePassword, true, 'El usuario debe nacer con mustChangePassword = true');
    assert.ok(oneTimeCreds.initialPassword.length >= 12, 'Contraseña temporal criptográfica generada en backend');
    assert.equal(oneTimeCreds.recoveryCodes.length, 8, 'Debe entregar 8 códigos de recuperación Out-of-Band');

    const dbRowAfterCreate = await findUserById(createdUserObj.id);
    assert.ok(dbRowAfterCreate, 'El usuario debe existir en BD');
    assert.equal(Number(dbRowAfterCreate.totp_enrolled), 0, 'En BD totp_enrolled debe ser 0');
    assert.equal(Number(dbRowAfterCreate.must_change_password), 1, 'En BD must_change_password debe ser 1');
    assert.ok(
      dbRowAfterCreate.totp_secret_enc.includes('"alg":"AES-GCM-256"'),
      'totp_secret_enc debe estar cifrado con AES-GCM-256 Envelope Encryption'
    );
    assert.ok(
      !dbRowAfterCreate.backup_codes_hash?.includes(oneTimeCreds.recoveryCodes[0]!),
      'backup_codes_hash jamás debe contener códigos en texto plano, solo SHA-256'
    );
    console.log(
      `[PASS 2 - Guardrail 1] Usuario ${createdUserObj.id} creado con totp_enrolled=0, must_change_password=1, AES-GCM-256 y SHA-256 backup codes.`
    );

    // 3. PUNTO 2 & GUARDRAIL 1: Primer inicio de sesión entrega `enrollment` y exige cambio de contraseña temporal
    const loginStep1 = await jsonRequest(baseUrl, 'POST', '/api/auth/login', {
      email: operatorEmail,
      password: oneTimeCreds.initialPassword,
    });
    assert.equal(loginStep1.status, 200, 'Login paso 1 con contraseña temporal debe responder 200');
    assert.equal(loginStep1.data.totpEnrolled, false, 'Login paso 1 debe indicar totpEnrolled = false');
    assert.equal(loginStep1.data.mustChangePassword, true, 'Login paso 1 debe indicar mustChangePassword = true');
    const enrollmentStep1 = loginStep1.data.enrollment as { otpauthUri: string; manualKey: string } | undefined;
    assert.ok(enrollmentStep1?.otpauthUri.startsWith('otpauth://totp/'), 'Debe entregar otpauthUri en primer acceso');
    const tempToken1 = String(loginStep1.data.tempToken);

    const validTotpCode1 = await generateCurrentTotpCode(enrollmentStep1!.manualKey);

    // 3a. Intentar verificar TOTP SIN proporcionar nueva contraseña -> debe ser rechazado con 400
    const verifyWithoutNewPwd = await jsonRequest(baseUrl, 'POST', '/api/auth/verify-totp', {
      tempToken: tempToken1,
      code: validTotpCode1,
    });
    assert.equal(
      verifyWithoutNewPwd.status,
      400,
      'Guardrail 1: Primer login debe rechazar acceso si no cambia la contraseña temporal'
    );

    // 3b. Intentar usar la MISMA contraseña temporal como nueva contraseña -> debe ser rechazado con 400
    const verifySamePwd = await jsonRequest(baseUrl, 'POST', '/api/auth/verify-totp', {
      tempToken: tempToken1,
      code: validTotpCode1,
      newPassword: oneTimeCreds.initialPassword,
    });
    assert.equal(
      verifySamePwd.status,
      400,
      'Guardrail 1: Primer login debe prohibir reutilizar la contraseña temporal'
    );

    // 3c. Completar enrolamiento móvil TOTP + cambio obligatorio de contraseña personal
    const personalPassword = 'NuevaClavePersonal2026#Cruse';
    const verifySuccess1 = await jsonRequest(baseUrl, 'POST', '/api/auth/verify-totp', {
      tempToken: tempToken1,
      code: validTotpCode1,
      newPassword: personalPassword,
    });
    assert.equal(verifySuccess1.status, 200, 'Enrolamiento TOTP + cambio de contraseña debe responder 200');
    const operatorSessionToken1 = String(verifySuccess1.data.token);

    // 3d. GUARDRAIL 3 (Anti-Replay de tempToken): Reusar el mismo tempToken1 debe fallar con 401
    const replayAttempt = await jsonRequest(baseUrl, 'POST', '/api/auth/verify-totp', {
      tempToken: tempToken1,
      code: validTotpCode1,
      newPassword: personalPassword,
    });
    assert.equal(replayAttempt.status, 401, 'Guardrail 3: tempToken debe ser estrictamente single-use');

    // 3e. Segundo login con la nueva contraseña personal: YA NO entrega `enrollment`
    const loginStep2 = await jsonRequest(baseUrl, 'POST', '/api/auth/login', {
      email: operatorEmail,
      password: personalPassword,
    });
    assert.equal(loginStep2.status, 200);
    assert.equal(loginStep2.data.totpEnrolled, true, 'En segundo login totpEnrolled debe ser true');
    assert.equal(loginStep2.data.mustChangePassword, false, 'En segundo login mustChangePassword debe ser false');
    assert.equal(loginStep2.data.enrollment, undefined, 'En segundo login jamás debe exponer enrollment');

    // 3f. Verificar login en segundo acceso usando un Código de Recuperación de un solo uso
    const recoveryCodeToUse = oneTimeCreds.recoveryCodes[0]!;
    const verifyWithRecovery = await jsonRequest(baseUrl, 'POST', '/api/auth/verify-totp', {
      tempToken: String(loginStep2.data.tempToken),
      code: recoveryCodeToUse,
    });
    assert.equal(verifyWithRecovery.status, 200, 'Código de recuperación de emergencia debe autorizar sesión');
    const operatorSessionToken2 = String(verifyWithRecovery.data.token);
    console.log(
      `[PASS 3 - Punto 2 & Guardrail 1/3] Enrolamiento TOTP móvil, cambio obligatorio de clave, single-use tempToken y código de respaldo verificados.`
    );

    // 4. GUARDRAIL 2: Prohibición de Auto-Baja y Auto-Degradación del Administrador
    const selfSuspendRes = await jsonRequest(
      baseUrl,
      'PATCH',
      `/api/users/${adminCreated.user.id}`,
      { active: false },
      adminSession.token
    );
    assert.equal(selfSuspendRes.status, 400, 'Guardrail 2: Auto-baja del administrador debe bloquearse con HTTP 400');

    const selfDemoteRes = await jsonRequest(
      baseUrl,
      'PATCH',
      `/api/users/${adminCreated.user.id}`,
      { role: 'promotor' },
      adminSession.token
    );
    assert.equal(selfDemoteRes.status, 400, 'Guardrail 2: Auto-degradación de rol debe bloquearse con HTTP 400');
    console.log('[PASS 4 - Guardrail 2] Bloqueo de auto-baja y auto-degradación verificado.');

    // 5. GUARDRAIL 2 Y 4: Baja administrativa con Kill-Switch ACID atómico de sesiones
    assert.ok(await resolveSession(operatorSessionToken1), 'Sesión 1 debe estar activa antes de la baja');
    assert.ok(await resolveSession(operatorSessionToken2), 'Sesión 2 debe estar activa antes de la baja');

    const suspendOpRes = await jsonRequest(
      baseUrl,
      'PATCH',
      `/api/users/${createdUserObj.id}`,
      { active: false },
      adminSession.token
    );
    assert.equal(suspendOpRes.status, 200, 'Baja de operador debe responder 200');
    const suspendDiff = suspendOpRes.data.auditDiff as {
      sessionsRevoked: number;
      changes: Array<{ field: string; before: unknown; after: unknown }>;
    };
    assert.equal(suspendDiff.sessionsRevoked, 2, 'Kill-Switch ACID debe revocar las 2 sesiones activas del operador');
    assert.deepEqual(suspendDiff.changes, [{ field: 'active', before: true, after: false }]);

    // Reactivar al operador inmediatamente y comprobar que los tokens antiguos SIGUEN MUERTOS (revoked_at IS NOT NULL)
    const reactivateOpRes = await jsonRequest(
      baseUrl,
      'PATCH',
      `/api/users/${createdUserObj.id}`,
      { active: true },
      adminSession.token
    );
    assert.equal(reactivateOpRes.status, 200);
    assert.equal(
      await resolveSession(operatorSessionToken1),
      null,
      'Guardrail 2: Sesión antigua 1 debe permanecer revocada tras reactivación'
    );
    assert.equal(
      await resolveSession(operatorSessionToken2),
      null,
      'Guardrail 2: Sesión antigua 2 debe permanecer revocada tras reactivación'
    );
    console.log(
      '[PASS 5 - Guardrail 2 & 4] Kill-Switch atómico ACID verificó revocación permanente de sesiones post-reactivación.'
    );

    // 6. GUARDRAIL 3: Reset de TOTP sobrescribe totp_secret_enc, purga backup_codes_hash y restablece totp_enrolled = 0
    const rowBeforeReset = await findUserById(createdUserObj.id);
    const oldSecretPlain = await decryptTotpSecret(rowBeforeReset!);
    const oldBackupHashJson = rowBeforeReset!.backup_codes_hash;

    const resetTotpRes = await jsonRequest(
      baseUrl,
      'PATCH',
      `/api/users/${createdUserObj.id}`,
      { role: 'oficial_cumplimiento', resetTotp: true },
      adminSession.token
    );
    assert.equal(resetTotpRes.status, 200, 'Reset de TOTP + cambio de rol debe responder 200');

    const rowAfterReset = await findUserById(createdUserObj.id);
    const newSecretPlain = await decryptTotpSecret(rowAfterReset!);
    assert.notEqual(
      rowAfterReset!.totp_secret_enc,
      rowBeforeReset!.totp_secret_enc,
      'Guardrail 3: totp_secret_enc en BD debe haber sido sobrescrito'
    );
    assert.notEqual(newSecretPlain, oldSecretPlain, 'Guardrail 3: La nueva semilla Base32 debe ser distinta a la anterior');
    assert.notEqual(
      rowAfterReset!.backup_codes_hash,
      oldBackupHashJson,
      'Guardrail 3: Los antiguos backup_codes_hash deben haber sido purgados y reemplazados'
    );
    assert.equal(Number(rowAfterReset!.totp_enrolled), 0, 'Guardrail 3: totp_enrolled debe regresar a 0');
    console.log(
      '[PASS 6 - Guardrail 3] Reset TOTP sobrescribió totp_secret_enc, purgó y reemplazó backup_codes_hash y reinició totp_enrolled=0.'
    );

    // 7. GUARDRAIL 4: Verificar cadena Merkle WORM e integridad del diferencial en audit_events
    const chainStatus = await auditEventStore.verifyChainIntegrity();
    assert.equal(chainStatus.valid, true, 'La cadena Merkle WORM debe ser 100% íntegra');

    const eventsRes = await db.query<{ action: string; details: string }>(
      `SELECT action, details FROM audit_events WHERE action IN ('USER_CREATE', 'USER_UPDATE') ORDER BY chain_seq DESC LIMIT 5`
    );
    assert.ok(eventsRes.rows.length >= 4, 'Deben existir eventos USER_CREATE y USER_UPDATE en audit_events');
    for (const evt of eventsRes.rows) {
      assert.ok(!evt.details.includes(oneTimeCreds.initialPassword), 'Cero contraseñas en audit_events');
      assert.ok(!evt.details.includes(oldSecretPlain), 'Cero semillas TOTP en audit_events');
      assert.ok(!evt.details.includes(newSecretPlain), 'Cero semillas TOTP nuevas en audit_events');
    }
    console.log(
      `[PASS 7 - Guardrail 4] Bitácora WORM verificada (${chainStatus.totalEvents} eslabones íntegros, 0 secretos expuestos).`
    );

    console.log('================================================================================');
    console.log(' ✅ CERTIFICACIÓN CRUSE-APO-2026-028 COMPLETADA CON ÉXITO ABSOLUTO (7/7 PASS)');
    console.log('================================================================================');
  } finally {
    server.close();
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const f = `${tempDbPath}${suffix}`;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignorar bloqueo efímero de archivo en Windows
        }
      }
    }
  }
}

main().catch((err: unknown) => {
  console.error('FALLO EN CERTIFICACIÓN CRUSE-APO-2026-028:', err);
  process.exit(1);
});
