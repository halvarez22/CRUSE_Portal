/**
 * MOTOR DE PAGO SOSTENIDO CNBV (ANEXO 33 CUB), SEMÁFORO DPD Y RESERVAS EPRC
 * Expediente: CRUSE-APO-2026-067 (Guardrails Forenses 3 y 8)
 *
 * - Desacopla el Semáforo de Morosidad por días reales de atraso (0, 1-30, 31-89, >=90 DPD)
 *   de las insignias administrativas (LICENCIA_CON_OFICIO, EN_TRAMITE, REESTRUCTURADO).
 * - Acredita Pago Sostenido únicamente tras 3 amortizaciones consecutivas completas y oportunas
 *   (dentro de los 3 días naturales siguientes al vencimiento).
 * - Calcula Estimaciones Preventivas para Riesgos Crediticios (EPRC) 100% en Decimal.js.
 */

import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { UserRole } from '../../types';

export type AgingBucketCode = 'DPD_0_AL_CORRIENTE' | 'DPD_1_30_TEMPRANA' | 'DPD_31_89_ETAPA2' | 'DPD_90_PLUS_VENCIDA';
export type AgingSemaphoreColor = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO';
export type AdministrativeStatusBadge =
  | 'NONE'
  | 'EN_TRAMITE'
  | 'LICENCIA_OFICIAL_CON_OFICIO'
  | 'REESTRUCTURADO_EN_OBSERVACION';

export interface AgingAndEprcAssessment {
  daysPastDue: number;
  bucketCode: AgingBucketCode;
  semaphoreColor: AgingSemaphoreColor;
  administrativeBadge: AdministrativeStatusBadge;
  regulatoryStatusLabel: string;
  eprcReserveRatePercent: string;
  eprcReserveAmountMxn: string;
}

export interface SustainedPaymentEvaluationInput {
  loanAccountId: string;
  isCompletePayment: boolean;
  daysAfterDueDate: number;
  requiredSustainedPayments?: number;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  sourceSummary: string;
}

export interface SustainedPaymentEvaluationResult {
  loanAccountId: string;
  originatedFromArrearsRestructure: boolean;
  sustainedPaymentsCompletedCount: number;
  requiredSustainedPayments: number;
  portfolioHealthStatus: 'REESTRUCTURADO EN OBSERVACIÓN' | 'ACTIVO SANO';
  regulatoryBadge: string;
  paymentCountedAsSustained: boolean;
}

/**
 * Clasifica morosidad exclusivamente por días reales de atraso (DPD) y calcula EPRC.
 * Una licencia oficial o un expediente en trámite NO marcan morosidad crediticia.
 */
export function evaluateAgingAndEprc(params: {
  daysPastDue: number;
  liveBalanceMxn: number | string | Decimal;
  isFrozenExtrajudicial?: boolean;
  isOfficialLeave?: boolean;
  isInOrigination?: boolean;
  originatedFromArrearsRestructure?: boolean;
  sustainedPaymentsCompletedCount?: number;
  requiredSustainedPayments?: number;
}): AgingAndEprcAssessment {
  const dpd = Math.max(0, Math.trunc(Number(params.daysPastDue || 0)));
  const balanceDec = Decimal.max(0, new Decimal(params.liveBalanceMxn || 0));
  const reqSustained = params.requiredSustainedPayments ?? 3;
  const completedSustained = Math.max(0, Math.trunc(Number(params.sustainedPaymentsCompletedCount ?? 0)));
  const inSustainedObservation = Boolean(params.originatedFromArrearsRestructure) && completedSustained < reqSustained;

  let administrativeBadge: AdministrativeStatusBadge = 'NONE';
  if (params.isInOrigination) {
    administrativeBadge = 'EN_TRAMITE';
  } else if (params.isOfficialLeave) {
    administrativeBadge = 'LICENCIA_OFICIAL_CON_OFICIO';
  } else if (inSustainedObservation) {
    administrativeBadge = 'REESTRUCTURADO_EN_OBSERVACION';
  }

  let bucketCode: AgingBucketCode = 'DPD_0_AL_CORRIENTE';
  let semaphoreColor: AgingSemaphoreColor = 'VERDE';
  let eprcRate = new Decimal('0.005'); // 0.5% Etapa 1 cartera vigente

  if (params.isFrozenExtrajudicial || dpd >= 90) {
    bucketCode = 'DPD_90_PLUS_VENCIDA';
    semaphoreColor = 'ROJO';
    eprcRate = new Decimal('0.60'); // 60% Etapa 3 cartera vencida
  } else if (dpd >= 31) {
    bucketCode = 'DPD_31_89_ETAPA2';
    semaphoreColor = 'NARANJA';
    eprcRate = new Decimal('0.25'); // 25% Etapa 2 mora media
  } else if (dpd >= 1) {
    bucketCode = 'DPD_1_30_TEMPRANA';
    semaphoreColor = 'AMARILLO';
    eprcRate = new Decimal('0.05'); // 5% mora temprana
  } else if (inSustainedObservation) {
    // Guardrail 3: Reestructura proveniente de mora no computa como cartera sana verde ordinaria
    semaphoreColor = 'AMARILLO';
    eprcRate = new Decimal('0.10');
  }

  const reserveDec = balanceDec.times(eprcRate).toDP(2, Decimal.ROUND_HALF_UP);
  const regulatoryStatusLabel = inSustainedObservation
    ? `REESTRUCTURADO EN OBSERVACIÓN (PAGO SOSTENIDO ${completedSustained}/${reqSustained})`
    : bucketCode === 'DPD_0_AL_CORRIENTE'
      ? 'ACTIVO SANO'
      : bucketCode === 'DPD_1_30_TEMPRANA'
        ? `MORA TEMPRANA (${dpd} DÍAS)`
        : bucketCode === 'DPD_31_89_ETAPA2'
          ? `MORA MEDIA ETAPA 2 (${dpd} DÍAS)`
          : `CARTERA VENCIDA ETAPA 3 (${dpd} DÍAS)`;

  return {
    daysPastDue: dpd,
    bucketCode,
    semaphoreColor,
    administrativeBadge,
    regulatoryStatusLabel,
    eprcReserveRatePercent: eprcRate.times(100).toFixed(2),
    eprcReserveAmountMxn: reserveDec.toFixed(2),
  };
}

