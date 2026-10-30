/**
 * MOTOR DE CUMPLIMIENTO ASISTIDO CNBV/UIF Y CONTROL DE CARGA SEMIAUTOMÁTICA CIB (FASE 2.4)
 *
 * Implementa los Puntos de Control #1, #2 y #4 de la FASE 2.4 (CRUSE-APO-2026-042):
 * 1. Punto de Control #1: Operaciones Fraccionadas ($500 a $7,500 USD en un mes calendario) y Relevantes con `Decimal.js`.
 * 2. Punto de Control #2: Buzón ROIP (Tipo SITI '3') y Sesión CCC con Reloj 60d + 3 días hábiles CNBV (`addCnbvBusinessDays`).
 * 3. Punto de Control #4: Flujo de 3 Pasos de Carga Semiautomática CIB (`GENERATED_PENDING_OC` -> `APPROVED_BY_OC` -> `UPLOADED_TO_CIB`)
 *    con sellado inmutable `CIB_BATCH_VALIDATED` en `audit_events` WORM.
 *
 * @implements CRUSE-APO-2026-042 (FASE 2.4 — Puntos de Control #1, #2 y #4)
 * @implements Regla 2 HRU (Cero Hardcoding) y Regla 3 Anti-God-Object (< 600 líneas)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { addDays } from 'date-fns';
import { db } from '../db/connectionPool';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import { auditEventStore } from '../audit/auditEventStore';
import { addCnbvBusinessDays } from './cnbvComplianceCron';
import { CibBatchWorkflowStatus, CibExportBatchItem, UserRole } from '../../types';

export interface CashOperationCandidateInput {
  readonly operationId: string;
  readonly expedienteId?: string | null;
  readonly blindCurp: string;
  readonly subjectMaskedName: string;
  readonly subjectCurpMasked: string;
  readonly subjectRfcMasked?: string;
  readonly hubCode?: string;
  readonly amountMxn: string;
  readonly operationDateIso: string; // YYYY-MM-DD
}

export interface FractionedCashEvaluationSummary {
  readonly evaluatedOperationsCount: number;
  readonly fxRateUsdMxn: string;
  readonly singleMinUsd: string;
  readonly monthlyAccumThresholdUsd: string;
  readonly relevantThresholdUsd: string;
  readonly triggeredFractionedReports: ReadonlyArray<{
    readonly reportId: string;
    readonly blindCurp: string;
    readonly calendarMonth: string;
    readonly qualifyingOperationsCount: number;
    readonly accumulatedAmountMxn: string;
    readonly accumulatedAmountUsd: string;
  }>;
  readonly triggeredRelevantReports: ReadonlyArray<{
    readonly reportId: string;
    readonly blindCurp: string;
    readonly operationAmountMxn: string;
    readonly operationAmountUsd: string;
  }>;
}

async function readPldThresholdsFromDb(): Promise<{
  fxRateUsdMxn: Decimal;
  singleMinUsd: Decimal;
  monthlyAccumUsd: Decimal;
  relevantThresholdUsd: Decimal;
}> {
  const res = await db.query<{ param_key: string; param_numeric_value: number | string | null }>(`
    SELECT param_key, param_numeric_value FROM system_financial_parameters
    WHERE param_key IN (
      'PLD_USD_MXN_FIX_RATE', 'PLD_FRACTIONED_SINGLE_MIN_USD',
      'PLD_FRACTIONED_MONTHLY_ACCUM_USD', 'PLD_RELEVANT_OP_THRESHOLD_USD'
    )
  `);
  const map = new Map<string, string>();
  for (const r of res.rows) {
    if (r.param_numeric_value !== null && r.param_numeric_value !== undefined) {
      map.set(r.param_key, String(r.param_numeric_value));
    }
  }
  return {
    fxRateUsdMxn: sanitizeDecimalString(map.get('PLD_USD_MXN_FIX_RATE') ?? '19.850000', '19.850000'),
    singleMinUsd: sanitizeDecimalString(map.get('PLD_FRACTIONED_SINGLE_MIN_USD') ?? '500.00', '500.00'),
    monthlyAccumUsd: sanitizeDecimalString(map.get('PLD_FRACTIONED_MONTHLY_ACCUM_USD') ?? '7500.00', '7500.00'),
    relevantThresholdUsd: sanitizeDecimalString(map.get('PLD_RELEVANT_OP_THRESHOLD_USD') ?? '7500.00', '7500.00'),
  };
}

/**
 * PUNTO DE CONTROL #1: Motor de Detección de Operaciones Fraccionadas ($500 a $7,500 USD en un mes calendario)
 * y Operaciones Relevantes (>= $7,500 USD en una sola exhibición) usando exclusivamente `Decimal.js`.
 */
