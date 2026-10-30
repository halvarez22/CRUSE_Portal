/**
 * ALMA VIRTUAL — CONSULTAS PARAMETRIZADAS DE CUMPLIMIENTO ASISTIDO FASE 2 (CNBV / UIF / CIB)
 *
 * Implementa la Evidencia Forense #1 del expediente CRUSE-APO-2026-043:
 * 1. Verificación explícita de rol RBAC (`requireAlmaComplianceRole`): solo permite
 *    `['admin', 'oficial_cumplimiento', 'compliance_officer', 'general_management']`.
 * 2. Enmascaramiento estricto Zero-PII (`maskCurpStrictZeroPii`) en formato `H***0101**DF***02`
 *    y nombres enmascarados antes de construir el payload para el LLM.
 * 3. Uso exclusivo de `Decimal.js` (`sanitizeDecimalString`) sin coerciones nativas de punto flotante.
 *
 * @implements CRUSE-APO-2026-043 (Evidencia Forense #1)
 * @implements Regla 3 Anti-God-Object (< 600 líneas) y Regla 5 SSD (Zero-PII)
 */

import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import { AlmaVirtualDomainExecutionResult } from '../../types/executive';

const ALLOWED_COMPLIANCE_TOOL_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'oficial_cumplimiento',
  'compliance_officer',
  'general_management',
]);

/**
 * Compuerta RBAC obligatoria antes de ejecutar cualquier consulta de Cumplimiento Fase 2 en Alma Virtual.
 */
export function requireAlmaComplianceRole(actorRole: string): void {
  const normalizedRole = String(actorRole ?? '').trim().toLowerCase();
  if (!ALLOWED_COMPLIANCE_TOOL_ROLES.has(normalizedRole)) {
    throw new Error(
      `RBAC_ACCESS_DENIED: El rol '${normalizedRole}' no tiene autorización para invocar query_phase2_cnbv_and_cib_status.`
    );
  }
}

/**
 * Enmascara una CURP (o CURP ya enmascarada) al formato estricto Zero-PII: `H***0101**DF***02`.
 */
export function maskCurpStrictZeroPii(curpOrMasked: string | null | undefined): string {
  const clean = String(curpOrMasked ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9*]/g, '');
  if (clean.length < 10) {
    return 'X***0000**DF***00';
  }
  const rawFirst = clean.slice(0, 1).replace(/[^A-Z]/g, '');
  const firstLetter = rawFirst.length === 1 ? rawFirst : 'X';
  const yymm = clean.slice(4, 8).replace(/[^0-9]/g, '0').padEnd(4, '0').slice(0, 4);
  const rawState = clean.slice(11, 13).replace(/[^A-Z]/g, '');
  const stateCode = rawState.length === 2 ? rawState : 'DF';
  const lastTwo = clean.slice(-2).replace(/[^0-9]/g, '0').padStart(2, '0').slice(-2);
  return `${firstLetter}***${yymm}**${stateCode}***${lastTwo}`;
}

