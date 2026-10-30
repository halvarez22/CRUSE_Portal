/**
 * RELOJ NORMATIVO CNBV / UIF (60 DÍAS NATURALES CCC + 3 DÍAS HÁBILES POST-CCC + REVISIÓN SEMESTRAL 180 DÍAS)
 *
 * Implementa el Punto de Control #2 de la FASE 2.4 (CRUSE-APO-2026-042):
 * 1. Calendario oficial de días inhábiles bancarios CNBV (DOF).
 * 2. Cálculo estricto de los 3 días hábiles posteriores a la sesión del CCC usando `date-fns`
 *    (saltando sábados, domingos y días inhábiles oficiales CNBV; prohibido sumar 72 horas lineales).
 * 3. Evaluación determinista del plazo de 60 días naturales para investigación del Oficial de Cumplimiento
 *    y revisión semestral (180 días) de expedientes conforme al Capítulo X de las Disposiciones CNBV.
 *
 * @implements CRUSE-APO-2026-042 (FASE 2.4 — Punto de Control #2)
 * @implements Regla 2 HRU (Cero Hardcoding) y Regla 3 Anti-God-Object (< 600 líneas)
 */

import { addDays, differenceInCalendarDays, format, isWeekend, parseISO } from 'date-fns';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { CnbvSlaClockStatus, UserRole } from '../../types';

/**
 * Calendario oficial de días inhábiles bancarios publicados por la CNBV en el Diario Oficial de la Federación (DOF)
 * aplicables a 2026 y 2027 (Formato ISO YYYY-MM-DD).
 */
export const CNBV_OFFICIAL_HOLIDAYS_2026_2027: ReadonlyArray<string> = [
  '2026-01-01', // Año Nuevo
  '2026-02-02', // Conmemoración Constitución Mexicana
  '2026-03-16', // Natalicio Benito Juárez
  '2026-04-02', // Jueves Santo Bancario CNBV
  '2026-04-03', // Viernes Santo Bancario CNBV
  '2026-05-01', // Día del Trabajo
  '2026-09-16', // Día de la Independencia
  '2026-11-02', // Día de Muertos Bancario CNBV
  '2026-11-16', // Conmemoración Revolución Mexicana
  '2026-12-12', // Día del Empleado Bancario CNBV
  '2026-12-25', // Navidad
  '2027-01-01', // Año Nuevo 2027
  '2027-02-01', // Conmemoración Constitución 2027
  '2027-03-15', // Natalicio Benito Juárez 2027
  '2027-03-25', // Jueves Santo Bancario 2027
  '2027-03-26', // Viernes Santo Bancario 2027
  '2027-05-01', // Día del Trabajo 2027
  '2027-09-16', // Día de la Independencia 2027
  '2027-11-02', // Día de Muertos Bancario 2027
  '2027-11-15', // Revolución Mexicana 2027
  '2027-12-12', // Día del Empleado Bancario 2027
  '2027-12-25', // Navidad 2027
];

/**
 * Suma exactamente `businessDays` días hábiles bancarios CNBV a una fecha inicial (`startDate`),
 * utilizando `date-fns` (`addDays`, `isWeekend`, `format`) y excluyendo explícitamente:
 * - Sábados y domingos (`isWeekend(candidate)`).
 * - Días inhábiles bancarios publicados por la CNBV en el DOF (`holidaysSet.has(isoDay)`).
 *
 * Cumple con el Punto de Control #2: Si el CCC sesiona un jueves y el viernes es inhábil CNBV,
 * los 3 días hábiles corren lunes (1), martes (2) y miércoles (3).
 */
export function addCnbvBusinessDays(
  startDate: Date | string,
  businessDays: number,
  holidaysIso: ReadonlyArray<string> = CNBV_OFFICIAL_HOLIDAYS_2026_2027
): Date {
  const baseDate = typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate.getTime());
  const holidaysSet = new Set<string>(holidaysIso);

  let current = baseDate;
  let countedBusinessDays = 0;

  while (countedBusinessDays < businessDays) {
    current = addDays(current, 1);
    const isoDateStr = format(current, 'yyyy-MM-dd');
    if (!isWeekend(current) && !holidaysSet.has(isoDateStr)) {
      countedBusinessDays += 1;
    }
  }

  return current;
}

/**
 * Calcula los días naturales restantes entre `referenceNow` y `deadlineDate` usando `date-fns`.
 */
export function computeRemainingCalendarDays(
  deadlineDate: Date | string,
  referenceNow: Date = new Date()
): number {
  const parsedDeadline =
    typeof deadlineDate === 'string'
      ? deadlineDate.includes('T')
        ? parseISO(deadlineDate)
        : new Date(deadlineDate)
      : deadlineDate;
  return differenceInCalendarDays(parsedDeadline, referenceNow);
}

/**
 * Determina el estado normativo del reloj SLA CNBV (60 días naturales para CCC + 3 días hábiles post-CCC).
 */