export async function detectFractionedAndRelevantCashOperations(params: {
  operations: ReadonlyArray<CashOperationCandidateInput>;
  actorEmail: string;
  actorRole: UserRole | 'sistema';
  sourceIp: string;
}): Promise<FractionedCashEvaluationSummary> {
  const thresholds = await readPldThresholdsFromDb();
  const triggeredFractionedReports: Array<{
    reportId: string;
    blindCurp: string;
    calendarMonth: string;
    qualifyingOperationsCount: number;
    accumulatedAmountMxn: string;
    accumulatedAmountUsd: string;
  }> = [];
  const triggeredRelevantReports: Array<{
    reportId: string;
    blindCurp: string;
    operationAmountMxn: string;
    operationAmountUsd: string;
  }> = [];

  const monthlyBuckets = new Map<
    string,
    {
      blindCurp: string;
      calendarMonth: string;
      subjectMaskedName: string;
      subjectCurpMasked: string;
      subjectRfcMasked: string;
      hubCode: string;
      expedienteId: string | null;
      qualifyingOps: Array<{ amountMxn: Decimal; amountUsd: Decimal; dateIso: string }>;
    }
  >();

  const now = new Date();
  const nowIso = now.toISOString();
  const investigationDeadlineIso = addDays(now, 60).toISOString();
  const retentionYear = now.getUTCFullYear() + 10;

  for (const op of params.operations) {
    const amountMxnDec = sanitizeDecimalString(op.amountMxn, '0.00').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const amountUsdDec = amountMxnDec.dividedBy(thresholds.fxRateUsdMxn).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 1. ¿Es Operación Relevante directa en una sola exhibición (>= $7,500 USD)?
    if (amountUsdDec.greaterThanOrEqualTo(thresholds.relevantThresholdUsd)) {
      const reportId = `cnbv_ror_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.execute(
        `INSERT INTO pld_cnbv_reports_and_whistleblowing (
          id, report_category, siti_report_type_code, expediente_id,
          subject_masked_name, subject_curp_masked, subject_rfc_masked, hub_code,
          operation_amount_mxn, operation_amount_usd, applied_fx_rate_usd_mxn,
          tentative_amount_mode, mandatory_col40_prefix,
          col40_operation_description, col41_inusual_reasons,
          is_anonymous_whistleblowing, reporter_role_or_channel,
          detected_at, investigation_deadline_at, ccc_decision,
          sla_clock_status, retention_until_year, created_at
        ) VALUES ($1, 'ROR_RELEVANTE', '1', $2, $3, $4, $5, $6, $7, $8, $9, 'REQUESTED_AMOUNT_BLOCKED', 'NONE', $10, '', 0, 'MOTOR_AUTOMATIZADO_CAP_V_ROR', $11, $12, 'REPORT_TO_UIF', 'ON_TIME', $13, $14)`,
        [
          reportId, op.expedienteId ?? null, op.subjectMaskedName, op.subjectCurpMasked,
          op.subjectRfcMasked ?? 'XXXX000000XXX', op.hubCode ?? 'HUB-CUU',
          amountMxnDec.toFixed(2), amountUsdDec.toFixed(2), thresholds.fxRateUsdMxn.toFixed(6),
          `OPERACION RELEVANTE EN EFECTIVO EN UNA SOLA EXHIBICION POR ${amountMxnDec.toFixed(2)} MXN EQUIVALENTES A ${amountUsdDec.toFixed(2)} USD (TC FIX ${thresholds.fxRateUsdMxn.toFixed(4)}), IGUAL O SUPERIOR AL UMBRAL DE ${thresholds.relevantThresholdUsd.toFixed(2)} USD DEL CAPITULO V DCG ART 115.`,
          nowIso, investigationDeadlineIso, retentionYear, nowIso,
        ]
      );

      triggeredRelevantReports.push({
        reportId,
        blindCurp: op.blindCurp,
        operationAmountMxn: amountMxnDec.toFixed(2),
        operationAmountUsd: amountUsdDec.toFixed(2),
      });
    }

    // 2. ¿Califica como operación individual para Operativa Fraccionada (>= $500 USD)?
    if (amountUsdDec.greaterThanOrEqualTo(thresholds.singleMinUsd)) {
      const calendarMonth = String(op.operationDateIso || nowIso).slice(0, 7);
      const bucketKey = `${op.blindCurp}::${calendarMonth}`;
      const existing = monthlyBuckets.get(bucketKey);
      if (existing) {
        existing.qualifyingOps.push({ amountMxn: amountMxnDec, amountUsd: amountUsdDec, dateIso: op.operationDateIso });
      } else {
        monthlyBuckets.set(bucketKey, {
          blindCurp: op.blindCurp,
          calendarMonth,
          subjectMaskedName: op.subjectMaskedName,
          subjectCurpMasked: op.subjectCurpMasked,
          subjectRfcMasked: op.subjectRfcMasked ?? 'XXXX000000XXX',
          hubCode: op.hubCode ?? 'HUB-CUU',
          expedienteId: op.expedienteId ?? null,
          qualifyingOps: [{ amountMxn: amountMxnDec, amountUsd: amountUsdDec, dateIso: op.operationDateIso }],
        });
      }
    }
  }

  for (const bucket of monthlyBuckets.values()) {
    if (bucket.qualifyingOps.length < 2) continue;

    let sumMxn = new Decimal('0.00');
    let sumUsd = new Decimal('0.00');
    for (const item of bucket.qualifyingOps) {
      sumMxn = sumMxn.plus(item.amountMxn);
      sumUsd = sumUsd.plus(item.amountUsd);
    }
    const totalMxnFormatted = sumMxn.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    const totalUsdFormatted = sumUsd.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

    if (sumUsd.greaterThanOrEqualTo(thresholds.monthlyAccumUsd)) {
      const reportId = `cnbv_frac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const col40Desc = `OPERATIVA ACUMULADA EN EFECTIVO DURANTE EL MES CALENDARIO ${bucket.calendarMonth} MEDIANTE ${bucket.qualifyingOps.length} EXHIBICIONES INDIVIDUALES IGUALES O SUPERIORES A ${thresholds.singleMinUsd.toFixed(2)} USD QUE ACUMULAN ${totalMxnFormatted} MXN (${totalUsdFormatted} USD A TC FIX ${thresholds.fxRateUsdMxn.toFixed(4)}), SUPERANDO EL UMBRAL DE ${thresholds.monthlyAccumUsd.toFixed(2)} USD DE LA FRACCION IV DEL CAPITULO VI DCG ART 115.`;
      const col41Reasons = `ALERTA AUTOMATIZADA POR FRACCIONAMIENTO DE EFECTIVO EN VENTANILLA DENTRO DE UN MISMO MES CALENDARIO QUE ROMPE EL PERFIL TRANSACCIONAL ORDINARIO DE DESCUENTO VIA NOMINA.`;

      await db.execute(
        `INSERT INTO pld_cnbv_reports_and_whistleblowing (
          id, report_category, siti_report_type_code, expediente_id,
          subject_masked_name, subject_curp_masked, subject_rfc_masked, hub_code,
          operation_amount_mxn, operation_amount_usd, applied_fx_rate_usd_mxn,
          tentative_amount_mode, mandatory_col40_prefix,
          col40_operation_description, col41_inusual_reasons,
          is_anonymous_whistleblowing, reporter_role_or_channel,
          detected_at, investigation_deadline_at, ccc_decision,
          sla_clock_status, retention_until_year, created_at
        ) VALUES ($1, 'ROI_OPERATIVA_FRACCIONADA', '2', $2, $3, $4, $5, $6, $7, $8, $9, 'REQUESTED_AMOUNT_BLOCKED', 'NONE', $10, $11, 0, 'MOTOR_AUTOMATIZADO_FRACCION_IV', $12, $13, 'PENDING_CCC', 'ON_TIME', $14, $15)`,
        [
          reportId, bucket.expedienteId, bucket.subjectMaskedName, bucket.subjectCurpMasked,
          bucket.subjectRfcMasked, bucket.hubCode, totalMxnFormatted, totalUsdFormatted,
          thresholds.fxRateUsdMxn.toFixed(6), col40Desc, col41Reasons,
          nowIso, investigationDeadlineIso, retentionYear, nowIso,
        ]
      );

      triggeredFractionedReports.push({
        reportId,
        blindCurp: bucket.blindCurp,
        calendarMonth: bucket.calendarMonth,
        qualifyingOperationsCount: bucket.qualifyingOps.length,
        accumulatedAmountMxn: totalMxnFormatted,
        accumulatedAmountUsd: totalUsdFormatted,
      });
    }
  }

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'PLD_HIT_DETECTED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvAssistedComplianceService',
    details: `Evaluación PLD Efectivo: ${params.operations.length} ops analizadas | ${triggeredFractionedReports.length} Fraccionadas ($500-$7,500 USD) | ${triggeredRelevantReports.length} Relevantes`,
  });

  return {
    evaluatedOperationsCount: params.operations.length,
    fxRateUsdMxn: thresholds.fxRateUsdMxn.toFixed(6),
    singleMinUsd: thresholds.singleMinUsd.toFixed(2),
    monthlyAccumThresholdUsd: thresholds.monthlyAccumUsd.toFixed(2),
    relevantThresholdUsd: thresholds.relevantThresholdUsd.toFixed(2),
    triggeredFractionedReports,
    triggeredRelevantReports,
  };
}