export async function resolvePhase2GrayListAndOcrExceptions(
  actorRole: string
): Promise<AlmaVirtualDomainExecutionResult> {
  requireAlmaComplianceRole(actorRole);

  const res = await db.query<{
    expediente_id: string;
    ocr_confidence_score: string | number;
    ocr_status: string;
    occupation_label: string;
    risk_matrix_score: string | number;
    current_risk_grade: string;
    direction_auth_status: string;
    next_semester_review_at: string;
  }>(`
    SELECT
      expediente_id,
      ocr_confidence_score,
      ocr_status,
      occupation_label,
      risk_matrix_score,
      current_risk_grade,
      direction_auth_status,
      CAST(next_semester_review_at AS TEXT) AS next_semester_review_at
    FROM expediente_compliance_profiles
    ORDER BY updated_at DESC, expediente_id DESC
    LIMIT 20
  `);

  const profiles = res.rows.map((r) => ({
    expediente_id: r.expediente_id,
    ocr_confidence_pct: sanitizeDecimalString(String(r.ocr_confidence_score), '95.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    ocr_status: r.ocr_status,
    occupation_label: r.occupation_label,
    risk_matrix_score: sanitizeDecimalString(String(r.risk_matrix_score), '15.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    risk_grade: r.current_risk_grade,
    direction_auth_status: r.direction_auth_status,
    next_semester_review_date: String(r.next_semester_review_at ?? '').slice(0, 10),
  }));

  const pendingDirection = profiles.filter((p) => p.direction_auth_status === 'PENDING_DIRECTION').length;
  const lowConfExceptions = profiles.filter((p) => p.ocr_status === 'LOW_CONFIDENCE_EXCEPTION').length;

  return {
    intentCode: 'PHASE2_GRAY_LIST_AND_OCR_EXCEPTIONS',
    domain: 'CUMPLIMIENTO_FASE2',
    questionNumber: null,
    structuredData: {
      total_profiles_audited: profiles.length,
      pending_direction_gray_list_count: pendingDirection,
      low_confidence_ocr_exceptions_count: lowConfExceptions,
      profiles,
    },
    deterministicMarkdown: `🛡️ **Fase 2 — Lista Gris (¿Autoriza Dirección?) y Excepciones OCR (${profiles.length} perfiles):** ${pendingDirection} pendientes de Dirección y ${lowConfExceptions} en excepción OCR.`,
  };
}

export async function resolvePhase2SitiReportsAndSlaClock(
  actorRole: string
): Promise<AlmaVirtualDomainExecutionResult> {
  requireAlmaComplianceRole(actorRole);

  const res = await db.query<{
    id: string;
    report_category: string;
    siti_report_type_code: string;
    subject_curp_masked: string;
    hub_code: string;
    operation_amount_mxn: string | number;
    operation_amount_usd: string | number;
    ccc_decision: string;
    sla_clock_status: string;
    investigation_deadline_at: string;
    uif_transmission_deadline_at: string | null;
  }>(`
    SELECT
      id,
      report_category,
      siti_report_type_code,
      subject_curp_masked,
      hub_code,
      operation_amount_mxn,
      operation_amount_usd,
      ccc_decision,
      sla_clock_status,
      CAST(investigation_deadline_at AS TEXT) AS investigation_deadline_at,
      CAST(uif_transmission_deadline_at AS TEXT) AS uif_transmission_deadline_at
    FROM pld_cnbv_reports_and_whistleblowing
    ORDER BY created_at DESC, id DESC
    LIMIT 20
  `);

  const reports = res.rows.map((r) => ({
    report_id: r.id,
    report_category: r.report_category,
    siti_type_code: r.siti_report_type_code,
    curp_zero_pii: maskCurpStrictZeroPii(r.subject_curp_masked),
    hub_code: r.hub_code,
    amount_mxn: sanitizeDecimalString(String(r.operation_amount_mxn), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    amount_usd: sanitizeDecimalString(String(r.operation_amount_usd), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    ccc_decision: r.ccc_decision,
    sla_clock_status: r.sla_clock_status,
    ccc_60d_deadline: String(r.investigation_deadline_at ?? '').slice(0, 10),
    uif_3_business_days_deadline: r.uif_transmission_deadline_at
      ? String(r.uif_transmission_deadline_at).slice(0, 10)
      : null,
  }));

  return {
    intentCode: 'PHASE2_SITI_REPORTS_AND_SLA_CLOCK',
    domain: 'CUMPLIMIENTO_FASE2',
    questionNumber: null,
    structuredData: {
      total_siti_reports: reports.length,
      reports,
    },
    deterministicMarkdown: `📑 **Fase 2 — Bandeja de Reportes SITI CNBV/UIF y Reloj 60+3 Días Hábiles (${reports.length} reportes registrados).**`,
  };
}

export async function resolvePhase2CibBatchesTraceability(
  actorRole: string
): Promise<AlmaVirtualDomainExecutionResult> {
  requireAlmaComplianceRole(actorRole);

  const res = await db.query<{
    id: string;
    batch_code: string;
    total_expedientes_included: string | number;
    excluded_low_confidence_or_pld_count: string | number;
    total_principal_mxn: string | number;
    total_fortnightly_quota_mxn: string | number;
    file_sha256_hash: string;
    workflow_status: string;
    cib_confirmation_folio: string | null;
  }>(`
    SELECT
      id,
      batch_code,
      total_expedientes_included,
      excluded_low_confidence_or_pld_count,
      total_principal_mxn,
      total_fortnightly_quota_mxn,
      file_sha256_hash,
      workflow_status,
      cib_confirmation_folio
    FROM cib_export_batches
    ORDER BY created_at DESC, id DESC
    LIMIT 15
  `);

  const batches = res.rows.map((b) => ({
    batch_id: b.id,
    batch_code: b.batch_code,
    included_count: sanitizeDecimalString(String(b.total_expedientes_included), '0').toFixed(0),
    excluded_count: sanitizeDecimalString(
      String(b.excluded_low_confidence_or_pld_count),
      '0'
    ).toFixed(0),
    total_principal_mxn: sanitizeDecimalString(String(b.total_principal_mxn), '0.00')
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    total_fortnightly_quota_mxn: sanitizeDecimalString(
      String(b.total_fortnightly_quota_mxn),
      '0.00'
    )
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
    sha256_prefix: String(b.file_sha256_hash ?? '').slice(0, 16),
    workflow_status: b.workflow_status,
    cib_confirmation_folio: b.cib_confirmation_folio,
  }));

  return {
    intentCode: 'PHASE2_CIB_BATCHES_TRACEABILITY',
    domain: 'CUMPLIMIENTO_FASE2',
    questionNumber: null,
    structuredData: {
      total_cib_batches: batches.length,
      batches,
    },
    deterministicMarkdown: `📦 **Fase 2 — Control de Lotes de Carga Semiautomática CIB Logic Systems (${batches.length} lotes).**`,
  };
}
