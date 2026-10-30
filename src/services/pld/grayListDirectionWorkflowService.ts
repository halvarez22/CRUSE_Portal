/**
 * SERVICIO DE FLUJO DE EXCEPCIÓN DOCUMENTAL, RAMA DE "LISTA GRIS" (¿AUTORIZA DIRECCIÓN?)
 * Y GENERACIÓN AUTOMÁTICA DE REPORTE INUSUAL TENTATIVO / 24 HORAS (SITI TIPO '2')
 *
 * @implements CRUSE-APO-2026-042 (Fase 2.3 — Puntos de Control #1, #2 y #3)
 * @implements Regla 6 SQA: Uso exclusivo de Decimal.js (Cero Number() ni parseFloat() en cálculos)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { addDays, addHours } from 'date-fns';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import {
  CnbvReportAndWhistleblowingItem,
  CnbvRiskGrade,
  DirectionAuthorizationState,
  ExpedienteComplianceProfileItem,
  OccupationRiskCategory,
  OcrValidationStatus,
  TentativeAmountReportingMode,
  UserRole,
} from '../../types';

interface ComplianceProfileDbRow {
  expediente_id: string;
  document_image_sha256: string | null;
  ocr_confidence_score: string | number;
  ocr_status: OcrValidationStatus;
  occupation_category: OccupationRiskCategory;
  occupation_label: string;
  fortnightly_net_income_mxn: string | number;
  initial_transactional_profile_mxn: string | number;
  risk_matrix_score: string | number;
  initial_risk_grade: CnbvRiskGrade;
  current_risk_grade: CnbvRiskGrade;
  direction_auth_status: DirectionAuthorizationState;
  direction_authorized_by: string | null;
  direction_auth_notes: string | null;
  direction_auth_at: string | null;
  last_semester_review_at: string;
  next_semester_review_at: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertComplianceProfileInput {
  readonly expedienteId: string;
  readonly documentImageSha256: string | null;
  readonly ocrConfidenceScore: string;
  readonly ocrStatus: OcrValidationStatus;
  readonly occupationCategory: OccupationRiskCategory;
  readonly occupationLabel: string;
  readonly fortnightlyNetIncomeMxn: string;
  readonly initialTransactionalProfileMxn: string;
  readonly riskMatrixScore: string;
  readonly initialRiskGrade: CnbvRiskGrade;
  readonly requiresDirectionAuthorization: boolean;
  readonly semesterReviewDays?: number;
}

/**
 * Registra o actualiza de forma idempotente el perfil de cumplimiento y matriz de riesgo de un expediente
 * usando exclusivamente Decimal.js para formatear los montos y puntajes.
 */
export async function upsertExpedienteComplianceProfile(
  input: UpsertComplianceProfileInput
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextReviewIso = addDays(now, input.semesterReviewDays ?? 180).toISOString();

  const ocrConfFixed = sanitizeDecimalString(input.ocrConfidenceScore, '95.00')
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  const netIncFixed = sanitizeDecimalString(input.fortnightlyNetIncomeMxn, '12500.00')
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  const initProfFixed = sanitizeDecimalString(input.initialTransactionalProfileMxn, '3500.00')
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  const matrixScoreFixed = sanitizeDecimalString(input.riskMatrixScore, '18.00')
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);

  const directionAuthStatus: DirectionAuthorizationState = input.requiresDirectionAuthorization
    ? 'PENDING_DIRECTION'
    : 'NOT_REQUIRED';

  await db.execute(
    `INSERT INTO expediente_compliance_profiles (
       expediente_id, document_image_sha256, ocr_confidence_score, ocr_status,
       occupation_category, occupation_label, fortnightly_net_income_mxn,
       initial_transactional_profile_mxn, risk_matrix_score,
       initial_risk_grade, current_risk_grade, direction_auth_status,
       last_semester_review_at, next_semester_review_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (expediente_id) DO UPDATE SET
       document_image_sha256 = COALESCE(EXCLUDED.document_image_sha256, expediente_compliance_profiles.document_image_sha256),
       ocr_confidence_score = EXCLUDED.ocr_confidence_score,
       ocr_status = EXCLUDED.ocr_status,
       occupation_category = EXCLUDED.occupation_category,
       occupation_label = EXCLUDED.occupation_label,
       fortnightly_net_income_mxn = EXCLUDED.fortnightly_net_income_mxn,
       initial_transactional_profile_mxn = EXCLUDED.initial_transactional_profile_mxn,
       risk_matrix_score = EXCLUDED.risk_matrix_score,
       initial_risk_grade = EXCLUDED.initial_risk_grade,
       current_risk_grade = EXCLUDED.current_risk_grade,
       direction_auth_status = EXCLUDED.direction_auth_status,
       updated_at = EXCLUDED.updated_at`,
    [
      input.expedienteId,
      input.documentImageSha256,
      ocrConfFixed,
      input.ocrStatus,
      input.occupationCategory,
      input.occupationLabel,
      netIncFixed,
      initProfFixed,
      matrixScoreFixed,
      input.initialRiskGrade,
      input.initialRiskGrade,
      directionAuthStatus,
      nowIso,
      nextReviewIso,
      nowIso,
      nowIso,
    ]
  );
}