/**
 * PUNTO DE CONTROL #2 (Parte A): Buzón Confidencial de Denuncia Interna (ROIP — Tipo SITI '3')
 */
export async function submitInternalWhistleblowingReport(params: {
  subjectMaskedName: string;
  hubCode?: string;
  col40OperationDescription: string;
  col41InusualReasons: string;
  isAnonymous: boolean;
  actorEmail: string;
  actorRole: UserRole | 'sistema';
  sourceIp: string;
}): Promise<{ reportId: string; investigationDeadlineAt: string; sitiReportTypeCode: '3' }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const investigationDeadlineAt = addDays(now, 60).toISOString();
  const reportId = `cnbv_roip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const retentionYear = now.getUTCFullYear() + 10;

  await db.execute(
    `INSERT INTO pld_cnbv_reports_and_whistleblowing (
      id, report_category, siti_report_type_code, expediente_id,
      subject_masked_name, subject_curp_masked, subject_rfc_masked, hub_code,
      operation_amount_mxn, operation_amount_usd, applied_fx_rate_usd_mxn,
      tentative_amount_mode, mandatory_col40_prefix,
      col40_operation_description, col41_inusual_reasons,
      is_anonymous_whistleblowing, reporter_role_or_channel,
      detected_at, investigation_deadline_at, ccc_decision,
      sla_clock_status, retention_until_year, created_at
    ) VALUES ($1, 'ROIP_INTERNA_PREOCUPANTE', '3', NULL, $2, 'XXXX0000********00', 'XXXX000000XXX', $3, 0.00, 0.00, 19.850000, 'ZERO_EOPERATIVO', 'NONE', $4, $5, $6, 'BUZON_DENUNCIA_INTERNA_CONFIDENCIAL', $7, $8, 'PENDING_CCC', 'ON_TIME', $9, $10)`,
    [
      reportId,
      params.subjectMaskedName.trim() || 'COLABORADOR INTERNO EN INVESTIGACION',
      params.hubCode ?? 'HUB-CUU',
      params.col40OperationDescription.trim(),
      params.col41InusualReasons.trim(),
      params.isAnonymous ? 1 : 0,
      nowIso,
      investigationDeadlineAt,
      retentionYear,
      nowIso,
    ]
  );

  await auditEventStore.append({
    actorEmail: params.isAnonymous ? 'anonimo@buzon-pld.cruse.mx' : params.actorEmail,
    actorRole: params.actorRole,
    action: 'PLD_HIT_DETECTED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvAssistedComplianceService',
    details: `Buzón ROIP (Tipo SITI '3'): Denuncia interna registrada (${reportId}) | Plazo investigación 60 días naturales: ${investigationDeadlineAt.slice(0, 10)}`,
  });

  return { reportId, investigationDeadlineAt, sitiReportTypeCode: '3' };
}

/**
 * PUNTO DE CONTROL #2 (Parte B): Sesión del Comité de Comunicación y Control (CCC)
 */
export async function recordCccSessionDecision(params: {
  reportId: string;
  cccDecision: 'REPORT_TO_UIF' | 'DISMISSED_WITH_JUSTIFICATION';
  cccJustificationNotes: string;
  cccSessionDateIso?: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  reportId: string;
  cccDecision: string;
  cccSessionAt: string;
  uifTransmissionDeadlineAt: string | null;
}> {
  const sessionDate = params.cccSessionDateIso ? new Date(params.cccSessionDateIso) : new Date();
  const cccSessionAtIso = sessionDate.toISOString();
  const uifDeadlineIso =
    params.cccDecision === 'REPORT_TO_UIF' ? addCnbvBusinessDays(sessionDate, 3).toISOString() : null;
  const newSlaStatus =
    params.cccDecision === 'DISMISSED_WITH_JUSTIFICATION' ? 'ARCHIVED_NO_REPORT' : 'WARNING_10_DAYS';

  await db.execute(
    `UPDATE pld_cnbv_reports_and_whistleblowing
     SET ccc_session_at = $1, ccc_decision = $2, ccc_justification_notes = $3,
         uif_transmission_deadline_at = $4, sla_clock_status = $5
     WHERE id = $6`,
    [cccSessionAtIso, params.cccDecision, params.cccJustificationNotes.trim(), uifDeadlineIso, newSlaStatus, params.reportId]
  );

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'PLD_ALERT_RESOLVED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvAssistedComplianceService',
    details: `Sesión CCC sobre reporte ${params.reportId}: ${params.cccDecision} | Límite 3 días hábiles UIF: ${uifDeadlineIso ? uifDeadlineIso.slice(0, 10) : 'N/A'}`,
  });

  return {
    reportId: params.reportId,
    cccDecision: params.cccDecision,
    cccSessionAt: cccSessionAtIso,
    uifTransmissionDeadlineAt: uifDeadlineIso,
  };
}

// ============================================================================
// PUNTO DE CONTROL #4: TRAZABILIDAD DE CARGA SEMIAUTOMÁTICA CIB (3 PASOS)
// ============================================================================

interface CibExportBatchDbRow {
  id: string;
  batch_code: string;
  total_expedientes_included: number | string;
  excluded_low_confidence_or_pld_count: number | string;
  total_principal_mxn: number | string;
  total_fortnightly_quota_mxn: number | string;
  file_sha256_hash: string;
  workflow_status: string;
  generated_by_email: string;
  reviewed_by_oc_email: string | null;
  reviewed_by_oc_at: string | null;
  oc_review_notes: string | null;
  cib_confirmation_folio: string | null;
  uploaded_to_cib_at: string | null;
  created_at: string;
}

export async function listCibExportBatches(): Promise<ReadonlyArray<CibExportBatchItem>> {
  const res = await db.query<CibExportBatchDbRow>(`SELECT * FROM cib_export_batches ORDER BY created_at DESC, id DESC`);
  return res.rows.map((r: CibExportBatchDbRow) => ({
    id: r.id,
    batchCode: r.batch_code,
    totalExpedientesIncluded: sanitizeDecimalString(String(r.total_expedientes_included), '0').toNumber(),
    excludedLowConfidenceOrPldCount: sanitizeDecimalString(String(r.excluded_low_confidence_or_pld_count), '0').toNumber(),
    totalPrincipalMxn: sanitizeDecimalString(String(r.total_principal_mxn), '0.00').toFixed(2),
    totalFortnightlyQuotaMxn: sanitizeDecimalString(String(r.total_fortnightly_quota_mxn), '0.00').toFixed(2),
    fileSha256Hash: r.file_sha256_hash,
    workflowStatus: r.workflow_status as CibBatchWorkflowStatus,
    generatedByEmail: r.generated_by_email,
    reviewedByOcEmail: r.reviewed_by_oc_email,
    reviewedByOcAt: r.reviewed_by_oc_at,
    ocReviewNotes: r.oc_review_notes,
    cibConfirmationFolio: r.cib_confirmation_folio,
    uploadedToCibAt: r.uploaded_to_cib_at,
    createdAt: r.created_at,
  }));
}

/**
 * PASO 1 CIB: Genera un lote pre-validado (`GENERATED_PENDING_OC`) filtrando expedientes con OCR < 80%
 * o pendientes/rechazados por Dirección en Lista Gris, sumando montos con `Decimal.js`.
 */
export async function createValidatedCibExportBatch(params: {
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{ batch: CibExportBatchItem; csvLayoutContent: string }> {
  const rowsRes = await db.query<{
    id: string;
    convenio: string | null;
    full_name: string;
    curp_masked: string;
    requested_amount: number | string;
    term_fortnights: number | string;
    status: string;
    created_at: string;
    fortnightly_payment: number | string | null;
    ocr_confidence_score: number | string | null;
    ocr_status: string | null;
    direction_auth_status: string | null;
  }>(`
    SELECT e.id, e.convenio, e.full_name, e.curp_masked, e.requested_amount, e.term_fortnights,
           e.status, e.created_at, l.fortnightly_payment, p.ocr_confidence_score, p.ocr_status, p.direction_auth_status
    FROM expedientes e
    LEFT JOIN loan_accounts l ON e.id = l.expediente_id
    LEFT JOIN expediente_compliance_profiles p ON e.id = p.expediente_id
    ORDER BY e.created_at DESC
  `);

  let totalPrincipalDec = new Decimal('0.00');
  let totalQuotaDec = new Decimal('0.00');
  let excludedCount = 0;
  const includedCsvLines: string[] = [];

  for (const r of rowsRes.rows) {
    const scoreDec = sanitizeDecimalString(String(r.ocr_confidence_score ?? '95.00'), '95.00');
    const isLowConfidenceUnresolved =
      scoreDec.lessThan(new Decimal('80.00')) && r.ocr_status !== 'MANUAL_CORRECTED';
    const isBlockedByPldOrDirection =
      r.status === 'pld_blocked' ||
      r.status === 'rechazado_pld' ||
      r.status === 'rechazado' ||
      r.direction_auth_status === 'PENDING_DIRECTION' ||
      r.direction_auth_status === 'REJECTED_GENERATE_INUSUAL';

    if (isLowConfidenceUnresolved || isBlockedByPldOrDirection) {
      excludedCount += 1;
      continue;
    }

    const reqAmtDec = sanitizeDecimalString(String(r.requested_amount), '0.00').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const quotaDec = sanitizeDecimalString(String(r.fortnightly_payment ?? '0.00'), '0.00').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    totalPrincipalDec = totalPrincipalDec.plus(reqAmtDec);
    totalQuotaDec = totalQuotaDec.plus(quotaDec);

    includedCsvLines.push(
      `${r.convenio || 'STSGECH'},${r.curp_masked},"${r.full_name}",${reqAmtDec.toFixed(2)},${r.term_fortnights},${quotaDec.toFixed(2)},${String(r.created_at).slice(0, 10)}`
    );
  }

  const csvHeader = 'CONVENIO,ID_EMPLEADO_CURP,NOMBRE,IMPORTE_PRESTAMO,PLAZO_QUINCENAS,CUOTA_QUINCENAL,FECHA_REGISTRO\r\n';
  const csvLayoutContent = `${csvHeader}${includedCsvLines.join('\r\n')}\r\n`;
  const fileSha256Hash = crypto.createHash('sha256').update(csvLayoutContent, 'utf8').digest('hex');

  const nowIso = new Date().toISOString();
  const batchId = `cib_batch_${Date.now()}`;
  const batchCode = `LOTE-CIB-${nowIso.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await db.execute(
    `INSERT INTO cib_export_batches (
      id, batch_code, total_expedientes_included, excluded_low_confidence_or_pld_count,
      total_principal_mxn, total_fortnightly_quota_mxn, file_sha256_hash,
      workflow_status, generated_by_email, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'GENERATED_PENDING_OC', $8, $9)`,
    [batchId, batchCode, includedCsvLines.length, excludedCount, totalPrincipalDec.toFixed(2), totalQuotaDec.toFixed(2), fileSha256Hash, params.actorEmail, nowIso]
  );

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'LAYOUT_SIF_GENERATE',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvAssistedComplianceService',
    details: `Lote CIB generado (${batchCode}): ${includedCsvLines.length} expedientes incluidos, ${excludedCount} excluidos por OCR/PLD | SHA-256: ${fileSha256Hash}`,
  });

  const batch: CibExportBatchItem = {
    id: batchId,
    batchCode,
    totalExpedientesIncluded: includedCsvLines.length,
    excludedLowConfidenceOrPldCount: excludedCount,
    totalPrincipalMxn: totalPrincipalDec.toFixed(2),
    totalFortnightlyQuotaMxn: totalQuotaDec.toFixed(2),
    fileSha256Hash,
    workflowStatus: 'GENERATED_PENDING_OC',
    generatedByEmail: params.actorEmail,
    reviewedByOcEmail: null,
    reviewedByOcAt: null,
    ocReviewNotes: null,
    cibConfirmationFolio: null,
    uploadedToCibAt: null,
    createdAt: nowIso,
  };

  return { batch, csvLayoutContent };
}