/**
 * Guardrail 3: Registra atómicamente el avance de Pago Sostenido CNBV (3 amortizaciones
 * consecutivas completas y oportunas dentro de <= 3 días naturales del vencimiento).
 */
export async function recordSustainedPaymentProgress(
  input: SustainedPaymentEvaluationInput
): Promise<SustainedPaymentEvaluationResult> {
  const required = Math.max(3, input.requiredSustainedPayments ?? 3);

  return db.transaction(async (tx) => {
    const res = await tx.query<{
      id: string;
      expediente_id: string;
      originated_from_arrears_restructure: number;
      sustained_payments_completed_count: number;
    }>(
      `SELECT id, expediente_id,
              COALESCE(originated_from_arrears_restructure, 0) AS originated_from_arrears_restructure,
              COALESCE(sustained_payments_completed_count, 0) AS sustained_payments_completed_count
       FROM loan_accounts WHERE id = $1`,
      [input.loanAccountId]
    );

    const loan = res.rows[0];
    if (!loan) {
      throw new Error(`Cuenta de crédito '${input.loanAccountId}' no encontrada para evaluación de Pago Sostenido.`);
    }

    const fromArrears = Number(loan.originated_from_arrears_restructure) === 1;
    const latestEventRes = await tx.query<{ streak_after_event: number }>(
      `SELECT streak_after_event
       FROM loan_sustained_payment_events
       WHERE loan_account_id = $1
       ORDER BY recorded_at DESC, id DESC
       LIMIT 1`,
      [loan.id]
    );
    const prevCount = Number(
      latestEventRes.rows[0]?.streak_after_event ?? loan.sustained_payments_completed_count ?? 0
    );
    const isTimely = input.daysAfterDueDate <= 3;
    const countsAsSustained = fromArrears && input.isCompletePayment && isTimely;

    // Si hay incumplimiento durante el periodo de observación, se reinicia la racha consecutiva
    const nextCount = !fromArrears
      ? prevCount
      : countsAsSustained
        ? Math.min(required, prevCount + 1)
        : 0;

    // Persistencia WORM append-only (cero UPDATE sobre loan_accounts respetando trigger WORM)
    if (fromArrears) {
      await tx.execute(
        `INSERT INTO loan_sustained_payment_events
          (id, loan_account_id, is_complete_payment, days_after_due_date, streak_after_event, recorded_by, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `spe_${Date.now()}_${crypto.randomUUID()}`,
          loan.id,
          input.isCompletePayment ? 1 : 0,
          Math.max(0, Math.trunc(input.daysAfterDueDate)),
          nextCount,
          input.actorEmail,
          new Date().toISOString(),
        ]
      );
    }

    const graduatedToHealthy = !fromArrears || nextCount >= required;
    const portfolioHealthStatus: SustainedPaymentEvaluationResult['portfolioHealthStatus'] =
      graduatedToHealthy ? 'ACTIVO SANO' : 'REESTRUCTURADO EN OBSERVACIÓN';
    const regulatoryBadge = graduatedToHealthy
      ? fromArrears
        ? `ACTIVO SANO (PAGO SOSTENIDO ACREDITADO ${nextCount}/${required})`
        : 'ACTIVO SANO'
      : `REESTRUCTURADO EN OBSERVACIÓN (${nextCount}/${required})`;

    await auditEventStore.appendInTx(tx, {
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      action: 'SUSTAINED_PAYMENT_RECORDED',
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: input.sourceSummary,
      expedienteId: loan.expediente_id,
      details: JSON.stringify({
        loanAccountId: loan.id,
        originatedFromArrearsRestructure: fromArrears,
        previousCount: prevCount,
        newCount: nextCount,
        required,
        isCompletePayment: input.isCompletePayment,
        daysAfterDueDate: input.daysAfterDueDate,
        portfolioHealthStatus,
      }),
    });

    return {
      loanAccountId: loan.id,
      originatedFromArrearsRestructure: fromArrears,
      sustainedPaymentsCompletedCount: nextCount,
      requiredSustainedPayments: required,
      portfolioHealthStatus,
      regulatoryBadge,
      paymentCountedAsSustained: countsAsSustained,
    };
  });
}
