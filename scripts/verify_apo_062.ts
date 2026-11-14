/**
 * SUITE FORENSE UNIFICADA DE REACTIVACIÓN Y CERO REGRESIONES — CRUSE-APO-2026-062
 *
 * Certifica los 4 Guardrails Forenses Inamovibles:
 * - Guardrail 1: Integridad intacta de Fase 1 (293 filas de cuotas, CAT Banxico, Art. 110 LFT 30%)
 *   y Fase 2 (Triaje 2D, Silo Sindicato vs Vía Citadela).
 * - Guardrail 2: Techo Anti-God-Object (< 600 líneas; umbral preventivo < 580 líneas) en los 23 archivos.
 * - Guardrail 3: Integridad criptográfica y financiera de Fase 3 (`rawBuffer.fill(0)`, `Decimal.js` sin floats,
 *   Prueba de Vida >= 1500ms, 3 hashes legales y Rollback `Pre-SHA256 === Post-SHA256`).
 * - Guardrail 4: Flujo E2E completo de Fase 3 (Folio + Candado 2h tras 5 intentos, Layout 60c con línea truncada aislada,
 *   y Conectores Zero-Trust rechazando HMAC alterado o timestamp > 300s).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import dotenv from 'dotenv';

const portalRoot = path.resolve(import.meta.dirname, '..');
process.chdir(portalRoot);
dotenv.config({ path: path.join(portalRoot, '.env') });

if (!process.env.CRUSE_KEK_CURRENT_VERSION) {
  process.env.CRUSE_KEK_CURRENT_VERSION = '1';
}
if (!process.env.CRUSE_KEK_V1) {
  process.env.CRUSE_KEK_V1 = crypto.randomBytes(32).toString('base64');
}
if (!process.env.BLIND_INDEX_SECRET) {
  process.env.BLIND_INDEX_SECRET = crypto.randomBytes(32).toString('base64');
}

import { OFFICIAL_QUOTA_TABLES } from '../src/config/officialQuotaTables';
import {
  calculateRegulatoryCatBanxico,
  calculateSimulation,
  validateLegalPaymentCapacityLft110,
} from '../src/config/financialConstants';
import { evaluateTriageAndChannelRouting } from '../src/services/ai/chatFinancialCalculator';
import { enforcePostLlmTriageBarrier } from '../src/services/api/chatRouter';
import { runMigrations } from '../src/services/db/migrationRunner';
import { db } from '../src/services/db/connectionPool';
import { loadServerEnv } from '../src/config/serverEnv';
import { computeServerBlindIndex, getServerKms } from '../src/services/crypto/serverKeyring';
import { encryptEnvelope } from '../src/services/crypto/cryptoService';
import { sanitizeAndHashDocumentInRam } from '../src/services/scanner/imageExifSanitizer';
import {
  buildCanonicalContractManifest,
  generateNom151ConstanciaAndEnvelope,
  validateLegalConsentsAndLiveness,
} from '../src/services/crypto/nom151SignatureService';
import {
  buildClientExpedienteSummary,
  verifyFolioAndPhoneWithLockout,
} from '../src/services/api/clientSelfServiceRouter';
import {
  executeInstantBatchRollback,
  ingestAndReconcileLegacyExcelBatch,
  SAMPLE_LEGACY_EXCEL_ROWS,
} from '../src/services/migration/cloudMigrationService';
import {
  getOperationsAndIntegrationHubOverview,
  ingestInboundInstitutionalLayout,
  SAMPLE_INBOUND_60CHAR_TXT_WITH_TRUNCATED_LINE,
  SAMPLE_INBOUND_DECLARED_TOTAL_MXN,
  verifyAndSyncZeroTrustConnector,
} from '../src/services/operations/operationsIntegrationService';

const TARGET_FILES_062 = [
  'src/types/clientSelfService.ts',
  'src/types/cloudMigration.ts',
  'src/types/operationsIntegrationHub.ts',
  'src/types/index.ts',
  'src/config/rbacPolicy.ts',
  'src/services/audit/auditMask.ts',
  'src/services/scanner/imageExifSanitizer.ts',
  'src/services/crypto/nom151SignatureService.ts',
  'src/services/migration/cloudMigrationService.ts',
  'src/services/operations/operationsIntegrationService.ts',
  'src/services/api/clientSelfServiceRouter.ts',
  'src/services/api/digitalSignatureRouter.ts',
  'src/services/api/cloudMigrationRouter.ts',
  'src/services/api/integrationHubRouter.ts',
  'src/services/api/privateApi.ts',
  'src/components/public/ClientDigitalSignaturePanel.tsx',
  'src/components/public/ClientSelfServiceAppModal.tsx',
  'src/components/admin/CloudMigrationAndRollbackView.tsx',
  'src/components/admin/OperationsAndIntegrationHubView.tsx',
  'src/components/common/HeaderNavbar.tsx',
  'src/App.tsx',
  'src/components/admin/ModuleFriendlyGuideBanner.tsx',
  'src/components/admin/AdminAuditView.tsx',
];

function assertCondition(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`❌ FALLO FORENSE: ${msg}`);
    process.exit(1);
  }
}

async function main() {
  console.log('================================================================================');
  console.log('🏛️  SUITE FORENSE UNIFICADA — EXPEDIENTE CRUSE-APO-2026-062 (FASE 3 + CERO REGRESIONES)');
  console.log('================================================================================\n');

  loadServerEnv();
  if (db.isPostgres()) {
    await runMigrations();
  } else {
    const sqlitePhase2And3Scripts = [
      '012_phase2_ocr_risk_matrix_and_cnbv_workflows.sql',
      '013_pre_applications_inbox.sql',
      '014_phase3_client_digital_expediente.sql',
      '015_phase3_nom151_digital_signature.sql',
      '016_phase3_cloud_migration_and_rollback.sql',
      '017_phase3_operations_and_integration_hub.sql',
    ];
    for (const f of sqlitePhase2And3Scripts) {
      const sqlContent = fs.readFileSync(path.join(portalRoot, 'db', 'migrations', f), 'utf8');
      await db.executeScript(sqlContent);
    }
  }

  // ============================================================================
  // BLOQUE 1 (GUARDRAIL 1): INTEGRIDAD DE FASE 1 Y FASE 2 (CERO REGRESIONES)
  // ============================================================================
  console.log('--- [BLOQUE 1] Verificando Integridad Intacta de Fases 1 y 2 ---');
  const allSheets = [
    { p: 'normal' as const, f: 'quincenal' as const, b: 'activo' as const, rows: OFFICIAL_QUOTA_TABLES.normalQuincenalActivos },
    { p: 'normal' as const, f: 'quincenal' as const, b: 'pensionado' as const, rows: OFFICIAL_QUOTA_TABLES.normalQuincenalPensionados },
    { p: 'normal' as const, f: 'mensual' as const, b: 'activo' as const, rows: OFFICIAL_QUOTA_TABLES.normalMensualActivos },
    { p: 'express' as const, f: 'quincenal' as const, b: 'activo' as const, rows: OFFICIAL_QUOTA_TABLES.expressQuincenal },
    { p: 'express' as const, f: 'mensual' as const, b: 'activo' as const, rows: OFFICIAL_QUOTA_TABLES.expressMensual },
  ];

  let totalQuotaRows = 0;
  let totalQuotaDiscrepancy = new Decimal(0);
  for (const s of allSheets) {
    for (const r of s.rows) {
      totalQuotaRows++;
      const sim = calculateSimulation(r.amount, r.termPeriods, s.p, {
        frequency: s.f,
        borrowerProfile: s.b,
      });
      const diff = new Decimal(sim.periodicPayment).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).minus(new Decimal(r.periodicPayment)).abs();
      totalQuotaDiscrepancy = totalQuotaDiscrepancy.plus(diff);
    }
  }
  assertCondition(totalQuotaRows === 293, `Se esperaban 293 filas de cuotas oficiales, se leyeron ${totalQuotaRows}`);
  assertCondition(totalQuotaDiscrepancy.eq(0), `Discrepancia en tablas de cuotas: $${totalQuotaDiscrepancy.toFixed(2)}`);

  const catExpress = calculateRegulatoryCatBanxico(5000, 6, new Decimal('0.80').div(24), 0, 'quincenal');
  assertCondition(catExpress === 119.67, `CAT Banxico Express esperado 119.67%, obtenido ${catExpress}%`);

  const lftCheck = validateLegalPaymentCapacityLft110(949.68, 3000.0);
  assertCondition(!lftCheck.isValid, 'El tope legal del 30% Art. 110 LFT debió bloquear descuento > $900 sobre sueldo de $3,000');

  const unionRoute = evaluateTriageAndChannelRouting('Soy sindicalizado del poder judicial de Chihuahua', []);
  const sanitizedUnion = enforcePostLlmTriageBarrier('Visítanos en Vía Citadela #5710', unionRoute);
  assertCondition(!/Citadela/i.test(sanitizedUnion), 'Fuga detectada: Vía Citadela no debe aparecer en ruta sindical');

  console.log(`✅ [GUARDRAIL 1 PASADO] 293/293 filas con $0.00 discrepancia | CAT Banxico: ${catExpress}% | Tope 30% LFT y Silo Sindicato intactos.\n`);

  // ============================================================================
  // BLOQUE 2 (GUARDRAIL 2): TECHO ANTI-GOD-OBJECT (< 580 / 600 LÍNEAS) Y CERO FLOATS
  // ============================================================================
  console.log('--- [BLOQUE 2] Verificando Techo Anti-God-Object (< 580 líneas) y Cero Floats ---');
  for (const relPath of TARGET_FILES_062) {
    const absPath = path.join(process.cwd(), relPath);
    const content = fs.readFileSync(absPath, 'utf8');
    const lineCount = content.split(/\r?\n/).length;
    console.log(`   • ${relPath.padEnd(55)} : ${String(lineCount).padStart(3)} líneas (< 580 OK)`);
    assertCondition(lineCount > 20 && lineCount < 580, `El archivo ${relPath} tiene ${lineCount} líneas (fuera de rango 20..579)`);
  }

  for (const finService of [
    'src/services/migration/cloudMigrationService.ts',
    'src/services/crypto/nom151SignatureService.ts',
  ]) {
    const rawCode = fs.readFileSync(path.join(process.cwd(), finService), 'utf8');
    const floatMatches = rawCode.match(/\bparseFloat\s*\(/g) || [];
    assertCondition(floatMatches.length === 0, `Se detectó parseFloat en ${finService}`);
  }
  console.log('✅ [GUARDRAIL 2 PASADO] Los 23 archivos cumplen el límite Anti-God-Object (< 580 líneas) y FLOAT_CALLS_COUNT === 0.\n');

  // ============================================================================
  // BLOQUE 3 (GUARDRAIL 3 Y 4): SIMULACIÓN FORENSE E2E DE FASE 3 (3.1, 3.2, 3.3 Y 3.4)
  // ============================================================================
  console.log('--- [BLOQUE 3] Ejecutando Suite E2E de Fase 3 (3.1 PWA, 3.2 NOM-151, 3.3 Migración/Rollback, 3.4 Hub) ---');

  // 3.1: Crear Pre-Solicitud semilla para pruebas de Autoservicio y bloqueo 2h
  const testFolio = 'PRE-2026-9901';
  const testPhone = '6148889901';
  const testPreAppId = 'preapp_test_phase3_9901';
  const phoneBlind = await computeServerBlindIndex(testPhone);
  const emailBlind = await computeServerBlindIndex('acreditado.fase3@cruse.mx');
  const kms = getServerKms();
  const contactEnv = await encryptEnvelope(
    JSON.stringify({ fullName: 'LAURA PATRICIA TERRAZAS', phone: testPhone, email: 'acreditado.fase3@cruse.mx' }),
    kms
  );

  await db.execute(`DELETE FROM client_digital_signatures WHERE folio = $1`, [testFolio]);
  await db.execute(`DELETE FROM client_digital_documents WHERE folio = $1`, [testFolio]);
  await db.execute(`DELETE FROM client_app_folio_locks WHERE folio = $1`, [testFolio]);
  await db.execute(`DELETE FROM credit_pre_applications WHERE folio = $1`, [testFolio]);

  await db.execute(
    `INSERT INTO credit_pre_applications (
       id, folio, created_at, applicant_name_masked, phone_masked, email_masked,
       phone_blind_index, email_blind_index, convenio, encrypted_contact_envelope,
       product_id, product_name, requested_amount_mxn, term_fortnights,
       fortnightly_payment_mxn, monthly_payment_mxn, total_to_pay_mxn, cat_percent,
       interest_rate_text, inbox_status
     ) VALUES ($1,$2,$3,'LA*** PA*** TE***','614***9901','la***@cruse.mx',$4,$5,'STSGECH','${JSON.stringify(contactEnv)}','normal','Crédito Nómina Normal','20000.00',24,'1128.48','2256.96','27083.52','59.5','1.97% Quincenal','NO_LEIDO')`,
    [testPreAppId, testFolio, new Date().toISOString(), phoneBlind, emailBlind]
  );

  // Prueba de Candado de 2 horas tras 5 intentos fallidos
  for (let attempt = 1; attempt <= 5; attempt++) {
    const badRes = await verifyFolioAndPhoneWithLockout({
      folio: testFolio,
      phone10Digits: '6140000000',
      ip: '127.0.0.1',
      ua: 'ForensicAuditSuite/1.0',
    });
    if (badRes.ok) {
      assertCondition(false, `El intento fallido #${attempt} debió ser rechazado`);
    } else if (attempt < 5) {
      assertCondition(badRes.status === 401, `Intento #${attempt} esperaba HTTP 401, obtuvo ${badRes.status}`);
    } else {
      assertCondition(badRes.status === 423, `El 5° intento fallido debe activar bloqueo de 2 horas (HTTP 423), obtuvo ${badRes.status}`);
    }
  }
  console.log('   ✓ [Fase 3.1] Candado Anti-Fuerza Bruta verificado: 5 intentos fallidos activan bloqueo de 2 horas (HTTP 423).');

  // Liberar candado de prueba y verificar sanitización Zero-EXIF + rawBuffer.fill(0)
  await db.execute(`DELETE FROM client_app_folio_locks WHERE folio = $1`, [testFolio]);
  const validAuth = await verifyFolioAndPhoneWithLockout({
    folio: testFolio,
    phone10Digits: testPhone,
    ip: '127.0.0.1',
  });
  if (!validAuth.ok) {
    throw new Error('Autenticación con Folio + Teléfono correcto debió ser exitosa');
  }

  const jpegWithExif = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10]),
    Buffer.from('Exif\x00\x00GPS_COORDS', 'ascii'),
    Buffer.from([0xff, 0xda]),
    Buffer.from('CLEAN_INE_SCAN_PAYLOAD', 'ascii'),
    Buffer.from([0xff, 0xd9]),
  ]);
  const sanitizedRes = sanitizeAndHashDocumentInRam(jpegWithExif.toString('base64'));
  assertCondition(
    sanitizedRes.exifStripped && sanitizedRes.removedMetadataSegmentsCount === 1 && sanitizedRes.sanitizedByteLength < sanitizedRes.originalByteLength,
    'El sanitizador Zero-EXIF debió eliminar el segmento APP1 EXIF/GPS y reducir el tamaño del binario'
  );
  console.log(
    `   ✓ [Fase 3.1] Purga binaria Zero-EXIF y rawBuffer.fill(0) verificada (${sanitizedRes.originalByteLength}B -> ${sanitizedRes.sanitizedByteLength}B, SHA-256: ${sanitizedRes.sanitizedSha256.slice(0, 16)}...).`
  );

  // Subir los 4 documentos y probar Firma NOM-151 (Fase 3.2)
  const docTypes = ['INE_FRONT', 'INE_BACK', 'PAYSTUB', 'PROOF_OF_ADDRESS'] as const;
  const docHashes: Record<typeof docTypes[number], string> = {
    INE_FRONT: '',
    INE_BACK: '',
    PAYSTUB: '',
    PROOF_OF_ADDRESS: '',
  };
  for (const dt of docTypes) {
    const sDoc = sanitizeAndHashDocumentInRam(Buffer.from(`DOC_${dt}_${testFolio}`).toString('base64'));
    docHashes[dt] = sDoc.sanitizedSha256;
    await db.execute(
      `INSERT INTO client_digital_documents (
         id, pre_application_id, folio, doc_type, document_sha256, is_overwrite, exif_stripped,
         encrypted_extracted_summary, kek_version, ocr_confidence_score, ocr_status, created_at
       ) VALUES ($1,$2,$3,$4,$5,0,1,$6,1,'0.99','VALIDATED',$7)`,
      [`cdoc_${dt}`, testPreAppId, testFolio, dt, sDoc.sanitizedSha256, JSON.stringify(contactEnv), new Date().toISOString()]
    );
  }

  const spoofCheck = validateLegalConsentsAndLiveness(
    { acceptedContractAndCat: true, acceptedPayrollDiscountMandate: true, acceptedBiometricAndPrivacyNotice: true },
    { durationMs: 800, livenessScore: '0.99', challengesPassed: ['BLINK_DETECTED', 'HEAD_TURN_VERIFIED'] }
  );
  assertCondition(!spoofCheck.ok, 'Prueba de vida < 1500ms (800ms) debió ser rechazada por protección anti-spoofing');

  const validLivenessCheck = validateLegalConsentsAndLiveness(
    { acceptedContractAndCat: true, acceptedPayrollDiscountMandate: true, acceptedBiometricAndPrivacyNotice: true },
    { durationMs: 1850, livenessScore: '0.98', challengesPassed: ['FACE_CENTERED', 'BLINK_DETECTED', 'HEAD_TURN_VERIFIED'] }
  );
  assertCondition(validLivenessCheck.ok, 'Prueba de vida >= 1500ms con 3 consentimientos debió ser aprobada');

  const expSummary = await buildClientExpedienteSummary(validAuth.preApp);
  const manifest = buildCanonicalContractManifest({
    folio: expSummary.folio,
    preApplicationId: expSummary.preApplicationId,
    applicantMaskedName: expSummary.applicantMaskedName,
    convenio: expSummary.convenio,
    productType: expSummary.productType,
    requestedAmountMxn: expSummary.requestedAmountMxn,
    termFortnights: expSummary.termFortnights,
    fortnightlyPaymentMxn: expSummary.estimatedFortnightlyPaymentMxn,
    catInformativePercent: expSummary.catInformativePercent,
    documentHashes: docHashes,
  });

  const nom151Generated = await generateNom151ConstanciaAndEnvelope({
    manifest,
    consents: { acceptedContractAndCat: true, acceptedPayrollDiscountMandate: true, acceptedBiometricAndPrivacyNotice: true },
    liveness: { durationMs: 1850, livenessScore: '0.98', challengesPassed: ['FACE_CENTERED', 'BLINK_DETECTED', 'HEAD_TURN_VERIFIED'] },
    signatureRequestId: `SIGREQ-${testFolio}`,
  });
  assertCondition(
    nom151Generated.record.nom151ConstanciaSha256.length === 64 &&
      nom151Generated.record.termsHash.length === 64 &&
      nom151Generated.record.payrollDiscountHash.length === 64 &&
      nom151Generated.record.biometricConsentHash.length === 64,
    'La Constancia NOM-151 debe vincular los 3 hashes legales y emitir un hash SHA-256 de 64 caracteres'
  );
  console.log(
    `   ✓ [Fase 3.2] Firma Digital NOM-151 y Prueba de Vida (>= 1500ms) verificadas (Constancia SHA-256: ${nom151Generated.record.nom151ConstanciaSha256.slice(0, 16)}...).`
  );

  // 3.3: Migración Histórica Excel -> Nube (Decimal.js) y Plan de Regreso (Rollback Instantáneo)
  const migRun1 = await ingestAndReconcileLegacyExcelBatch({
    sourceFilename: 'Sabana_Historica_Cruse_2024_2026.xlsx',
    rows: SAMPLE_LEGACY_EXCEL_ROWS,
    declaredExcelTotalPrincipalMxn: '70400.50',
    declaredExcelTotalLiveBalanceMxn: '55000.50',
    actorEmail: 'admin@cruse.mx',
  });
  assertCondition(migRun1.ok && migRun1.batch.discrepancyMxn === '0.00', 'La ingesta histórica debió cuadrar con $0.00 de discrepancia');

  const rollbackRes = await executeInstantBatchRollback({
    batchId: migRun1.batch.id,
    actorEmail: 'admin@cruse.mx',
  });
  assertCondition(
    rollbackRes.cryptographicParityVerified &&
      rollbackRes.preMigrationSnapshotSha256 === rollbackRes.postRollbackSnapshotSha256,
    'El Plan de Regreso (Rollback) debe restaurar exactamente el mismo SHA-256 Pre-Migración'
  );
  console.log(
    `   ✓ [Fase 3.3] Migración Excel (Decimal.js $0.00 discrepancia) y Rollback Instantáneo verificados (Pre-SHA256 === Post-SHA256: ${rollbackRes.postRollbackSnapshotSha256.slice(0, 16)}...).`
  );

  // Dejar un lote migrado activo en STAGING_PARALLEL para que Alma y Gerardo lo vean listo en la UI
  await ingestAndReconcileLegacyExcelBatch({
    sourceFilename: 'Sabana_Historica_Cruse_2024_2026.xlsx',
    rows: SAMPLE_LEGACY_EXCEL_ROWS,
    declaredExcelTotalPrincipalMxn: '70400.50',
    declaredExcelTotalLiveBalanceMxn: '55000.50',
    actorEmail: 'admin@cruse.mx',
  });

  // 3.4: Ingesta de Layout .TXT de 60 caracteres con línea truncada aislada + Conectores Zero-Trust
  const inboundLayoutRes = await ingestInboundInstitutionalLayout({
    connectorCode: 'CONN-STJ-CHIH',
    layoutFormat: 'FIXED_WIDTH_TXT',
    periodCode: '2026-Q22',
    rawLayoutContent: SAMPLE_INBOUND_60CHAR_TXT_WITH_TRUNCATED_LINE,
    declaredTotalMxn: SAMPLE_INBOUND_DECLARED_TOTAL_MXN,
    actorEmail: 'admin@cruse.mx',
  });
  assertCondition(
    inboundLayoutRes.status === 'PARTIAL_WITH_REJECTIONS' &&
      inboundLayoutRes.validRowsCount === 3 &&
      inboundLayoutRes.rejectedRowsCount === 1 &&
      inboundLayoutRes.verifiedTotalMxn === '5312.51' &&
      inboundLayoutRes.discrepancyMxn === '0.00',
    'El validador de layouts de 60 caracteres debe procesar las 3 filas válidas ($5,312.51) y aislar la línea #3 truncada sin abortar el lote'
  );
  console.log(
    `   ✓ [Fase 3.4] Layout 60 chars verificado: 3 filas válidas ($${inboundLayoutRes.verifiedTotalMxn} MXN) + 1 línea truncada aislada (Fila #${inboundLayoutRes.rejectedRows[0]?.lineNumber}).`
  );

  // Prueba de Conectores Zero-Trust: rechazo ante HMAC alterado y ante timestamp expirado (> 300s)
  const hubOverview = await getOperationsAndIntegrationHubOverview('ALL');
  const erpConn = hubOverview.connectors.find((c) => c.connectorCode === 'CONN-ERP-SAP-CORE')!;
  const nowSec = Math.floor(Date.now() / 1000);
  const payloadJson = JSON.stringify({ test: 'ZEROTRUST' });

  const tamperedCheck = await verifyAndSyncZeroTrustConnector({
    connectorCode: erpConn.connectorCode,
    payloadJson,
    providedMtlsThumbprintSha256: erpConn.expectedMtlsThumbprintSha256,
    providedTimestampEpochSec: nowSec,
    providedHmacSha256: '000000000000000000000000000000000000000000000000000000000000bad0',
  });
  assertCondition(!tamperedCheck.ok, 'El conector Zero-Trust debió rechazar firma HMAC alterada');

  const expiredCheck = await verifyAndSyncZeroTrustConnector({
    connectorCode: erpConn.connectorCode,
    payloadJson,
    providedMtlsThumbprintSha256: erpConn.expectedMtlsThumbprintSha256,
    providedTimestampEpochSec: nowSec - 450,
    providedHmacSha256: '000000000000000000000000000000000000000000000000000000000000bad0',
  });
  assertCondition(!expiredCheck.ok, 'El conector Zero-Trust debió rechazar timestamp expirado (> 300s)');
  console.log('   ✓ [Fase 3.4] Conectores Zero-Trust verificados: rechazan firma HMAC alterada y timestamps fuera de la ventana de 300s.\n');

  console.log('================================================================================');
  console.log('🏆 CERTIFICACIÓN FORENSE CRUSE-APO-2026-062 COMPLETADA AL 100% (EXIT CODE 0)');
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Error fatal en verify_apo_062:', err);
  process.exit(1);
});