/**
 * PASO 2 CIB: Revisión y aprobación formal del Oficial de Cumplimiento (`APPROVED_BY_OC`),
 * sellando en `audit_events` WORM la acción inmutable `CIB_BATCH_VALIDATED`.
 */
export async function approveCibBatchByComplianceOfficer(params: {
  batchId: string;
  ocReviewNotes: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<CibExportBatchItem> {
  const nowIso = new Date().toISOString();
  await db.execute(
    `UPDATE cib_export_batches
     SET workflow_status = 'APPROVED_BY_OC', reviewed_by_oc_email = $1, reviewed_by_oc_at = $2, oc_review_notes = $3
     WHERE id = $4`,
    [params.actorEmail, nowIso, params.ocReviewNotes.trim(), params.batchId]
  );

  const batches = await listCibExportBatches();
  const updated = batches.find((b) => b.id === params.batchId);
  if (!updated) throw new Error(`No se encontró el lote CIB ${params.batchId}.`);

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'CIB_BATCH_VALIDATED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvAssistedComplianceService',
    expedienteId: updated.id,
    details: `Oficial de Cumplimiento validó Lote CIB ${updated.batchCode} (APPROVED_BY_OC) | Hash SHA-256: ${updated.fileSha256Hash} | Notas: ${params.ocReviewNotes.trim()}`,
  });

  return updated;
}

/**
 * PASO 3 CIB: Confirmación de carga en CIB / Logic Systems (`UPLOADED_TO_CIB`) con acuse/folio institucional.
 */
export async function confirmCibBatchUploadToLogicSystems(params: {
  batchId: string;
  cibConfirmationFolio: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<CibExportBatchItem> {
  const nowIso = new Date().toISOString();
  await db.execute(
    `UPDATE cib_export_batches
     SET workflow_status = 'UPLOADED_TO_CIB', cib_confirmation_folio = $1, uploaded_to_cib_at = $2
     WHERE id = $3`,
    [params.cibConfirmationFolio.trim(), nowIso, params.batchId]
  );

  const batches = await listCibExportBatches();
  const updated = batches.find((b) => b.id === params.batchId);
  if (!updated) throw new Error(`No se encontró el lote CIB ${params.batchId}.`);

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'CIB_BATCH_VALIDATED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvAssistedComplianceService',
    expedienteId: updated.id,
    details: `Carga manual/semiautomática confirmada en CIB Logic Systems para lote ${updated.batchCode} (UPLOADED_TO_CIB) | Folio CIB: ${params.cibConfirmationFolio.trim()}`,
  });

  return updated;
}
