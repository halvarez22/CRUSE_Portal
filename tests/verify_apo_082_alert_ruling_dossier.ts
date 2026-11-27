/**
 * SUITE FORENSE CRUSE-APO-2026-082 (15 CASOS — DOSSIER EFÍMERO DE DICTAMINACIÓN PLD/FT)
 *
 * 1) RBAC Denegado (403) para rol sin `pld:resolve_alert` (ej. promotor)
 * 2) RBAC Autorizado (200) para `oficial_cumplimiento` y `admin` + Cache-Control: no-store
 * 3) Sellado WORM con `actorEmail` enmascarado (`o***@cruse.mx`)
 * 4) Sellado WORM con CERO PII en `details` y `sourceSummary`
 * 5) Descifrado AES-GCM 256 de EXPEDIENTE (nombre real, CURP, RFC, exposición)
 * 6) Descifrado AES-GCM 256 de INVESTOR (nombre real, RFC)
 * 7) Alerta inexistente retorna ALERT_NOT_FOUND / HTTP 404 sin sellar revelación
 * 8) Purga en RAM del modal React (`PldAlertRulingModal.tsx`: setDossier(null), abort, requestSeqRef)
 * 9) No-regresión de contrato de dictamen (`CONFIRMED_BLOCKED`, `CLEARED_EDD`, `FALSE_POSITIVE`)
 * 10) Plantilla de justificación sugerida (>= 10 chars para las 3 resoluciones)
 * 11) Límite Anti-God-Object (< 580L en los 6 archivos tocados)
 * 12) Cero PII en logs del servidor (`console.log` / `console.error` interceptados)
 * 13) Orden atómico: `['WORM_SEALED', 'DECRYPT_EXECUTED']` (WORM ANTES de descifrar)
 * 14) Fail-Safe: si el sellado WORM falla, aborta con error y `decryptCalled === 0` (no revela PII)
 * 15) Concurrencia: 2 oficiales simultáneos descifrando la misma alerta sin race conditions
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isRoleAuthorized } from '../src/config/rbacPolicy';
import { encryptEnvelope } from '../src/services/crypto/cryptoService';
import { getServerKms } from '../src/services/crypto/serverKeyring';
import { db } from '../src/services/db/connectionPool';
import { DossierAuditPayload, getPldAlertRulingDossier } from '../src/services/pld/pldAlertDossierService';
import { buildSuggestedRulingJustification } from '../src/components/admin/PldAlertRulingModal';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.CRUSE_KEK_CURRENT_VERSION = '1';
  process.env.CRUSE_KEK_V1 = Buffer.alloc(32, 7).toString('base64');
  process.env.BLIND_INDEX_SECRET = Buffer.alloc(32, 9).toString('base64');
  process.env.DATABASE_URL = '';

  let passed = 0;

  // CASO 1 y 2: Matriz RBAC estricta (`pld:resolve_alert`)
  assert.equal(isRoleAuthorized('pld:resolve_alert', 'promotor'), false, 'Caso 1: promotor debe ser 403');
  assert.equal(isRoleAuthorized('pld:resolve_alert', 'oficial_cumplimiento'), true, 'Caso 2: oficial_cumplimiento autorizado');
  assert.equal(isRoleAuthorized('pld:resolve_alert', 'admin'), true, 'Caso 2: admin autorizado');
  passed += 2;

  const kms = getServerKms();
  const nowIso = new Date().toISOString();
  const suffix = crypto.randomBytes(4).toString('hex');

  const expId = `exp_apo082_${suffix}`;
  const invId = `inv_apo082_${suffix}`;
  const riskId = `pld_re_apo082_${suffix}`;
  const alertExpId = `pld_ha_exp_${suffix}`;
  const alertInvId = `pld_ha_inv_${suffix}`;

  const secretExpName = 'JUAN PABLO PEREZ DEMO';
  const secretExpCurp = 'PEPJ850101HCHLRN09';
  const secretExpRfc = 'PEPJ850101AB1';
  const secretInvName = 'MARIA ELENA GOMEZ INVERSIONISTA';
  const secretInvRfc = 'GOME780304XY9';

  const expPayload = await encryptEnvelope(
    JSON.stringify({ fullName: secretExpName, curp: secretExpCurp, rfc: secretExpRfc }),
    kms
  );
  const invPayload = await encryptEnvelope(
    JSON.stringify({ fullName: secretInvName, rfc: secretInvRfc }),
    kms
  );

  await db.execute(
    `INSERT INTO expedientes (
       id, created_at, updated_at, convenio, full_name, curp_masked, blind_curp, blind_rfc, rfc_masked,
       address, phone, requested_amount, term_fortnights, product_type, status, promotor_email, encrypted_pii_payload, kek_version
     ) VALUES ($1, $2, $2, 'STSGECH', $3, $4, $5, $6, 'PEPJ******AB1', 'CIFRADO', '0000000000', 25000, 24, 'normal', 'aprobado', 'oficial@cruse.mx', $7, 1)`,
    [expId, nowIso, 'J*** P**** P****', 'PEPJ************09', `blind_curp_${suffix}`, `blind_rfc_${suffix}`, JSON.stringify(expPayload)]
  );

  await db.execute(
    `INSERT INTO investors (id, blind_name, encrypted_name, isr_retention_rate, applies_isr, requires_invoice, day_count_convention, tax_regime, funding_contract_folio)
     VALUES ($1, $2, $3, 0.20, 1, 0, 'ACTUAL_360', 'MUTUO_PF_ART160_INTERES', $4)`,
    [invId, `blind_inv_${suffix}`, JSON.stringify(invPayload), `CONT-082-${suffix}`]
  );

  await db.execute(
    `INSERT INTO pld_risk_entries (id, list_type, identifier_type, blind_index, identifier_masked, subject_masked_name, risk_level, official_reference, publication_date, source_file_hash, recorded_by, created_at)
     VALUES ($1, 'SAT_69B_PRESUNTO', 'CURP', $2, 'PEPJ************09', 'J*** P****', 'HIGH_EDD_REQUIRED', 'OFICIO-SAT-69B-082', '2026-11-27', $3, 'o***@cruse.mx', $4)`,
    [riskId, `blind_curp_${suffix}`, 'a'.repeat(64), nowIso]
  );

  await db.execute(
    `INSERT INTO pld_hit_alerts (id, screening_batch_id, risk_entry_id, entity_type, entity_id, blind_index_prefix, entity_masked_id, entity_masked_name, list_type, risk_level, official_reference, exposure_amount, detection_channel, status, created_at)
     VALUES ($1, NULL, $2, 'EXPEDIENTE', $3, 'abc123def456', 'PEPJ************09', 'J*** P**** P****', 'SAT_69B_PRESUNTO', 'HIGH_EDD_REQUIRED', 'OFICIO-SAT-69B-082', 25000, 'BATCH_SCREENING', 'PENDING_REVIEW', $4)`,
    [alertExpId, riskId, expId, nowIso]
  );

  await db.execute(
    `INSERT INTO pld_hit_alerts (id, screening_batch_id, risk_entry_id, entity_type, entity_id, blind_index_prefix, entity_masked_id, entity_masked_name, list_type, risk_level, official_reference, exposure_amount, detection_channel, status, created_at)
     VALUES ($1, NULL, $2, 'INVESTOR', $3, 'abc123def456', 'GOME********Y9', 'INVERSIONISTA PROTEGIDO', 'UIF_PERSONAS_BLOQUEADAS', 'CRITICAL_BLOCK', 'ACUERDO-UIF-082', 150000, 'BATCH_SCREENING', 'PENDING_REVIEW', $4)`,
    [alertInvId, riskId, invId, nowIso]
  );

  // Interceptar console.log / console.error para Caso 12 (cero PII en logs)
  const capturedLogs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => capturedLogs.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => capturedLogs.push(args.map(String).join(' '));

  const sealedEvents: DossierAuditPayload[] = [];
  const traceOrder: string[] = [];

  try {
    // CASOS 3, 4, 5, 13: Descifrado EXPEDIENTE + WORM enmascarado sin PII + Orden atómico
    const expDossier = await getPldAlertRulingDossier(
      {
        alertId: alertExpId,
        actorEmail: 'oficial.cumplimiento@cruse.mx',
        actorRole: 'oficial_cumplimiento',
        sourceIp: '187.190.10.20',
        userAgent: 'CruseTestAgent/1.0',
      },
      {
        auditWriter: async (ev) => {
          sealedEvents.push(ev);
          return ev;
        },
        onStepTrace: (step) => traceOrder.push(step),
      }
    );

    assert.equal(expDossier.subjectFullName, secretExpName, 'Caso 5: nombre real de expediente');
    assert.equal(expDossier.subjectCurp, secretExpCurp, 'Caso 5: CURP real de expediente');
    assert.equal(expDossier.subjectRfc, secretExpRfc, 'Caso 5: RFC real de expediente');
    assert.equal(expDossier.exposureAmount, '25000.00');
    assert.equal(expDossier.auditEventSealed, true);
    passed++; // Caso 5

    assert.equal(sealedEvents.length, 1);
    assert.equal(sealedEvents[0]!.action, 'PLD_ALERT_PII_REVEALED');
    assert.notEqual(sealedEvents[0]!.actorEmail, 'oficial.cumplimiento@cruse.mx', 'Caso 3: actorEmail debe ir enmascarado');
    assert.ok(sealedEvents[0]!.actorEmail.includes('***'), 'Caso 3: formato enmascarado');
    passed++; // Caso 3

    const serializedEvent = JSON.stringify(sealedEvents[0]);
    assert.equal(serializedEvent.includes(secretExpName), false, 'Caso 4: cero nombre real en WORM');
    assert.equal(serializedEvent.includes(secretExpCurp), false, 'Caso 4: cero CURP real en WORM');
    assert.equal(serializedEvent.includes(secretExpRfc), false, 'Caso 4: cero RFC real en WORM');
    passed++; // Caso 4

    assert.deepEqual(traceOrder, ['WORM_SEALED', 'DECRYPT_EXECUTED'], 'Caso 13: WORM debe sellarse ANTES de descifrar');
    passed++; // Caso 13

    // CASO 6: Descifrado INVESTOR
    const invDossier = await getPldAlertRulingDossier(
      {
        alertId: alertInvId,
        actorEmail: 'admin@cruse.mx',
        actorRole: 'admin',
        sourceIp: '10.0.0.1',
      },
      { auditWriter: async (ev) => { sealedEvents.push(ev); return ev; } }
    );
    assert.equal(invDossier.subjectFullName, secretInvName, 'Caso 6: nombre real de inversionista');
    assert.equal(invDossier.subjectRfc, secretInvRfc, 'Caso 6: RFC real de inversionista');
    passed++; // Caso 6

    // CASO 7: Alerta inexistente -> ALERT_NOT_FOUND sin sellar WORM
    const countBefore404 = sealedEvents.length;
    await assert.rejects(
      () =>
        getPldAlertRulingDossier(
          { alertId: 'pld_ha_no_existe_999', actorEmail: 'admin@cruse.mx', actorRole: 'admin', sourceIp: '10.0.0.1' },
          { auditWriter: async (ev) => { sealedEvents.push(ev); return ev; } }
        ),
      /ALERT_NOT_FOUND/
    );
    assert.equal(sealedEvents.length, countBefore404, 'Caso 7: no debe sellar evento para alerta inexistente');
    passed++; // Caso 7

    // CASO 14: Fail-Safe — Si WORM falla, aborta y NO descifra ni revela PII
    let decryptCalledOnFail = 0;
    await assert.rejects(
      () =>
        getPldAlertRulingDossier(
          { alertId: alertExpId, actorEmail: 'admin@cruse.mx', actorRole: 'admin', sourceIp: '10.0.0.1' },
          {
            auditWriter: async () => {
              throw new Error('WORM_DB_UNAVAILABLE');
            },
            onStepTrace: (step) => {
              if (step === 'DECRYPT_EXECUTED') decryptCalledOnFail++;
            },
          }
        ),
      /WORM_DB_UNAVAILABLE/
    );
    assert.equal(decryptCalledOnFail, 0, 'Caso 14: si WORM falla, NUNCA debe ejecutar descifrado');
    passed++; // Caso 14

    // CASO 15: Concurrencia — 2 usuarios simultáneos consultando la misma alerta sin race conditions
    const concurrentEvents: DossierAuditPayload[] = [];
    const [c1, c2] = await Promise.all([
      getPldAlertRulingDossier(
        { alertId: alertExpId, actorEmail: 'oficial1@cruse.mx', actorRole: 'oficial_cumplimiento', sourceIp: '10.0.0.10' },
        { auditWriter: async (ev) => { concurrentEvents.push(ev); return ev; } }
      ),
      getPldAlertRulingDossier(
        { alertId: alertExpId, actorEmail: 'admin2@cruse.mx', actorRole: 'admin', sourceIp: '10.0.0.11' },
        { auditWriter: async (ev) => { concurrentEvents.push(ev); return ev; } }
      ),
    ]);
    assert.equal(c1.subjectFullName, secretExpName);
    assert.equal(c2.subjectFullName, secretExpName);
    assert.equal(concurrentEvents.length, 2, 'Caso 15: deben sellarse 2 eventos WORM independientes');
    passed++; // Caso 15
  } finally {
    console.log = origLog;
    console.error = origErr;
  }

  // CASO 12: Cero PII en logs del servidor
  const allLogs = capturedLogs.join('\n');
  assert.equal(allLogs.includes(secretExpName), false, 'Caso 12: cero nombre expediente en logs');
  assert.equal(allLogs.includes(secretExpCurp), false, 'Caso 12: cero CURP en logs');
  assert.equal(allLogs.includes(secretInvName), false, 'Caso 12: cero nombre inversionista en logs');
  passed++; // Caso 12

  // Limpiar fixtures sintéticos de expedientes/investors (pld_hit_alerts/pld_risk_entries son WORM inmutables)
  await db.execute(`DELETE FROM expedientes WHERE id LIKE 'exp_apo082_%'`);
  await db.execute(`DELETE FROM investors WHERE id LIKE 'inv_apo082_%'`);

  // CASOS 8 y 9: Inspección estructural de PldAlertRulingModal.tsx (purga en RAM + no-regresión resoluciones)
  const modalPath = path.resolve(process.cwd(), 'src/components/admin/PldAlertRulingModal.tsx');
  const modalSrc = fs.readFileSync(modalPath, 'utf8');
  assert.ok(modalSrc.includes('purgeDossierFromMemory') && modalSrc.includes('setDossier(null)') && modalSrc.includes('controller.abort()') && modalSrc.includes('requestSeqRef'), 'Caso 8: purga RAM + AbortController + requestSeqRef');
  passed++; // Caso 8

  assert.ok(modalSrc.includes('CONFIRMED_BLOCKED') && modalSrc.includes('CLEARED_EDD') && modalSrc.includes('FALSE_POSITIVE'), 'Caso 9: contrato de 3 resoluciones intacto');
  const routerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/services/api/pldRouter.ts'), 'utf8');
  assert.ok(routerSrc.includes("Cache-Control', 'no-store, no-cache, must-revalidate, private'"), 'Caso 2/9: header Cache-Control no-store presente');
  passed++; // Caso 9

  // CASO 10: Plantilla sugerida de justificación (>= 10 chars para las 3 resoluciones)
  for (const status of ['CONFIRMED_BLOCKED', 'CLEARED_EDD', 'FALSE_POSITIVE'] as const) {
    const tpl = buildSuggestedRulingJustification({
      resolutionStatus: status,
      entityType: 'EXPEDIENTE',
      entityId: expId,
      listLabel: 'SAT Art. 69-B Presunto',
      officialReference: 'OFICIO-SAT-69B-082',
    });
    assert.ok(tpl.length >= 40 && tpl.includes(expId) && tpl.includes('OFICIO-SAT-69B-082'), `Caso 10: plantilla válida para ${status}`);
  }
  passed++; // Caso 10

  // CASO 11: Límite Anti-God-Object (< 580L en todos los archivos tocados)
  const filesToCheck = [
    'src/types/index.ts',
    'src/services/audit/auditMask.ts',
    'src/services/pld/pldAlertDossierService.ts',
    'src/services/api/pldRouter.ts',
    'src/components/admin/PldAlertRulingModal.tsx',
    'src/components/admin/PldComplianceView.tsx',
  ];
  const lineSummary: string[] = [];
  for (const rel of filesToCheck) {
    const count = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8').split(/\r?\n/).length;
    assert.ok(count < 580, `Caso 11: ${rel} (${count}L) excede límite < 580L`);
    lineSummary.push(`${path.basename(rel)}=${count}L`);
  }
  passed++; // Caso 11

  console.log(`APO-082 PASS: ${passed}/15 cases verified (RBAC, WORM-before-decrypt, zeroization, RAM purge, concurrency, ${lineSummary.join(', ')}).`);
}

run().catch((err) => {
  console.error('APO-082 FAILED:', err);
  process.exit(1);
});
