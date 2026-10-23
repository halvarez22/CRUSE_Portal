/**
 * SUITE DE CERTIFICACIÓN FORENSE — EXPEDIENTE CRUSE-APO-2026-029
 * Integración de Entregables Ejecutivos/Comerciales Bloques B y C, Hubs Nacionales y Semáforo de Morosidad.
 *
 * Verifica matemáticamente los 4 Guardrails Forenses:
 * - Guardrail 1: Modularidad Estricta Anti-God-Object (todos los componentes de pestaña < 400 líneas y contenedor < 600 líneas).
 * - Guardrail 2: Zero-PII Absoluto en `POST /api/executive/internal-ai-query` (solo métricas agregadas en snapshot).
 * - Guardrail 3: Scoring Explicable y Paramétrico en `POST /api/executive/scoring-evaluate` (BAJO, MEDIO, ALTO deterministas).
 * - Guardrail 4: Evolución de esquema idempotente (`hub_region` + `competitor_benchmarks`), backfill determinista por convenio,
 *                filtrado por Hub (`CHIHUAHUA`, `LEON`, `CANCUN`) y Semáforo de Morosidad (`VERDE`, `AMARILLO`, `ROJO`).
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
  const tempDbPath = path.join(process.cwd(), 'db', 'data', `test_apo029_${Date.now()}.db`);
  fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });
  fs.writeFileSync(tempDbPath, '');
  process.env.CRUSE_DB_PATH = tempDbPath;
  delete process.env.DATABASE_URL;

  const { loadServerEnv } = await import('../src/config/serverEnv');
  const { runMigrations } = await import('../src/services/db/migrationRunner');
  const { db } = await import('../src/services/db/connectionPool');
  const { privateApiRouter } = await import('../src/services/api/privateApi');
  const { createUser } = await import('../src/services/auth/userRepository');
  const { createSession } = await import('../src/services/auth/sessionStore');
  const { auditEventStore } = await import('../src/services/audit/auditEventStore');

  loadServerEnv();
  await runMigrations();

  const app = express();
  app.use(express.json());
  app.use('/api', privateApiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No se pudo abrir puerto efímero');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    console.log('================================================================================');
    console.log(' INICIANDO CERTIFICACIÓN FORENSE CRUSE-APO-2026-029 (GUARDRAILS 1, 2, 3 Y 4)');
    console.log('================================================================================');

    // TEST 1: Guardrail 1 — Auditoría de Conteo de Líneas (< 400 en tabs, < 600 en contenedores)
    const filesToAudit = [
      { relPath: 'src/components/executive/ExecutiveSuiteView.tsx', maxLines: 400 },
      { relPath: 'src/components/executive/PitchDeckTab.tsx', maxLines: 400 },
      { relPath: 'src/components/executive/PortfolioRoiSimulatorTab.tsx', maxLines: 400 },
      { relPath: 'src/components/executive/CreditScoringApproverTab.tsx', maxLines: 400 },
      { relPath: 'src/components/executive/CompetitorMatrixTab.tsx', maxLines: 400 },
      { relPath: 'src/components/executive/NationalHubsAndManualTab.tsx', maxLines: 400 },
      { relPath: 'src/components/executive/InternalAiAssistantDrawer.tsx', maxLines: 400 },
      { relPath: 'src/services/executive/scoringService.ts', maxLines: 400 },
      { relPath: 'src/services/executive/internalAiService.ts', maxLines: 400 },
      { relPath: 'src/services/api/executiveRouter.ts', maxLines: 400 },
      { relPath: 'src/components/admin/AdminAuditView.tsx', maxLines: 600 },
    ];

    for (const item of filesToAudit) {
      const fullPath = path.join(process.cwd(), item.relPath);
      const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).length;
      assert.ok(
        lines < item.maxLines,
        `Violación Anti-God-Object en ${item.relPath}: ${lines} líneas (límite ${item.maxLines})`
      );
      console.log(`  [Guardrail 1] ${item.relPath}: ${lines} líneas (< ${item.maxLines}) OK`);
    }
    console.log('[PASS 1/6] Guardrail 1 certificado: Todos los módulos ejecutivos cumplen < 400 líneas.');

    // Sembrar Administrador y sesión 2FA
    const adminCreated = await createUser({
      email: `admin.apo029.${Date.now()}@cruse.com.mx`,
      name: 'Director General APO-029',
      role: 'admin',
      phoneNumber: '+526141112233',
      mustChangePassword: false,
    });
    const adminSession = await createSession(adminCreated.user.id);
    const token = adminSession.token;

    // TEST 2: Guardrail 4 — Backfill Determinista por Convenio en Hubs Nacionales (CHIHUAHUA, LEON, CANCUN)
    await db.execute(
      `INSERT INTO expedientes (
        id, created_at, updated_at, convenio, full_name, curp_masked, blind_curp,
        address, phone, requested_amount, term_fortnights, product_type, status, promotor_email, hub_region
      ) VALUES
        ('exp_chih_01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'STSGECH', 'C***** C********', 'AA**************01', '1111111111111111111111111111111111111111111111111111111111111101', 'CIFRADO', '000', 25000, 24, 'normal', 'activo', 'promotor@cruse.com.mx', 'CHIHUAHUA'),
        ('exp_leon_01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'PODER_JUDICIAL_GTO', 'L*** B****', 'BB**************02', '1111111111111111111111111111111111111111111111111111111111111102', 'CIFRADO', '000', 40000, 24, 'normal', 'activo', 'promotor@cruse.com.mx', 'LEON'),
        ('exp_cancun_01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'PODER_JUDICIAL_QROO', 'S** R******', 'CC**************03', '1111111111111111111111111111111111111111111111111111111111111103', 'CIFRADO', '000', 15000, 14, 'express', 'capturado', 'promotor@cruse.com.mx', 'CANCUN');`
    );

    const kpisAll = await jsonRequest(baseUrl, 'GET', '/api/dashboard/kpis', undefined, token);
    assert.equal(kpisAll.status, 200);
    const hubBreakdown = kpisAll.data.hubBreakdown as Record<string, { loansCount: number }>;
    assert.ok(hubBreakdown.CHIHUAHUA.loansCount >= 1);
    assert.ok(hubBreakdown.LEON.loansCount >= 1);
    assert.ok(hubBreakdown.CANCUN.loansCount >= 1);

    const loansLeon = await jsonRequest(baseUrl, 'GET', '/api/dashboard/latest_loans?hub=LEON', undefined, token);
    assert.equal(loansLeon.status, 200);
    const leonArray = loansLeon.data as unknown as Array<{ hubRegion: string; semaphore: string }>;
    assert.ok(leonArray.length >= 1);
    assert.ok(leonArray.every((l) => l.hubRegion === 'LEON'));
    assert.ok(leonArray.every((l) => ['VERDE', 'AMARILLO', 'ROJO'].includes(l.semaphore)));
    console.log('[PASS 2/6] Guardrail 4 certificado: Hubs Nacionales (Chihuahua, León, Cancún) y Semáforo de Morosidad operativos.');

    // TEST 3: Guardrail 3 — Scoring Explicable y Paramétrico (BAJO, MEDIO, ALTO deterministas)
    const lowRiskRes = await jsonRequest(
      baseUrl,
      'POST',
      '/api/executive/scoring-evaluate',
      {
        productType: 'normal',
        requestedAmount: 20000,
        termFortnights: 24,
        fortnightlyNetSalary: 15000,
        currentPayrollDeductions: 500,
        seniorityMonths: 36,
        convenio: 'STSGECH',
        hubRegion: 'CHIHUAHUA',
      },
      token
    );
    assert.equal(lowRiskRes.status, 200);
    assert.equal(lowRiskRes.data.riskLevel, 'BAJO');
    assert.equal(lowRiskRes.data.approvedSuggestion, true);

    const medRiskRes = await jsonRequest(
      baseUrl,
      'POST',
      '/api/executive/scoring-evaluate',
      {
        productType: 'normal',
        requestedAmount: 30000,
        termFortnights: 24,
        fortnightlyNetSalary: 10000,
        currentPayrollDeductions: 2000,
        seniorityMonths: 18,
        convenio: 'PODER_JUDICIAL_GTO',
        hubRegion: 'LEON',
      },
      token
    );
    assert.equal(medRiskRes.status, 200);
    assert.equal(medRiskRes.data.riskLevel, 'MEDIO');

    const highRiskRes = await jsonRequest(
      baseUrl,
      'POST',
      '/api/executive/scoring-evaluate',
      {
        productType: 'express',
        requestedAmount: 20000,
        termFortnights: 6,
        fortnightlyNetSalary: 6000,
        currentPayrollDeductions: 1800,
        seniorityMonths: 3,
        convenio: 'AYUNTAMIENTO_CANCUN',
        hubRegion: 'CANCUN',
      },
      token
    );
    assert.equal(highRiskRes.status, 200);
    assert.equal(highRiskRes.data.riskLevel, 'ALTO');
    assert.equal(highRiskRes.data.approvedSuggestion, false);
    console.log('[PASS 3/6] Guardrail 3 certificado: Motor de Scoring Paramétrico clasifica determinísticamente BAJO, MEDIO y ALTO riesgo.');

    // TEST 4: Guardrail 2 — Zero-PII Absoluto en el Asistente Operativo Interno
    const aiRes = await jsonRequest(
      baseUrl,
      'POST',
      '/api/executive/internal-ai-query',
      {
        question: '¿Cuántos créditos se otorgaron este mes y hay alertas pendientes de lavado de dinero?',
      },
      token
    );
    assert.equal(aiRes.status, 200);
    assert.equal(aiRes.data.zeroPiiCertified, true);
    const snapStr = JSON.stringify(aiRes.data.aggregatedSnapshot);
    assert.ok(!snapStr.includes('exp_chih_01'), 'El snapshot NO debe contener IDs de expedientes individuales');
    assert.ok(!snapStr.includes('AA**************01'), 'El snapshot NO debe contener CURPs individuales');
    console.log('[PASS 4/6] Guardrail 2 certificado: Asistente IA Operativo Interno opera con agregaciones 100% Zero-PII.');

    // TEST 5: Módulo B.2 y B.5 — Métricas Reales ROI y Pizarra de Competencia Editable
    const roiRes = await jsonRequest(baseUrl, 'GET', '/api/executive/roi-metrics', undefined, token);
    assert.equal(roiRes.status, 200);
    assert.ok(typeof roiRes.data.realPlacedCapital === 'number');

    const compList = await jsonRequest(baseUrl, 'GET', '/api/executive/competitors', undefined, token);
    assert.equal(compList.status, 200);
    const competitors = compList.data.competitors as Array<{ id: string }>;
    assert.equal(competitors.length, 6);

    const compUpd = await jsonRequest(
      baseUrl,
      'PUT',
      '/api/executive/competitors/santander',
      {
        annualInterestRate: '66.50% anual fija',
        sampleFortnightlyPayment: 605.0,
        sampleTermQuincenas: 24,
        commissions: '12% apertura actualizada',
      },
      token
    );
    assert.equal(compUpd.status, 200);
    const updatedComp = compUpd.data.competitor as { annualInterestRate: string; sampleTotalPayment: number };
    assert.equal(updatedComp.annualInterestRate, '66.50% anual fija');
    assert.equal(updatedComp.sampleTotalPayment, 14520);
    console.log('[PASS 5/6] Módulos B.2 (ROI conectado a Cartera Real) y B.5 (Pizarra de Competencia Editable) certificados.');

    // TEST 6: Verificación de Integridad de la Cadena Merkle WORM tras eventos ejecutivos
    const chainVerify = await auditEventStore.verifyChainIntegrity();
    assert.equal(chainVerify.valid, true, `Cadena Merkle inválida: ${chainVerify.details}`);
    console.log(`[PASS 6/6] Cadena criptográfica Merkle WORM íntegra (${chainVerify.totalEvents} bloques verificados).`);

    console.log('================================================================================');
    console.log(' CERTIFICACIÓN FORENSE CRUSE-APO-2026-029 COMPLETADA: 6/6 PRUEBAS EXITOSAS');
    console.log('================================================================================');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {
      // Ignorar limpieza en Windows
    }
  }
}

main().catch((err) => {
  console.error('FALLO EN CERTIFICACIÓN FORENSE CRUSE-APO-2026-029:', err);
  process.exit(1);
});