export function deriveCnbvSlaClockStatus(params: {
  reportCategory: string;
  cccDecision: string;
  investigationDeadlineAt: Date | string;
  uifTransmissionDeadlineAt: Date | string | null;
  currentStatus: CnbvSlaClockStatus;
  referenceNow?: Date;
}): {
  slaClockStatus: CnbvSlaClockStatus;
  remainingCalendarDaysForCcc: number;
} {
  const now = params.referenceNow ?? new Date();

  if (
    params.currentStatus === 'SUBMITTED_TO_SITI' ||
    params.currentStatus === 'ARCHIVED_NO_REPORT'
  ) {
    return {
      slaClockStatus: params.currentStatus,
      remainingCalendarDaysForCcc: 0,
    };
  }

  if (params.cccDecision === 'DISMISSED_WITH_JUSTIFICATION') {
    return {
      slaClockStatus: 'ARCHIVED_NO_REPORT',
      remainingCalendarDaysForCcc: 0,
    };
  }

  const remainingCccDays = computeRemainingCalendarDays(params.investigationDeadlineAt, now);

  if (
    params.reportCategory === 'ROI_24_HORAS' ||
    params.cccDecision === 'DIRECT_24H_BYPASS_CCC'
  ) {
    const status: CnbvSlaClockStatus = remainingCccDays < 0 ? 'SLA_EXPIRED' : 'URGENT_24H';
    return {
      slaClockStatus: status,
      remainingCalendarDaysForCcc: Math.max(0, remainingCccDays),
    };
  }

  if (params.cccDecision === 'REPORT_TO_UIF' && params.uifTransmissionDeadlineAt) {
    const remainingUifDays = computeRemainingCalendarDays(params.uifTransmissionDeadlineAt, now);
    if (remainingUifDays < 0) {
      return { slaClockStatus: 'SLA_EXPIRED', remainingCalendarDaysForCcc: 0 };
    }
    if (remainingUifDays <= 1) {
      return { slaClockStatus: 'URGENT_24H', remainingCalendarDaysForCcc: remainingUifDays };
    }
    return { slaClockStatus: 'WARNING_10_DAYS', remainingCalendarDaysForCcc: remainingUifDays };
  }

  if (remainingCccDays < 0) {
    return { slaClockStatus: 'SLA_EXPIRED', remainingCalendarDaysForCcc: 0 };
  }
  if (remainingCccDays <= 1) {
    return { slaClockStatus: 'URGENT_24H', remainingCalendarDaysForCcc: remainingCccDays };
  }
  if (remainingCccDays <= 10) {
    return { slaClockStatus: 'WARNING_10_DAYS', remainingCalendarDaysForCcc: remainingCccDays };
  }

  return { slaClockStatus: 'ON_TIME', remainingCalendarDaysForCcc: remainingCccDays };
}

export interface CnbvComplianceCronEvaluationResult {
  readonly evaluatedReportsCount: number;
  readonly updatedSlaStatusesCount: number;
  readonly expiredSlaCount: number;
  readonly urgent24hCount: number;
  readonly warning10DaysCount: number;
  readonly semesterReviewsDueCount: number;
  readonly evaluatedAtIso: string;
}

/**
 * Ejecuta la evaluación integral del Reloj Normativo CNBV (60 días naturales + 3 días hábiles post-CCC)
 * y detecta los expedientes cuya revisión semestral (180 días) de perfil transaccional ha vencido.
 */
export async function evaluateCnbvSlaClocksAndSemesterReviews(params: {
  actorEmail: string;
  actorRole: UserRole | 'sistema';
  sourceIp: string;
  referenceNow?: Date;
}): Promise<CnbvComplianceCronEvaluationResult> {
  const now = params.referenceNow ?? new Date();

  const reportsRes = await db.query<{
    id: string;
    report_category: string;
    ccc_decision: string;
    investigation_deadline_at: string;
    uif_transmission_deadline_at: string | null;
    sla_clock_status: string;
  }>(`
    SELECT
      id,
      report_category,
      ccc_decision,
      investigation_deadline_at,
      uif_transmission_deadline_at,
      sla_clock_status
    FROM pld_cnbv_reports_and_whistleblowing
  `);

  let updatedSlaStatusesCount = 0;
  let expiredSlaCount = 0;
  let urgent24hCount = 0;
  let warning10DaysCount = 0;

  for (const row of reportsRes.rows) {
    const derived = deriveCnbvSlaClockStatus({
      reportCategory: row.report_category,
      cccDecision: row.ccc_decision,
      investigationDeadlineAt: row.investigation_deadline_at,
      uifTransmissionDeadlineAt: row.uif_transmission_deadline_at,
      currentStatus: row.sla_clock_status as CnbvSlaClockStatus,
      referenceNow: now,
    });

    if (derived.slaClockStatus === 'SLA_EXPIRED') expiredSlaCount += 1;
    if (derived.slaClockStatus === 'URGENT_24H') urgent24hCount += 1;
    if (derived.slaClockStatus === 'WARNING_10_DAYS') warning10DaysCount += 1;

    if (derived.slaClockStatus !== row.sla_clock_status) {
      await db.execute(
        `UPDATE pld_cnbv_reports_and_whistleblowing
         SET sla_clock_status = $1
         WHERE id = $2`,
        [derived.slaClockStatus, row.id]
      );
      updatedSlaStatusesCount += 1;
    }
  }

  const semRes = await db.query<{
    expediente_id: string;
    next_semester_review_at: string;
  }>(`
    SELECT expediente_id, next_semester_review_at
    FROM expediente_compliance_profiles
  `);

  let semesterReviewsDueCount = 0;
  for (const prof of semRes.rows) {
    const daysToReview = computeRemainingCalendarDays(prof.next_semester_review_at, now);
    if (daysToReview <= 0) {
      semesterReviewsDueCount += 1;
    }
  }

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'PLD_SLA_CLOCK_EVALUATED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'cnbvComplianceCron',
    details: `Evaluación Reloj SLA CNBV (60d+3d hábiles): ${reportsRes.rows.length} reportes auditados, ${updatedSlaStatusesCount} actualizados, ${semesterReviewsDueCount} revisiones semestrales (180d) requeridas`,
  });

  return {
    evaluatedReportsCount: reportsRes.rows.length,
    updatedSlaStatusesCount,
    expiredSlaCount,
    urgent24hCount,
    warning10DaysCount,
    semesterReviewsDueCount,
    evaluatedAtIso: now.toISOString(),
  };
}