/**
 * Obtiene los perfiles de cumplimiento (con foco en Lista Gris ¿Autoriza Dirección? y Cola de Excepción OCR)
 * así como los reportes tentativos generados.
 */
export async function listGrayListAndExceptionWorkflowData(): Promise<{
  profiles: ExpedienteComplianceProfileItem[];
  tentativeAndRegulatoryReports: CnbvReportAndWhistleblowingItem[];
}> {
  const nowMs = Date.now();
  const profilesRes = await db.query<ComplianceProfileDbRow>(
    `SELECT
       expediente_id, document_image_sha256, ocr_confidence_score, ocr_status,
       occupation_category, occupation_label, fortnightly_net_income_mxn,
       initial_transactional_profile_mxn, risk_matrix_score,
       initial_risk_grade, current_risk_grade, direction_auth_status,
       direction_authorized_by, direction_auth_notes, direction_auth_at,
       last_semester_review_at, next_semester_review_at, created_at, updated_at
     FROM expediente_compliance_profiles
     ORDER BY
       CASE WHEN direction_auth_status = 'PENDING_DIRECTION' THEN 0
            WHEN ocr_status IN ('LOW_CONFIDENCE_EXCEPTION', 'DUPLICATE_DETECTED') THEN 1
            ELSE 2 END ASC,
       updated_at DESC
     LIMIT 100`
  );

  const profiles: ExpedienteComplianceProfileItem[] = profilesRes.rows.map((r) => {
    const nextRevDate = new Date(r.next_semester_review_at).getTime();
    return {
      expedienteId: r.expediente_id,
      documentImageSha256: r.document_image_sha256,
      ocrConfidenceScore: sanitizeDecimalString(String(r.ocr_confidence_score), '0.00').toFixed(2),
      ocrStatus: r.ocr_status,
      occupationCategory: r.occupation_category,
      occupationLabel: r.occupation_label,
      fortnightlyNetIncomeMxn: sanitizeDecimalString(String(r.fortnightly_net_income_mxn), '0.00').toFixed(2),
      initialTransactionalProfileMxn: sanitizeDecimalString(String(r.initial_transactional_profile_mxn), '0.00').toFixed(2),
      riskMatrixScore: sanitizeDecimalString(String(r.risk_matrix_score), '0.00').toFixed(2),
      initialRiskGrade: r.initial_risk_grade,
      currentRiskGrade: r.current_risk_grade,
      directionAuthStatus: r.direction_auth_status,
      directionAuthorizedBy: r.direction_authorized_by,
      directionAuthNotes: r.direction_auth_notes,
      directionAuthAt: r.direction_auth_at ? String(r.direction_auth_at) : null,
      lastSemesterReviewAt: String(r.last_semester_review_at),
      nextSemesterReviewAt: String(r.next_semester_review_at),
      isSemesterReviewDue: nextRevDate <= nowMs,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });

  const repRes = await db.query<{
    id: string;
    report_category: CnbvReportAndWhistleblowingItem['reportCategory'];
    siti_report_type_code: '1' | '2' | '3';
    expediente_id: string | null;
    subject_masked_name: string;
    subject_curp_masked: string;
    subject_rfc_masked: string;
    hub_code: string;
    operation_amount_mxn: string | number;
    operation_amount_usd: string | number;
    applied_fx_rate_usd_mxn: string | number;
    tentative_amount_mode: TentativeAmountReportingMode;
    mandatory_col40_prefix: 'NONE' | 'Reporte de 24 Horas' | 'Lista de Personas Bloqueadas';
    col40_operation_description: string;
    col41_inusual_reasons: string;
    is_anonymous_whistleblowing: number;
    reporter_role_or_channel: string;
    detected_at: string;
    investigation_deadline_at: string;
    ccc_session_at: string | null;
    ccc_decision: CnbvReportAndWhistleblowingItem['cccDecision'];
    ccc_justification_notes: string | null;
    uif_transmission_deadline_at: string | null;
    sla_clock_status: CnbvReportAndWhistleblowingItem['slaClockStatus'];
    retention_until_year: number;
    created_at: string;
  }>(
    `SELECT * FROM pld_cnbv_reports_and_whistleblowing ORDER BY created_at DESC, id DESC LIMIT 100`
  );

  const tentativeAndRegulatoryReports: CnbvReportAndWhistleblowingItem[] = repRes.rows.map((row) => {
    const deadlineMs = new Date(row.investigation_deadline_at).getTime();
    const diffDays = Math.max(0, Math.ceil((deadlineMs - nowMs) / (1000 * 60 * 60 * 24)));
    return {
      id: row.id,
      reportCategory: row.report_category,
      sitiReportTypeCode: row.siti_report_type_code,
      expedienteId: row.expediente_id,
      subjectMaskedName: row.subject_masked_name,
      subjectCurpMasked: row.subject_curp_masked,
      subjectRfcMasked: row.subject_rfc_masked,
      hubCode: row.hub_code,
      operationAmountMxn: sanitizeDecimalString(String(row.operation_amount_mxn), '0.00').toFixed(2),
      operationAmountUsd: sanitizeDecimalString(String(row.operation_amount_usd), '0.00').toFixed(2),
      appliedFxRateUsdMxn: sanitizeDecimalString(String(row.applied_fx_rate_usd_mxn), '19.850000').toFixed(6),
      tentativeAmountMode: row.tentative_amount_mode,
      mandatoryCol40Prefix: row.mandatory_col40_prefix,
      col40OperationDescription: row.col40_operation_description,
      col41InusualReasons: row.col41_inusual_reasons,
      isAnonymousWhistleblowing: row.is_anonymous_whistleblowing === 1,
      reporterRoleOrChannel: row.reporter_role_or_channel,
      detectedAt: String(row.detected_at),
      investigationDeadlineAt: String(row.investigation_deadline_at),
      cccSessionAt: row.ccc_session_at ? String(row.ccc_session_at) : null,
      cccDecision: row.ccc_decision,
      cccJustificationNotes: row.ccc_justification_notes,
      uifTransmissionDeadlineAt: row.uif_transmission_deadline_at ? String(row.uif_transmission_deadline_at) : null,
      slaClockStatus: row.sla_clock_status,
      remainingCalendarDaysForCcc: diffDays,
      retentionUntilYear: row.retention_until_year,
      createdAt: String(row.created_at),
    };
  });

  return { profiles, tentativeAndRegulatoryReports };
}

export interface ProcessDirectionGrayListDecisionInput {
  readonly expedienteId: string;
  readonly decision: 'AUTHORIZED_CONTINUE' | 'REJECTED_GENERATE_INUSUAL';
  readonly tentativeAmountMode?: TentativeAmountReportingMode;
  readonly justificationNotes: string;
  readonly actorEmail: string;
  readonly actorRole: UserRole;
  readonly sourceIp: string;
}

/**
 * Punto de Control #2 y #3 (Diagrama Lic. Gerardo — ¿Autoriza Dirección?):
 * - Si AUTHORIZED_CONTINUE: libera el expediente con Debida Diligencia Reforzada (CLEARED_EDD) y Grado ALTO.
 * - Si REJECTED_GENERATE_INUSUAL: bloquea el expediente y genera atómicamente el registro SITI Tipo '2'
 *   en pld_cnbv_reports_and_whistleblowing con Columna 11 en '0.00' (o monto bloqueado) y Columna 40
 *   iniciando obligatoriamente con "Lista de Personas Bloqueadas. ".
 */
export async function processDirectionGrayListDecision(
  input: ProcessDirectionGrayListDecisionInput
): Promise<{
  expedienteId: string;
  directionAuthStatus: DirectionAuthorizationState;
  generatedReportId: string | null;
  col11AmountFormatted: string | null;
  col40DescriptionFormatted: string | null;
}> {
  const cleanNotes = input.justificationNotes.trim();
  if (cleanNotes.length < 10) {
    throw new Error(
      'La resolución de Dirección para Lista Gris requiere justificación mínima de 10 caracteres.'
    );
  }

  return db.transaction(async (tx) => {
    const expRes = await tx.query<{
      id: string;
      full_name: string;
      curp_masked: string;
      rfc_masked: string | null;
      requested_amount: string | number;
      convenio: string | null;
    }>(
      `SELECT id, full_name, curp_masked, rfc_masked, requested_amount, convenio
       FROM expedientes WHERE id = $1`,
      [input.expedienteId]
    );

    const exp = expRes.rows[0];
    if (!exp) {
      throw new Error(`Expediente ${input.expedienteId} no encontrado para dictamen de Dirección.`);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    await tx.execute(
      `UPDATE expediente_compliance_profiles
       SET direction_auth_status = $1,
           current_risk_grade = 'ALTO',
           direction_authorized_by = $2,
           direction_auth_notes = $3,
           direction_auth_at = $4,
           updated_at = $5
       WHERE expediente_id = $6`,
      [
        input.decision,
        input.actorEmail,
        cleanNotes,
        nowIso,
        nowIso,
        input.expedienteId,
      ]
    );

    if (input.decision === 'AUTHORIZED_CONTINUE') {
      await tx.execute(
        `UPDATE expedientes SET status = 'aprobado', updated_at = $1 WHERE id = $2`,
        [nowIso, input.expedienteId]
      );

      await auditEventStore.appendInTx(tx, {
        action: 'PLD_ALERT_RESOLVED',
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        outcome: 'success',
        sourceIp: input.sourceIp,
        sourceSummary: 'grayListDirectionWorkflowService',
        curpMasked: exp.curp_masked,
        expedienteId: exp.id,
        details: `Dirección AUTORIZÓ continuar operación en Lista Gris (CLEARED_EDD / Riesgo ALTO). Sustento: ${cleanNotes}`,
      });

      return {
        expedienteId: exp.id,
        directionAuthStatus: 'AUTHORIZED_CONTINUE',
        generatedReportId: null,
        col11AmountFormatted: null,
        col40DescriptionFormatted: null,
      };
    }

    // RAMA NO AUTORIZA DIRECCIÓN -> Bloqueo de expediente y generación de Reporte Inusual Tentativo / 24 Horas (Tipo '2')
    const rejectedStatus = tx.isPostgres ? 'rechazado_pld' : 'rechazado';
    await tx.execute(
      `UPDATE expedientes SET status = $1, updated_at = $2 WHERE id = $3`,
      [rejectedStatus, nowIso, input.expedienteId]
    );

    // Leer tipo de cambio FIX desde system_financial_parameters usando Decimal.js
    const fxRes = await tx.query<{ param_numeric_value: string | number | null }>(
      `SELECT param_numeric_value FROM system_financial_parameters WHERE param_key = 'PLD_USD_MXN_FIX_RATE'`
    );
    const fxRateDec = sanitizeDecimalString(
      fxRes.rows[0]?.param_numeric_value !== null && fxRes.rows[0]?.param_numeric_value !== undefined
        ? String(fxRes.rows[0].param_numeric_value)
        : '19.850000',
      '19.850000'
    );

    const requestedAmountDec = sanitizeDecimalString(String(exp.requested_amount), '0.00').toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP
    );

    const amountMode: TentativeAmountReportingMode =
      input.tentativeAmountMode ?? 'ZERO_EOPERATIVO';

    const col11AmountDec =
      amountMode === 'ZERO_EOPERATIVO' ? new Decimal('0.00') : requestedAmountDec;

    const col11AmountUsdDec = col11AmountDec
      .dividedBy(fxRateDec)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // Punto de Control #3: Columna 40 debe iniciar obligatoriamente con "Lista de Personas Bloqueadas. "
    const mandatoryPrefix = 'Lista de Personas Bloqueadas';
    const sanitizedNotesUpper = cleanNotes
      .toUpperCase()
      .replace(/[;|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const col40Description = `${mandatoryPrefix}. TENTATIVA DE CREDITO RECHAZADA POR DIRECCION EN REVISION DE LISTA GRIS. IMPORTE SOLICITADO NO DESEMBOLSADO: ${requestedAmountDec.toFixed(2)} MXN. SUSTENTO: ${sanitizedNotesUpper}`;
    const col41Reasons = `PROSPECTO DETECTADO EN CRUCE DE LISTAS PLD/FT DURANTE ORIGINACION (${exp.curp_masked}). DIRECCION DICTAMINO NO AUTORIZAR LA RELACION COMERCIAL CONFORME AL DIAGRAMA DE CUMPLIMIENTO CNBV.`;

    const reportId = `cnbv_rep_tent_${crypto.randomBytes(6).toString('hex')}`;
    const deadline60dIso = addDays(now, 60).toISOString();
    const deadline24hIso = addHours(now, 24).toISOString();
    const retentionUntilYear = now.getUTCFullYear() + 10;

    await tx.execute(
      `INSERT INTO pld_cnbv_reports_and_whistleblowing (
         id, report_category, siti_report_type_code, expediente_id,
         subject_masked_name, subject_curp_masked, subject_rfc_masked, hub_code,
         operation_amount_mxn, operation_amount_usd, applied_fx_rate_usd_mxn,
         tentative_amount_mode, mandatory_col40_prefix,
         col40_operation_description, col41_inusual_reasons,
         is_anonymous_whistleblowing, reporter_role_or_channel,
         detected_at, investigation_deadline_at, ccc_session_at,
         ccc_decision, ccc_justification_notes, uif_transmission_deadline_at,
         sla_clock_status, retention_until_year, created_at
       ) VALUES ($1, 'ROI_EOPERATIVO_TENTATIVA', '2', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 'ESCALAMIENTO_DIRECCION_LISTA_GRIS', $14, $15, $16, 'DIRECT_24H_BYPASS_CCC', $17, $18, 'URGENT_24H', $19, $20)`,
      [
        reportId,
        exp.id,
        exp.full_name,
        exp.curp_masked,
        exp.rfc_masked ?? 'XXXX000000XXX',
        'HUB-CUU',
        col11AmountDec.toFixed(2),
        col11AmountUsdDec.toFixed(2),
        fxRateDec.toFixed(6),
        amountMode,
        mandatoryPrefix,
        col40Description,
        col41Reasons,
        nowIso,
        deadline60dIso,
        nowIso,
        cleanNotes,
        deadline24hIso,
        retentionUntilYear,
        nowIso,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'PLD_ALERT_RESOLVED',
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: 'grayListDirectionWorkflowService',
      curpMasked: exp.curp_masked,
      expedienteId: exp.id,
      details: `Dirección RECHAZÓ operación en Lista Gris. Generado Reporte SITI Tipo 2 (${reportId}) con Col11=${col11AmountDec.toFixed(2)} y prefijo Col40='${mandatoryPrefix}. '.`,
    });

    return {
      expedienteId: exp.id,
      directionAuthStatus: 'REJECTED_GENERATE_INUSUAL',
      generatedReportId: reportId,
      col11AmountFormatted: col11AmountDec.toFixed(2),
      col40DescriptionFormatted: col40Description,
    };
  });
}
