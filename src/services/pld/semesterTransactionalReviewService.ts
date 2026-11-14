/**
 * SERVICIO DE REVISIÓN SEMESTRAL DE PERFIL TRANSACCIONAL (180 DÍAS — FRACCIÓN VIII CAP. X DCG ART. 115 LIC)
 *
 * Implementa el Guardrail Forense 4 de CRUSE-APO-2026-065:
 * - Flujo interactivo con 2 preguntas secuenciales obligatorias (`¿Cambió algo en el perfil?` y `¿Se reporta?`)
 * - 3 caminos WORM (`SEMESTER_REVIEW_NO_CHANGES`, `SEMESTER_REVIEW_ESCALATED_TO_ROI`, `SEMESTER_REVIEW_PROFILE_UPDATED_NO_ROI`)
 * - Disparo atómico de Reporte de Operación Inusual (ROI) + actualización de Grado de Riesgo EBR.
 *
 * @implements CRUSE-APO-2026-065 (Guardrail Forense 4)
 * @implements Regla 3 Anti-God-Object (< 580 líneas) y Regla 6 SQA (Decimal.js)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { addDays } from 'date-fns';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import { sanitizeSitiAlphanumericField } from './sitiLayoutGenerator';
import {
  CnbvRiskGrade,
  SemesterReviewWormAction,
  SemesterTransactionalReviewHistoryItem,
  UserRole,
} from '../../types';

interface SemesterReviewDbRow {
  id: string;
  expediente_id: string;
  profile_changed: number;
  requires_inusual_report: number | null;
  previous_transactional_profile_mxn: string | number;
  updated_transactional_profile_mxn: string | number;
  previous_risk_grade: CnbvRiskGrade;
  updated_risk_grade: CnbvRiskGrade;
  generated_report_id: string | null;
  review_justification_notes: string;
  worm_action: SemesterReviewWormAction;
  record_sha256_hash: string;
  reviewed_by_email: string;
  reviewed_by_role: string;
  source_ip: string;
  next_semester_review_at: string;
  created_at: string;
}

export async function listSemesterTransactionalReviews(
  expedienteId?: string
): Promise<ReadonlyArray<SemesterTransactionalReviewHistoryItem>> {
  const res = expedienteId
    ? await db.query<SemesterReviewDbRow>(
        `SELECT * FROM expediente_semester_reviews_worm WHERE expediente_id = $1 ORDER BY created_at DESC`,
        [expedienteId]
      )
    : await db.query<SemesterReviewDbRow>(
        `SELECT * FROM expediente_semester_reviews_worm ORDER BY created_at DESC LIMIT 100`
      );

  return res.rows.map((r) => ({
    id: r.id,
    expedienteId: r.expediente_id,
    profileChanged: Number(r.profile_changed) === 1,
    requiresInusualReport:
      r.requires_inusual_report === null || r.requires_inusual_report === undefined
        ? null
        : Number(r.requires_inusual_report) === 1,
    previousTransactionalProfileMxn: sanitizeDecimalString(
      String(r.previous_transactional_profile_mxn),
      '0.00'
    ).toFixed(2),
    updatedTransactionalProfileMxn: sanitizeDecimalString(
      String(r.updated_transactional_profile_mxn),
      '0.00'
    ).toFixed(2),
    previousRiskGrade: r.previous_risk_grade,
    updatedRiskGrade: r.updated_risk_grade,
    generatedReportId: r.generated_report_id,
    reviewJustificationNotes: r.review_justification_notes,
    wormAction: r.worm_action,
    recordSha256Hash: r.record_sha256_hash,
    reviewedByEmail: r.reviewed_by_email,
    reviewedByRole: r.reviewed_by_role,
    sourceIp: r.source_ip,
    nextSemesterReviewAt: String(r.next_semester_review_at),
    createdAt: String(r.created_at),
  }));
}

export async function executeSemesterTransactionalReview(params: {
  expedienteId: string;
  profileChanged: boolean;
  requiresInusualReport?: boolean;
  newTransactionalProfileMxn?: string;
  newRiskGrade?: CnbvRiskGrade;
  roiOperationAmountMxn?: string;
  roiCol40CriteriaDescription?: string;
  reviewJustificationNotes: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  reviewItem: SemesterTransactionalReviewHistoryItem;
  generatedReportId: string | null;
}> {
  const cleanNotes = String(params.reviewJustificationNotes ?? '').trim();
  if (cleanNotes.length < 10) {
    throw new Error('La revisión semestral de perfil transaccional requiere al menos 10 caracteres de sustento.');
  }

  if (params.profileChanged && typeof params.requiresInusualReport !== 'boolean') {
    throw new Error(
      'Guardrail 4: Cuando cambió el perfil transaccional, es obligatorio responder la Pregunta 2 (¿El cambio detectado amerita Reporte de Operación Inusual?).'
    );
  }

  return db.transaction(async (tx) => {
    const profRes = await tx.query<{
      expediente_id: string;
      initial_transactional_profile_mxn: string | number;
      current_risk_grade: CnbvRiskGrade;
    }>(
      `SELECT expediente_id, initial_transactional_profile_mxn, current_risk_grade
       FROM expediente_compliance_profiles WHERE expediente_id = $1`,
      [params.expedienteId]
    );
    const prof = profRes.rows[0];
    if (!prof) {
      throw new Error(`Perfil de cumplimiento para expediente ${params.expedienteId} no encontrado.`);
    }

    const expRes = await tx.query<{
      id: string;
      full_name: string;
      curp_masked: string;
      rfc_masked: string | null;
    }>(
      `SELECT id, full_name, curp_masked, rfc_masked FROM expedientes WHERE id = $1`,
      [params.expedienteId]
    );
    const exp = expRes.rows[0];
    if (!exp) {
      throw new Error(`Expediente ${params.expedienteId} no encontrado.`);
    }

    const prevProfileDec = sanitizeDecimalString(
      String(prof.initial_transactional_profile_mxn),
      '3500.00'
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const prevGrade = prof.current_risk_grade;

    const now = new Date();
    const nowIso = now.toISOString();
    const nextReviewIso = addDays(now, 180).toISOString();

    let updatedProfileDec = prevProfileDec;
    let updatedGrade: CnbvRiskGrade = prevGrade;
    let wormAction: SemesterReviewWormAction = 'SEMESTER_REVIEW_NO_CHANGES';
    let generatedReportId: string | null = null;

    if (!params.profileChanged) {
      wormAction = 'SEMESTER_REVIEW_NO_CHANGES';
    } else {
      updatedProfileDec = sanitizeDecimalString(
        params.newTransactionalProfileMxn ?? prevProfileDec.toFixed(2),
        prevProfileDec.toFixed(2)
      ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      updatedGrade = params.newRiskGrade ?? 'ALTO';

      if (params.requiresInusualReport) {
        wormAction = 'SEMESTER_REVIEW_ESCALATED_TO_ROI';
        generatedReportId = `cnbv_roi_sem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

        const roiAmtDec = sanitizeDecimalString(
          params.roiOperationAmountMxn ?? updatedProfileDec.toFixed(2),
          updatedProfileDec.toFixed(2)
        ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const fxDec = new Decimal('19.850000');
        const roiUsdDec = roiAmtDec.dividedBy(fxDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        const col40Desc = sanitizeSitiAlphanumericField(
          params.roiCol40CriteriaDescription && params.roiCol40CriteriaDescription.trim().length > 5
            ? params.roiCol40CriteriaDescription
            : `ALERTA DERIVADA DE REVISION SEMESTRAL DE PERFIL TRANSACCIONAL (180 DIAS CAPITULO X FRACCION VIII DCG ART 115 LIC). PERFIL PREVIO: ${prevProfileDec.toFixed(2)} MXN -> PERFIL DETECTADO: ${updatedProfileDec.toFixed(2)} MXN. CAMBIO DE GRADO DE RIESGO: ${prevGrade} A ${updatedGrade}.`,
          2800
        );
        const col41Reasons = sanitizeSitiAlphanumericField(
          `DESVIACION DEL PERFIL TRANSACCIONAL INICIAL DETECTADA EN ACTUALIZACION SEMESTRAL DE EXPEDIENTE ${exp.id}. DICTAMEN OFICIAL DE CUMPLIMIENTO: ${cleanNotes}`,
          2800
        );

        await tx.execute(
          `INSERT INTO pld_cnbv_reports_and_whistleblowing (
             id, report_category, siti_report_type_code, expediente_id,
             subject_masked_name, subject_curp_masked, subject_rfc_masked, hub_code,
             operation_amount_mxn, operation_amount_usd, applied_fx_rate_usd_mxn,
             tentative_amount_mode, mandatory_col40_prefix,
             col40_operation_description, col41_inusual_reasons,
             is_anonymous_whistleblowing, reporter_role_or_channel,
             detected_at, investigation_deadline_at, ccc_decision,
             sla_clock_status, retention_until_year, created_at
           ) VALUES ($1, 'ROI_OPERACION', '2', $2, $3, $4, $5, 'HUB-CUU', $6, $7, '19.850000', 'REQUESTED_AMOUNT_BLOCKED', 'NONE', $8, $9, 0, 'REVISION_SEMESTRAL_PERFIL_180D', $10, $11, 'PENDING_CCC', 'ON_TIME', $12, $13)`,
          [
            generatedReportId,
            exp.id,
            exp.full_name,
            exp.curp_masked,
            exp.rfc_masked ?? 'XXXX000000XXX',
            roiAmtDec.toFixed(2),
            roiUsdDec.toFixed(2),
            col40Desc,
            col41Reasons,
            nowIso,
            addDays(now, 60).toISOString(),
            now.getUTCFullYear() + 10,
            nowIso,
          ]
        );
      } else {
        wormAction = 'SEMESTER_REVIEW_PROFILE_UPDATED_NO_ROI';
      }
    }

    await tx.execute(
      `UPDATE expediente_compliance_profiles
       SET initial_transactional_profile_mxn = $1,
           current_risk_grade = $2,
           last_semester_review_at = $3,
           next_semester_review_at = $4,
           updated_at = $3
       WHERE expediente_id = $5`,
      [
        updatedProfileDec.toFixed(2),
        updatedGrade,
        nowIso,
        nextReviewIso,
        params.expedienteId,
      ]
    );

    const reviewId = `sem_rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const recordSha256Hash = crypto
      .createHash('sha256')
      .update(
        `${reviewId}|${params.expedienteId}|${wormAction}|${prevProfileDec.toFixed(2)}|${updatedProfileDec.toFixed(2)}|${prevGrade}|${updatedGrade}|${generatedReportId ?? 'NONE'}|${cleanNotes}|${params.actorEmail}|${nowIso}`,
        'utf8'
      )
      .digest('hex');

    await tx.execute(
      `INSERT INTO expediente_semester_reviews_worm (
         id, expediente_id, profile_changed, requires_inusual_report,
         previous_transactional_profile_mxn, updated_transactional_profile_mxn,
         previous_risk_grade, updated_risk_grade, generated_report_id,
         review_justification_notes, worm_action, record_sha256_hash,
         reviewed_by_email, reviewed_by_role, source_ip, next_semester_review_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        reviewId,
        params.expedienteId,
        params.profileChanged ? 1 : 0,
        params.profileChanged ? (params.requiresInusualReport ? 1 : 0) : null,
        prevProfileDec.toFixed(2),
        updatedProfileDec.toFixed(2),
        prevGrade,
        updatedGrade,
        generatedReportId,
        cleanNotes,
        wormAction,
        recordSha256Hash,
        params.actorEmail,
        params.actorRole,
        params.sourceIp,
        nextReviewIso,
        nowIso,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: wormAction,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      outcome: 'success',
      sourceIp: params.sourceIp,
      sourceSummary: 'semesterTransactionalReviewService',
      expedienteId: params.expedienteId,
      curpMasked: exp.curp_masked,
      details: `Revisión Semestral (180d) completada (${wormAction}) | Perfil: $${prevProfileDec.toFixed(2)} -> $${updatedProfileDec.toFixed(2)} MXN | Grado: ${prevGrade} -> ${updatedGrade} | ROI generado: ${generatedReportId ?? 'N/A'} | Próxima revisión: ${nextReviewIso.slice(0, 10)}`,
    });

    const reviewItem: SemesterTransactionalReviewHistoryItem = {
      id: reviewId,
      expedienteId: params.expedienteId,
      profileChanged: params.profileChanged,
      requiresInusualReport: params.profileChanged ? Boolean(params.requiresInusualReport) : null,
      previousTransactionalProfileMxn: prevProfileDec.toFixed(2),
      updatedTransactionalProfileMxn: updatedProfileDec.toFixed(2),
      previousRiskGrade: prevGrade,
      updatedRiskGrade: updatedGrade,
      generatedReportId,
      reviewJustificationNotes: cleanNotes,
      wormAction,
      recordSha256Hash,
      reviewedByEmail: params.actorEmail,
      reviewedByRole: params.actorRole,
      sourceIp: params.sourceIp,
      nextSemesterReviewAt: nextReviewIso,
      createdAt: nowIso,
    };

    return { reviewItem, generatedReportId };
  });
}
