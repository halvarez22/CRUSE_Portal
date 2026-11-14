/**
 * MOTOR DE MIGRACIÓN HISTÓRICA EXCEL -> NUBE, SANEAMIENTO DETERMINISTA Y ROLLBACK (FASE 3.3)
 *
 * Implementa Guardrail 3 de CRUSE-APO-2026-049 / CRUSE-APO-2026-062:
 * - Aritmética exclusiva `Decimal.js` (Cero float/parseFloat en montos monetarios).
 * - Normalización determinista de fechas seriales de Excel (base 1899-12-30) y texto en español.
 * - Cuadre estricto centavo a centavo (`$0.00 MXN` varianza) o aborto atómico (`ABORTED_DISCREPANCY`).
 * - Idempotencia total por `legacy_contract_number` (cero duplicación de saldos en re-ejecución).
 * - Plan de Regreso (Rollback Instantáneo) con verificación criptográfica `Pre-SHA256 === Post-SHA256`.
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { encryptEnvelope } from '../crypto/cryptoService';
import { computeServerBlindIndex, getServerKms } from '../crypto/serverKeyring';
import { maskCurp } from '../audit/auditMask';
import {
  CleanedMigratedPortfolioItem,
  CloudMigrationBatchRecord,
  CloudMigrationCutoverMode,
  CloudMigrationOverview,
  LegacyExcelRawRowInput,
} from '../../types';

const SPANISH_MONTHS: Readonly<Record<string, string>> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

export function normalizeLegacyExcelDate(raw: string | number): { isoDate: string; note: string } {
  const str = String(raw ?? '').trim();
  if (/^\d{5}$/.test(str)) {
    const serialDays = parseInt(str, 10);
    const excelEpochMs = Date.UTC(1899, 11, 30);
    const d = new Date(excelEpochMs + serialDays * 86400000);
    const iso = d.toISOString().slice(0, 10);
    return { isoDate: iso, note: `Serial Excel ${str} -> ${iso}` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return { isoDate: str, note: 'ISO canónico directo' };
  }
  const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1]!.padStart(2, '0');
    const month = slashMatch[2]!.padStart(2, '0');
    const rawYear = slashMatch[3]!;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const iso = `${year}-${month}-${day}`;
    return { isoDate: iso, note: `Fecha diagonal ${str} -> ${iso}` };
  }
  const textMatch = str.match(/^(\d{1,2})[-\s]([a-zA-Z]{3,4})[-\s](\d{2,4})$/);
  if (textMatch) {
    const day = textMatch[1]!.padStart(2, '0');
    const monKey = textMatch[2]!.slice(0, 3).toLowerCase();
    const month = SPANISH_MONTHS[monKey] || '01';
    const rawYear = textMatch[3]!;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const iso = `${year}-${month}-${day}`;
    return { isoDate: iso, note: `Fecha texto ${str} -> ${iso}` };
  }
  return { isoDate: '2026-01-15', note: `Fecha normalizada por defecto (${str})` };
}

export function sanitizeExcelMoneyToDecimal(raw: string | number): { decimalValue: Decimal; note?: string } {
  const s = String(raw ?? '0').trim().replace(/[$\sMXNmxn]/g, '');
  if (!s) return { decimalValue: new Decimal(0) };

  // Detectar formato europeo "25.400,50" vs anglosajón "25,400.50"
  if (s.includes('.') && s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    const normalized = s.replace(/\./g, '').replace(',', '.');
    return { decimalValue: new Decimal(normalized), note: `Moneda europea ${s} -> ${normalized}` };
  }
  const clean = s.replace(/,/g, '');
  return {
    decimalValue: new Decimal(clean),
    note: s !== clean ? `Moneda con separadores ${s} -> ${clean}` : undefined,
  };
}

function maskPersonName(fullName: string): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ACREDITADO PROTEGIDO';
  return parts
    .map((p, idx) => (idx === 0 || idx === parts.length - 1 ? p : `${p[0]}***`))
    .join(' ');
}

function maskRfc(rfc: string): string {
  const clean = String(rfc || '').trim().toUpperCase();
  if (clean.length < 8) return '****000000***';
  return `${clean.slice(0, 4)}******${clean.slice(-3)}`;
}

export async function computeActiveMigratedPortfolioSnapshotSha256(): Promise<string> {
  const res = await db.query<{
    legacy_contract_number: string;
    principal_original_mxn: string;
    live_balance_mxn: string;
    migration_status: string;
  }>(
    `SELECT legacy_contract_number, principal_original_mxn, live_balance_mxn, migration_status
     FROM cleaned_migrated_portfolio
     WHERE migration_status != 'ROLLED_BACK'
     ORDER BY legacy_contract_number ASC`
  );
  const canonical = JSON.stringify(res.rows);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export const SAMPLE_LEGACY_EXCEL_ROWS: readonly LegacyExcelRawRowInput[] = [
  {
    rowNumber: 1,
    legacyContractNumber: 'HIST-CHIH-2024-001',
    convenio: 'STSGECH - Sindicato Gobierno de Chihuahua',
    productType: 'NOMINA_NORMAL',
    rawOriginationDate: 45366, // Serial Excel -> 2024-03-15
    fullName: 'MARIA ELENA VILLALOBOS TERRAZAS',
    curp: 'VITM810514MCHLRR09',
    rfc: 'VITM810514AB1',
    rawPrincipalOriginal: '$ 35,000.00',
    rawAccruedCharges: '16,548.00',
    rawAppliedPayments: '$21,548.00',
    rawLiveBalance: '$30,000.00',
    rawFortnightlyPayment: '1,073.92',
    termFortnights: 48,
  },
  {
    rowNumber: 2,
    legacyContractNumber: 'HIST-STJ-2024-002',
    convenio: 'Supremo Tribunal de Justicia de Chihuahua',
    productType: 'NOMINA_NORMAL',
    rawOriginationDate: '20-Ene-24',
    fullName: 'JORGE ALBERTO LUJAN TREVIZO',
    curp: 'LUTJ790822HCHRRJ04',
    rfc: 'LUTJ790822CD9',
    rawPrincipalOriginal: '25.400,50', // Europeo -> 25400.50
    rawAccruedCharges: '9,012.18',
    rawAppliedPayments: '14,412.18',
    rawLiveBalance: '20.000,50',
    rawFortnightlyPayment: '955.91',
    termFortnights: 36,
  },
  {
    rowNumber: 3,
    legacyContractNumber: 'HIST-LEON-2024-003',
    convenio: 'Poder Judicial del Estado de Guanajuato (Hub León)',
    productType: 'EXPRESS',
    rawOriginationDate: '15/04/2024',
    fullName: 'CARLOS EDUARDO MONTES DE OCA',
    curp: 'MOOC851103HGTRRL02',
    rfc: 'MOOC851103EF4',
    rawPrincipalOriginal: '$10,000.00',
    rawAccruedCharges: '1,598.40',
    rawAppliedPayments: '6,598.40',
    rawLiveBalance: '5,000.00',
    rawFortnightlyPayment: '966.53',
    termFortnights: 12,
  },
];

export async function getCloudMigrationOverview(): Promise<CloudMigrationOverview> {
  const paramRes = await db.query<{ param_numeric_value: number | null; param_text_value: string | null }>(
    `SELECT param_numeric_value, param_text_value
     FROM system_financial_parameters
     WHERE param_key = 'CLOUD_MIGRATION_CUTOVER_ACTIVE'`
  );
  const isCutoverActive = Number(paramRes.rows[0]?.param_numeric_value ?? 0) === 1;
  const cutoverMode: CloudMigrationCutoverMode = isCutoverActive
    ? 'PRODUCTION_CUTOVER_ACTIVE'
    : 'STAGING_PARALLEL';

  const activeRowsRes = await db.query<{
    id: string; batch_id: string; legacy_contract_number: string; convenio: string; product_type: string;
    normalized_origination_date: string; masked_name: string; curp_masked: string; rfc_masked: string;
    principal_original_mxn: string; accrued_charges_mxn: string; applied_payments_mxn: string;
    live_balance_mxn: string; fortnightly_payment_mxn: string; term_fortnights: number;
    raw_row_sha256: string; cleansing_notes: string; migration_status: 'STAGED' | 'ACTIVE_CUTOVER' | 'ROLLED_BACK';
    created_at: string;
  }>(
    `SELECT * FROM cleaned_migrated_portfolio WHERE migration_status != 'ROLLED_BACK' ORDER BY created_at DESC, legacy_contract_number ASC`
  );

  let totalPrincipal = new Decimal(0);
  let totalLiveBalance = new Decimal(0);
  const latestCleanedRows: CleanedMigratedPortfolioItem[] = activeRowsRes.rows.map((r) => {
    totalPrincipal = totalPrincipal.plus(new Decimal(r.principal_original_mxn || '0'));
    totalLiveBalance = totalLiveBalance.plus(new Decimal(r.live_balance_mxn || '0'));
    return {
      id: r.id, batchId: r.batch_id, legacyContractNumber: r.legacy_contract_number,
      convenio: r.convenio, productType: r.product_type, normalizedOriginationDate: r.normalized_origination_date,
      maskedName: r.masked_name, curpMasked: r.curp_masked, rfcMasked: r.rfc_masked,
      principalOriginalMxn: new Decimal(r.principal_original_mxn).toFixed(2),
      accruedChargesMxn: new Decimal(r.accrued_charges_mxn).toFixed(2),
      appliedPaymentsMxn: new Decimal(r.applied_payments_mxn).toFixed(2),
      liveBalanceMxn: new Decimal(r.live_balance_mxn).toFixed(2),
      fortnightlyPaymentMxn: new Decimal(r.fortnightly_payment_mxn).toFixed(2),
      termFortnights: Number(r.term_fortnights), rawRowSha256: r.raw_row_sha256,
      cleansingNotes: r.cleansing_notes, migrationStatus: r.migration_status, createdAt: String(r.created_at),
    };
  });

  const batchesRes = await db.query<{
    id: string; batch_code: string; source_filename: string; payload_size_bytes: number;
    status: CloudMigrationBatchRecord['status']; total_rows: number; idempotent_upserts: number;
    excel_total_principal_mxn: string; migrated_total_principal_mxn: string;
    excel_total_live_balance_mxn: string; migrated_total_live_balance_mxn: string;
    discrepancy_mxn: string; pre_migration_snapshot_sha256: string; post_rollback_snapshot_sha256: string | null;
    post_rollback_verified: number; batch_manifest_sha256: string; executed_by_email: string;
    rolled_back_by_email: string | null; rolled_back_at: string | null; created_at: string;
  }>(`SELECT * FROM cloud_migration_batches ORDER BY created_at DESC LIMIT 25`);

  const batches: CloudMigrationBatchRecord[] = batchesRes.rows.map((b) => ({
    id: b.id, batchCode: b.batch_code, sourceFilename: b.source_filename,
    payloadSizeBytes: Number(b.payload_size_bytes), status: b.status,
    totalRows: Number(b.total_rows), idempotentUpserts: Number(b.idempotent_upserts),
    excelTotalPrincipalMxn: b.excel_total_principal_mxn, migratedTotalPrincipalMxn: b.migrated_total_principal_mxn,
    excelTotalLiveBalanceMxn: b.excel_total_live_balance_mxn, migratedTotalLiveBalanceMxn: b.migrated_total_live_balance_mxn,
    discrepancyMxn: b.discrepancy_mxn, preMigrationSnapshotSha256: b.pre_migration_snapshot_sha256,
    postRollbackSnapshotSha256: b.post_rollback_snapshot_sha256, postRollbackVerified: Number(b.post_rollback_verified) === 1,
    batchManifestSha256: b.batch_manifest_sha256, executedByEmail: b.executed_by_email,
    rolledBackByEmail: b.rolled_back_by_email, rolledBackAt: b.rolled_back_at, createdAt: String(b.created_at),
  }));

  return {
    cutoverMode,
    activeMigratedContractsCount: latestCleanedRows.length,
    totalMigratedPrincipalMxn: totalPrincipal.toFixed(2),
    totalMigratedLiveBalanceMxn: totalLiveBalance.toFixed(2),
    batches,
    latestCleanedRows,
  };
}

export async function ingestAndReconcileLegacyExcelBatch(params: {
  sourceFilename: string;
  rows: readonly LegacyExcelRawRowInput[];
  declaredExcelTotalPrincipalMxn: string;
  declaredExcelTotalLiveBalanceMxn: string;
  actorEmail: string;
}): Promise<{ ok: true; batch: CloudMigrationBatchRecord } | { ok: false; error: string; batch: CloudMigrationBatchRecord }> {
  const preMigrationSnapshotSha256 = await computeActiveMigratedPortfolioSnapshotSha256();
  const nowIso = new Date().toISOString();
  const batchId = `mig_${crypto.randomUUID()}`;
  const batchCode = `MIG-${nowIso.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const payloadSizeBytes = Buffer.byteLength(JSON.stringify(params.rows), 'utf8');

  let migratedPrincipalSum = new Decimal(0);
  let migratedLiveBalanceSum = new Decimal(0);
  let rowArithmeticDiscrepancy = new Decimal(0);

  const preparedRows: Array<{
    rawRow: LegacyExcelRawRowInput;
    rawJson: string;
    rawSha256: string;
    isoDate: string;
    principalFixed: string;
    chargesFixed: string;
    paymentsFixed: string;
    liveBalanceFixed: string;
    fortnightlyFixed: string;
    cleansingNotes: string[];
    blindCurp: string;
    blindRfc: string;
    encryptedEnvelopeJson: string;
    kekVersion: number;
  }> = [];

  const kms = getServerKms();

  for (const r of params.rows) {
    const notes: string[] = [];
    const dateNorm = normalizeLegacyExcelDate(r.rawOriginationDate);
    notes.push(dateNorm.note);

    const pDec = sanitizeExcelMoneyToDecimal(r.rawPrincipalOriginal);
    if (pDec.note) notes.push(pDec.note);
    const cDec = sanitizeExcelMoneyToDecimal(r.rawAccruedCharges);
    const payDec = sanitizeExcelMoneyToDecimal(r.rawAppliedPayments);
    const liveDec = sanitizeExcelMoneyToDecimal(r.rawLiveBalance);
    if (liveDec.note) notes.push(liveDec.note);
    const fnDec = sanitizeExcelMoneyToDecimal(r.rawFortnightlyPayment);

    // Identidad contable por fila: Principal + Cargos - Pagos == Saldo Vivo
    const expectedRowBalance = pDec.decimalValue.plus(cDec.decimalValue).minus(payDec.decimalValue);
    const rowDiff = expectedRowBalance.minus(liveDec.decimalValue).abs();
    rowArithmeticDiscrepancy = rowArithmeticDiscrepancy.plus(rowDiff);

    migratedPrincipalSum = migratedPrincipalSum.plus(pDec.decimalValue);
    migratedLiveBalanceSum = migratedLiveBalanceSum.plus(liveDec.decimalValue);

    const rawJson = JSON.stringify(r);
    const rawSha256 = crypto.createHash('sha256').update(rawJson).digest('hex');
    const blindCurp = await computeServerBlindIndex(r.curp.trim().toUpperCase());
    const blindRfc = await computeServerBlindIndex(r.rfc.trim().toUpperCase());
    const envelope = await encryptEnvelope(
      JSON.stringify({ fullName: r.fullName, curp: r.curp, rfc: r.rfc, legacyContractNumber: r.legacyContractNumber }),
      kms
    );

    preparedRows.push({
      rawRow: r,
      rawJson,
      rawSha256,
      isoDate: dateNorm.isoDate,
      principalFixed: pDec.decimalValue.toFixed(2),
      chargesFixed: cDec.decimalValue.toFixed(2),
      paymentsFixed: payDec.decimalValue.toFixed(2),
      liveBalanceFixed: liveDec.decimalValue.toFixed(2),
      fortnightlyFixed: fnDec.decimalValue.toFixed(2),
      cleansingNotes: notes,
      blindCurp,
      blindRfc,
      encryptedEnvelopeJson: JSON.stringify(envelope),
      kekVersion: envelope.kekVersion,
    });
  }

  const declaredPrincipalDec = sanitizeExcelMoneyToDecimal(params.declaredExcelTotalPrincipalMxn).decimalValue;
  const declaredLiveDec = sanitizeExcelMoneyToDecimal(params.declaredExcelTotalLiveBalanceMxn).decimalValue;

  const principalDiff = declaredPrincipalDec.minus(migratedPrincipalSum).abs();
  const liveDiff = declaredLiveDec.minus(migratedLiveBalanceSum).abs();
  const totalDiscrepancy = principalDiff.plus(liveDiff).plus(rowArithmeticDiscrepancy);

  const batchManifestSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify({ batchCode, rows: preparedRows.map((x) => x.rawSha256), totalDiscrepancy: totalDiscrepancy.toFixed(2) }))
    .digest('hex');

  if (!totalDiscrepancy.eq(0)) {
    await db.execute(
      `INSERT INTO cloud_migration_batches (
         id, batch_code, source_filename, payload_size_bytes, status, total_rows, idempotent_upserts,
         excel_total_principal_mxn, migrated_total_principal_mxn, excel_total_live_balance_mxn,
         migrated_total_live_balance_mxn, discrepancy_mxn, pre_migration_snapshot_sha256,
         batch_manifest_sha256, executed_by_email, created_at
       ) VALUES ($1,$2,$3,$4,'ABORTED_DISCREPANCY',$5,0,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        batchId,
        batchCode,
        params.sourceFilename,
        payloadSizeBytes,
        preparedRows.length,
        declaredPrincipalDec.toFixed(2),
        migratedPrincipalSum.toFixed(2),
        declaredLiveDec.toFixed(2),
        migratedLiveBalanceSum.toFixed(2),
        totalDiscrepancy.toFixed(2),
        preMigrationSnapshotSha256,
        batchManifestSha256,
        params.actorEmail,
        nowIso,
      ]
    );

    const overview = await getCloudMigrationOverview();
    const abortedBatch = overview.batches.find((b) => b.id === batchId)!;
    return {
      ok: false,
      error: `ABORTO ATÓMICO POR DESCUADRE CONTABLE: Se detectó una discrepancia de $${totalDiscrepancy.toFixed(2)} MXN (Tolerancia: $0.00 MXN). Ningún contrato fue alterado.`,
      batch: abortedBatch,
    };
  }

  let idempotentUpserts = 0;
  await db.transaction(async (tx) => {
    for (const item of preparedRows) {
      await tx.execute(
        `INSERT INTO legacy_excel_raw_rows (
           id, batch_id, row_number, legacy_contract_number, raw_row_json, raw_row_sha256, cleansing_transformations_json, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          `raw_${crypto.randomUUID()}`,
          batchId,
          item.rawRow.rowNumber,
          item.rawRow.legacyContractNumber,
          item.rawJson,
          item.rawSha256,
          JSON.stringify(item.cleansingNotes),
          nowIso,
        ]
      );

      const existing = await tx.query<{ id: string }>(
        `SELECT id FROM cleaned_migrated_portfolio WHERE legacy_contract_number = $1`,
        [item.rawRow.legacyContractNumber]
      );

      if (existing.rowCount > 0) {
        idempotentUpserts++;
        await tx.execute(
          `UPDATE cleaned_migrated_portfolio
           SET batch_id = $1, convenio = $2, product_type = $3, normalized_origination_date = $4,
               principal_original_mxn = $5, accrued_charges_mxn = $6, applied_payments_mxn = $7,
               live_balance_mxn = $8, fortnightly_payment_mxn = $9, term_fortnights = $10,
               raw_row_sha256 = $11, cleansing_notes = $12, migration_status = 'STAGED', created_at = $13
           WHERE legacy_contract_number = $14`,
          [
            batchId, item.rawRow.convenio, item.rawRow.productType, item.isoDate,
            item.principalFixed, item.chargesFixed, item.paymentsFixed, item.liveBalanceFixed,
            item.fortnightlyFixed, item.rawRow.termFortnights, item.rawSha256,
            item.cleansingNotes.join(' | '), nowIso, item.rawRow.legacyContractNumber,
          ]
        );
      } else {
        await tx.execute(
          `INSERT INTO cleaned_migrated_portfolio (
             id, batch_id, legacy_contract_number, convenio, product_type, normalized_origination_date,
             masked_name, curp_masked, rfc_masked, blind_curp, blind_rfc,
             principal_original_mxn, accrued_charges_mxn, applied_payments_mxn, live_balance_mxn,
             fortnightly_payment_mxn, term_fortnights, encrypted_pii_envelope, kek_version,
             raw_row_sha256, cleansing_notes, migration_status, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'STAGED',$22)`,
          [
            `cln_${crypto.randomUUID()}`, batchId, item.rawRow.legacyContractNumber, item.rawRow.convenio,
            item.rawRow.productType, item.isoDate, maskPersonName(item.rawRow.fullName),
            maskCurp(item.rawRow.curp), maskRfc(item.rawRow.rfc), item.blindCurp, item.blindRfc,
            item.principalFixed, item.chargesFixed, item.paymentsFixed, item.liveBalanceFixed,
            item.fortnightlyFixed, item.rawRow.termFortnights, item.encryptedEnvelopeJson,
            item.kekVersion, item.rawSha256, item.cleansingNotes.join(' | '), nowIso,
          ]
        );
      }
    }

    await tx.execute(
      `INSERT INTO cloud_migration_batches (
         id, batch_code, source_filename, payload_size_bytes, status, total_rows, idempotent_upserts,
         excel_total_principal_mxn, migrated_total_principal_mxn, excel_total_live_balance_mxn,
         migrated_total_live_balance_mxn, discrepancy_mxn, pre_migration_snapshot_sha256,
         batch_manifest_sha256, executed_by_email, created_at
       ) VALUES ($1,$2,$3,$4,'STAGED_VERIFIED',$5,$6,$7,$8,$9,$10,'0.00',$11,$12,$13,$14)`,
      [
        batchId,
        batchCode,
        params.sourceFilename,
        payloadSizeBytes,
        preparedRows.length,
        idempotentUpserts,
        declaredPrincipalDec.toFixed(2),
        migratedPrincipalSum.toFixed(2),
        declaredLiveDec.toFixed(2),
        migratedLiveBalanceSum.toFixed(2),
        preMigrationSnapshotSha256,
        batchManifestSha256,
        params.actorEmail,
        nowIso,
      ]
    );
  });

  const overview = await getCloudMigrationOverview();
  const createdBatch = overview.batches.find((b) => b.id === batchId)!;
  return { ok: true, batch: createdBatch };
}

export async function executeInstantBatchRollback(params: {
  batchId: string;
  actorEmail: string;
}): Promise<{
  ok: true;
  preMigrationSnapshotSha256: string;
  postRollbackSnapshotSha256: string;
  cryptographicParityVerified: boolean;
}> {
  const batchRes = await db.query<{ id: string; pre_migration_snapshot_sha256: string }>(
    `SELECT id, pre_migration_snapshot_sha256 FROM cloud_migration_batches WHERE id = $1`,
    [params.batchId]
  );
  if (batchRes.rowCount === 0) {
    throw new Error('Lote de migración no encontrado.');
  }
  const preSha = batchRes.rows[0]!.pre_migration_snapshot_sha256;
  const nowIso = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.execute(`DELETE FROM cleaned_migrated_portfolio WHERE batch_id = $1`, [params.batchId]);
    await tx.execute(
      `UPDATE system_financial_parameters
       SET param_numeric_value = 0, param_text_value = 'STAGING_PARALLEL', updated_by = $1
       WHERE param_key = 'CLOUD_MIGRATION_CUTOVER_ACTIVE'`,
      [params.actorEmail]
    );
  });

  const postSha = await computeActiveMigratedPortfolioSnapshotSha256();
  const parityVerified = preSha === postSha;

  await db.execute(
    `UPDATE cloud_migration_batches
     SET status = 'ROLLED_BACK',
         post_rollback_snapshot_sha256 = $1,
         post_rollback_verified = $2,
         rolled_back_by_email = $3,
         rolled_back_at = $4
     WHERE id = $5`,
    [postSha, parityVerified ? 1 : 0, params.actorEmail, nowIso, params.batchId]
  );

  return {
    ok: true,
    preMigrationSnapshotSha256: preSha,
    postRollbackSnapshotSha256: postSha,
    cryptographicParityVerified: parityVerified,
  };
}

export async function toggleCloudMigrationCutoverMode(params: {
  targetMode: CloudMigrationCutoverMode;
  actorEmail: string;
}): Promise<CloudMigrationCutoverMode> {
  const numericVal = params.targetMode === 'PRODUCTION_CUTOVER_ACTIVE' ? 1 : 0;
  await db.execute(
    `UPDATE system_financial_parameters
     SET param_numeric_value = $1, param_text_value = $2, updated_by = $3
     WHERE param_key = 'CLOUD_MIGRATION_CUTOVER_ACTIVE'`,
    [numericVal, params.targetMode, params.actorEmail]
  );
  return params.targetMode;
}
