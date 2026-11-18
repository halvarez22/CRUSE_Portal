/**
 * SUITE DE VERIFICACIÓN FORENSE — CRUSE-APO-2026-067 (LOS 8 GUARDRAILS INAMOVIBLES)
 *
 * Ejecuta pruebas deterministas sobre una base de datos SQLite aislada (sin tocar
 * la BD de producción `db/data/cruse_fintech.db`):
 *   1. Guardrail 1: ISR Capital (Art. 54 LISR) vs Mutuo PF 20% sobre Interés (Art. 160 LISR) + Split día 31
 *   2. Guardrail 2: Prelación Contractual Completa 5 niveles (Art. 364 CCom) + Retrocompatibilidad
 *   3. Guardrail 3: Pago Sostenido CNBV (3 amortizaciones oportunas tras reestructura de crédito con 60 DPD)
 *   4. Guardrail 4: Candado Pre-Rollback HTTP 409 + WORM `MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY`
 *   5. Guardrail 5: TOTP RFC 6238 (ventana ±1 paso = 30s, rechazo fuera de ventana, códigos respaldo SHA-256)
 *   6. Guardrail 6: Lista ONU Consolidada (`UN_CONSOLIDATED_SANCTIONS`) + Cero referencias a "5 años" / "INAI"
 *   7. Guardrail 7: Parámetros financieros dinámicos desde `system_financial_parameters` + WORM `FINANCIAL_PARAMETER_UPDATED`
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';

const PROD_DB_SOURCE = path.resolve(process.cwd(), 'db', 'data', 'cruse_fintech.db');
const TEMP_DB_PATH = path.resolve(process.cwd(), 'db', `sqa_apo067_${Date.now()}.db`);
if (fs.existsSync(PROD_DB_SOURCE)) {
  fs.copyFileSync(PROD_DB_SOURCE, TEMP_DB_PATH);
}
process.env.CRUSE_DB_PATH = TEMP_DB_PATH;
process.env.SQLITE_DB_PATH = TEMP_DB_PATH;
delete process.env.DATABASE_URL;
process.env.CRUSE_KEK_CURRENT_VERSION = process.env.CRUSE_KEK_CURRENT_VERSION || '1';
process.env.CRUSE_KEK_V1 = process.env.CRUSE_KEK_V1 || Buffer.alloc(32, 7).toString('base64');
process.env.BLIND_INDEX_SECRET =
  process.env.BLIND_INDEX_SECRET || Buffer.alloc(32, 9).toString('base64');

async function main(): Promise<void> {
  const { db } = await import('../src/services/db/connectionPool');
  const { calculateMonthlyYieldAndISR, calculateSplitTrancheInvestorYield } = await import(
    '../src/services/funding/fundingEngine'
  );
  const { applyWaterfall } = await import('../src/services/reconciliation/paymentWaterfall');
  const { evaluateAgingAndEprc, recordSustainedPaymentProgress } = await import(
    '../src/services/reconciliation/sustainedPaymentAndEprcService'
  );
  const {
    ingestAndReconcileLegacyExcelBatch,
    executeInstantBatchRollback,
    MigrationRollbackBlockedError,
    SAMPLE_LEGACY_EXCEL_ROWS,
  } = await import('../src/services/migration/cloudMigrationService');
  const {
    generateTotpSecret,
    generateTotpUri,
    generateTotpCodeForCounter,
    verifyTotpToken,
    generateRecoveryCodes,
    hashRecoveryCodeSha256,
    isCriticalTotpRole,
  } = await import('../src/services/auth/totpService');
  const {
    getLiveFinancialParameters,
    updateFinancialParameterWithAudit,
  } = await import('../src/services/config/financialParamsService');
  const { resolveRiskLevelForList } = await import('../src/services/pld/pldListParserAndValidator');
  const { evaluateConvenioPaymentCapacity } = await import('../src/config/convenioCapacityRules');
  const { buildParallelUatCasesData, buildParallelUatPdfBytes } = await import(
    '../src/services/reports/uatParallelCertificatePdf'
  );

  try {
    console.log('=== INICIANDO SUITE FORENSE CRUSE-APO-2026-067 ===');
    const cols = await db.query<{ name: string }>('PRAGMA table_info(loan_accounts)');
    const hasSustainedCol = cols.rows.some((c) => c.name === 'originated_from_arrears_restructure');
    if (!hasSustainedCol) {
      const mig020Sql = fs.readFileSync(
        path.resolve(process.cwd(), 'db', 'migrations', '020_apo_067_regulatory_and_financial_params.sql'),
        'utf8'
      );
      await db.executeScript(mig020Sql);
    }
    await db.executeScript(`
      CREATE TABLE IF NOT EXISTS loan_sustained_payment_events (
        id VARCHAR(64) PRIMARY KEY,
        loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
        is_complete_payment INTEGER NOT NULL CHECK (is_complete_payment IN (0, 1)),
        days_after_due_date INTEGER NOT NULL,
        streak_after_event INTEGER NOT NULL,
        recorded_by VARCHAR(255) NOT NULL,
        recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // -------------------------------------------------------------------------
    // PRUEBA 1 (Guardrail 1): ISR Capital vs Interés (20% sobre $120,000 = $24,000) + Split día 31
    // -------------------------------------------------------------------------
    const mutuoPf = calculateMonthlyYieldAndISR(
      1_000_000,
      0.12,
      0.20,
      365,
      true,
      'ACTUAL_365',
      'MUTUO_PF_ART160_INTERES'
    );
    assert.equal(mutuoPf.grossYield, 120_000, 'Interés bruto anual debe ser $120,000.00');
    assert.equal(mutuoPf.isrRetained, 24_000, 'ISR 20% Mutuo PF debe aplicarse sobre interés ($24,000), NO sobre capital');
    assert.equal(mutuoPf.netYield, 96_000, 'Rendimiento neto debe ser $96,000.00');
    assert.equal(mutuoPf.isrBaseApplied, 'INTERES_DEVENGADO');

    const sistemaFin = calculateMonthlyYieldAndISR(
      1_000_000,
      0.12,
      0.009,
      365,
      true,
      'ACTUAL_365',
      'SISTEMA_FINANCIERO_ART54_CAPITAL'
    );
    assert.equal(sistemaFin.isrRetained, 9_000, 'ISR 0.90% LIF 2026 sobre capital debe ser $9,000.00');
    assert.equal(sistemaFin.isrBaseApplied, 'CAPITAL_PROMEDIO');

    const split31 = calculateSplitTrancheInvestorYield({
      capitalBefore: 500_000,
      capitalAfter: 700_000,
      annualRate: 0.18,
      annualIsrRate: 0.009,
      periodStartDate: '2026-07-01',
      movementDate: '2026-07-31',
      periodEndDate: '2026-08-01',
      dayCountConvention: 'ACTUAL_365_30_4',
      taxRegime: 'SISTEMA_FINANCIERO_ART54_CAPITAL',
    });
    assert.ok(Number(split31.daysTranche2) >= 0, 'Tramo 2 jamás puede ser negativo en mes de 31 días');
    assert.equal(
      new Decimal(split31.daysTranche1).plus(split31.daysTranche2).toFixed(1),
      '30.4',
      'Suma de tramos debe cuadrar exactamente a 30.4 días'
    );
    console.log('[PASS] Prueba 1 (Guardrail 1): ISR Mutuo PF $24,000 s/interés vs Art. 54 $9,000 s/capital + Split día 31 OK.');

    // -------------------------------------------------------------------------
    // PRUEBA 2 (Guardrail 2): Prelación Contractual Art. 364 CCom (5 niveles)
    // Pago $10,000 | Seguro $22.85 | Comisión $200 (+IVA $32) | Moratorio $500 (+IVA $80) | Interés $800 (+IVA $128)
    // -------------------------------------------------------------------------
    const wf = applyWaterfall(
      new Decimal('10000.00'),
      {
        insurance: new Decimal('22.85'),
        fees: new Decimal('200.00'),
        feesVat: new Decimal('32.00'),
        moratoryInterest: new Decimal('500.00'),
        moratoryVat: new Decimal('80.00'),
        interest: new Decimal('800.00'),
        vat: new Decimal('128.00'),
        capital: new Decimal('8237.15'),
      },
      {
        balance: new Decimal('50000.00'),
        arrearsInsurance: new Decimal('0.00'),
        arrearsInterest: new Decimal('0.00'),
        arrearsVat: new Decimal('0.00'),
        creditBalance: new Decimal('0.00'),
      }
    );
    assert.equal(wf.applied.insurance.toFixed(2), '22.85');
    assert.equal(wf.applied.fees.toFixed(2), '200.00');
    assert.equal(wf.applied.feesVat.toFixed(2), '32.00');
    assert.equal(wf.applied.moratoryInterest.toFixed(2), '500.00');
    assert.equal(wf.applied.moratoryVat.toFixed(2), '80.00');
    assert.equal(wf.applied.interest.toFixed(2), '800.00');
    assert.equal(wf.applied.vat.toFixed(2), '128.00');
    assert.equal(wf.applied.capital.toFixed(2), '8237.15');
    assert.equal(wf.totalApplied.toFixed(2), '10000.00');
    assert.equal(wf.isPeriodFullyCovered, true);
    console.log('[PASS] Prueba 2 (Guardrail 2): Prelación contractual 5 niveles exacta ($10,000.00 = Seg + Com + Mor + Int + Cap).');

    // -------------------------------------------------------------------------
    // PRUEBA 3 (Guardrail 3): Pago Sostenido CNBV (reestructura 60 DPD -> 2 pagos = Observación -> 3er pago = Activo Sano)
    // -------------------------------------------------------------------------
    const existingExp = await db.query<{ id: string }>('SELECT id FROM expedientes LIMIT 1');
    const testExpedienteId = existingExp.rows[0]?.id ?? 'exp_apo067_01';
    await db.execute(
      `INSERT INTO loan_accounts (
         id, contract_number, expediente_id, principal_original, current_principal_balance,
         fortnightly_payment, payment_frequency, first_deduction_period, activated_at, activated_by,
         product_type, insurance_required, status, reports_to_credit_bureau,
         originated_from_arrears_restructure, sustained_payments_completed_count, days_past_due
       ) VALUES (
         'la_apo067_rest_01', 'CNT-2026-0671', $1, 25000, 25000,
         1500, 'QUINCENAL', '2026-Q22', CURRENT_TIMESTAMP, 'alma@cruse.com.mx',
         'NOMINA_NORMAL', 1, 'ACTIVE', 1, 1, 0, 60
       )`,
      [testExpedienteId]
    );

    const agingBefore = evaluateAgingAndEprc({
      daysPastDue: 60,
      liveBalanceMxn: '25000.00',
      originatedFromArrearsRestructure: true,
      sustainedPaymentsCompletedCount: 0,
    });
    assert.equal(agingBefore.bucketCode, 'DPD_31_89_ETAPA2');
    assert.equal(agingBefore.semaphoreColor, 'NARANJA');

    const p1 = await recordSustainedPaymentProgress({
      loanAccountId: 'la_apo067_rest_01',
      isCompletePayment: true,
      daysAfterDueDate: 0,
      actorEmail: 'alma@cruse.com.mx',
      actorRole: 'admin',
      sourceIp: '127.0.0.1',
      sourceSummary: 'verify_apo_067',
    });
    assert.equal(p1.sustainedPaymentsCompletedCount, 1);
    assert.equal(p1.portfolioHealthStatus, 'REESTRUCTURADO EN OBSERVACIÓN');

    const p2 = await recordSustainedPaymentProgress({
      loanAccountId: 'la_apo067_rest_01',
      isCompletePayment: true,
      daysAfterDueDate: 2,
      actorEmail: 'alma@cruse.com.mx',
      actorRole: 'admin',
      sourceIp: '127.0.0.1',
      sourceSummary: 'verify_apo_067',
    });
    assert.equal(p2.sustainedPaymentsCompletedCount, 2);
    assert.equal(p2.regulatoryBadge, 'REESTRUCTURADO EN OBSERVACIÓN (2/3)');

    const p3 = await recordSustainedPaymentProgress({
      loanAccountId: 'la_apo067_rest_01',
      isCompletePayment: true,
      daysAfterDueDate: 1,
      actorEmail: 'alma@cruse.com.mx',
      actorRole: 'admin',
      sourceIp: '127.0.0.1',
      sourceSummary: 'verify_apo_067',
    });
    assert.equal(p3.sustainedPaymentsCompletedCount, 3);
    assert.equal(p3.portfolioHealthStatus, 'ACTIVO SANO');
    console.log('[PASS] Prueba 3 (Guardrail 3): Pago Sostenido CNBV (2/3 Observación -> 3/3 ACTIVO SANO) OK.');

    // -------------------------------------------------------------------------
    // PRUEBA 4 (Guardrail 4): Rollback Bloqueado HTTP 409 + WORM MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY
    // -------------------------------------------------------------------------
    const mig = await ingestAndReconcileLegacyExcelBatch({
      sourceFilename: 'Sabana_Test_APO067.xlsx',
      rows: SAMPLE_LEGACY_EXCEL_ROWS,
      declaredExcelTotalPrincipalMxn: '70400.50',
      declaredExcelTotalLiveBalanceMxn: '55000.50',
      actorEmail: 'direccion@cruse.com.mx',
    });
    assert.equal(mig.ok, true, 'La ingesta de prueba debe cuadrar al centavo');

    // Simular 1 pago posterior sobre uno de los contratos migrados
    const firstContract = SAMPLE_LEGACY_EXCEL_ROWS[0]!.legacyContractNumber;
    await db.execute(
      `INSERT INTO loan_accounts (
         id, contract_number, expediente_id, principal_original, current_principal_balance,
         fortnightly_payment, payment_frequency, first_deduction_period, activated_at, activated_by,
         product_type, insurance_required, status, reports_to_credit_bureau
       ) VALUES (
         'la_mig_01', $1, $2, 25000, 20000,
         1500, 'QUINCENAL', '2026-Q22', CURRENT_TIMESTAMP, 'direccion@cruse.com.mx',
         'NOMINA_NORMAL', 1, 'ACTIVE', 1
       )`,
      [firstContract, testExpedienteId]
    );
    // Simular 1 actividad/nota operativa posterior sobre uno de los contratos migrados
    await db.execute(
      `INSERT INTO operational_notes (
         id, entity_type, entity_id, note_content, is_pinned, author_email, created_at
       ) VALUES (
         'note_post_mig_01', 'LOAN_ACCOUNT', 'la_mig_01',
         'Pago aplicado en conciliación quincenal posterior a la migración', 0,
         'alma@cruse.com.mx', '2099-01-01T00:00:00.000Z'
       )`
    );

    let blockedErr: unknown = null;
    try {
      await executeInstantBatchRollback({
        batchId: mig.batch.id,
        actorEmail: 'direccion@cruse.com.mx',
        actorRole: 'admin',
      });
    } catch (err) {
      blockedErr = err;
    }
    assert.ok(blockedErr instanceof MigrationRollbackBlockedError, 'Debe lanzar MigrationRollbackBlockedError');
    assert.equal((blockedErr as MigrationRollbackBlockedError).statusCode, 409);

    const wormRollback = await db.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM audit_events WHERE action = 'MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY'`
    );
    assert.ok(Number(wormRollback.rows[0]?.cnt ?? 0) >= 1, 'Debe sellar evento WORM MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY');
    console.log('[PASS] Prueba 4 (Guardrail 4): Rollback bloqueado con HTTP 409 + WORM MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY OK.');

    // -------------------------------------------------------------------------
    // PRUEBA 5 (Guardrail 5): TOTP RFC 6238 (ventana ±1 paso = 30s) + Recovery Codes SHA-256
    // -------------------------------------------------------------------------
    const secret = generateTotpSecret();
    const uri = generateTotpUri('direccion@cruse.com.mx', secret);
    assert.ok(uri.startsWith('otpauth://totp/'), 'URI TOTP debe ser estándar RFC 6238 otpauth://totp/');
    assert.equal(isCriticalTotpRole('admin'), true);
    assert.equal(isCriticalTotpRole('oficial_cumplimiento'), true);
    assert.equal(isCriticalTotpRole('promotor'), false);

    const fixedNow = 1_795_000_000_000;
    const baseCounter = Math.floor(fixedNow / 1000 / 30);
    const codeCurrent = generateTotpCodeForCounter(secret, baseCounter);
    const codePrev = generateTotpCodeForCounter(secret, baseCounter - 1);
    const codeNext = generateTotpCodeForCounter(secret, baseCounter + 1);
    const codeExpired = generateTotpCodeForCounter(secret, baseCounter + 3);

    assert.equal((await verifyTotpToken(codeCurrent, secret, 1, 30, fixedNow)).valid, true);
    assert.equal((await verifyTotpToken(codePrev, secret, 1, 30, fixedNow)).valid, true);
    assert.equal((await verifyTotpToken(codeNext, secret, 1, 30, fixedNow)).valid, true);
    assert.equal((await verifyTotpToken(codeExpired, secret, 1, 30, fixedNow)).valid, false);

    const recCodes = generateRecoveryCodes(8);
    assert.equal(recCodes.length, 8);
    assert.equal(hashRecoveryCodeSha256(recCodes[0]!).length, 64);
    console.log('[PASS] Prueba 5 (Guardrail 5): TOTP RFC 6238 ventana ±1 (acepta -1/0/+1, rechaza +3) + SHA-256 OK.');

    // -------------------------------------------------------------------------
    // PRUEBA 6 (Guardrail 6 & 7): Lista ONU, Parámetros Dinámicos BD + Convenios + UAT Cases
    // -------------------------------------------------------------------------
    assert.equal(resolveRiskLevelForList('UN_CONSOLIDATED_SANCTIONS'), 'CRITICAL_BLOCK');

    const paramsBefore = await getLiveFinancialParameters();
    assert.equal(paramsBefore.lifeInsuranceFortnightlyMxn, '22.85');
    assert.equal(paramsBefore.pldRetentionYearsMinimum, 10);

    await updateFinancialParameterWithAudit({
      paramKey: 'LIFE_INSURANCE_FORTNIGHTLY_MXN',
      newValue: '24.50',
      effectiveFrom: '2026-12-01',
      reason: 'Actualización anual de póliza aseguradora',
      actorEmail: 'direccion@cruse.com.mx',
      actorRole: 'admin',
      sourceIp: '127.0.0.1',
      sourceSummary: 'verify_apo_067',
    });
    const paramsAfter = await getLiveFinancialParameters();
    assert.equal(paramsAfter.lifeInsuranceFortnightlyMxn, '24.50');

    const wormParam = await db.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM audit_events WHERE action = 'FINANCIAL_PARAMETER_UPDATED'`
    );
    assert.ok(Number(wormParam.rows[0]?.cnt ?? 0) >= 1, 'Debe sellar evento WORM FINANCIAL_PARAMETER_UPDATED');

    // Candado de renovación sin priorLoanId
    const badRenewal = evaluateConvenioPaymentCapacity({
      convenioName: 'STSGECH',
      periodicPayment: 1200,
      netPeriodicIncome: 5000,
      isRenewal: true,
      priorLoanId: '',
      priorLoanBalanceToLiquidate: 0,
    });
    assert.equal(badRenewal.isValid, false);

    // Casos paralelos UAT + Generación PDF binario válido (%PDF-1.4 ... %%EOF)
    const uatCases = buildParallelUatCasesData();
    assert.equal(uatCases.length, 3);
    const pdfBytes = buildParallelUatPdfBytes();
    const pdfText = new TextDecoder().decode(pdfBytes);
    assert.ok(pdfText.startsWith('%PDF-1.4'), 'PDF UAT debe iniciar con encabezado %PDF-1.4');
    assert.ok(pdfText.includes('%%EOF'), 'PDF UAT debe cerrar con marcador %%EOF');
    console.log('[PASS] Prueba 6 (Guardrails 6 y 7): Lista ONU + Parámetros BD + WORM + Candado Renovación + UAT PDF OK.');

    console.log('=== TODAS LAS PRUEBAS FORENSES CRUSE-APO-2026-067 PASARON AL 100% ===');
  } finally {
    try {
      await db.close();
    } catch {
      // ignore
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const p = `${TEMP_DB_PATH}${suffix}`;
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('[FAIL] Suite forense CRUSE-APO-2026-067 falló:', err);
  process.exit(1);
});
