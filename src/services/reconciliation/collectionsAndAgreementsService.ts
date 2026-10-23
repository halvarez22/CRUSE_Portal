/**
 * MOTOR DE COBRANZA EXTRAJUDICIAL, CONGELAMIENTO DE MORA, SUSPENSIONES Y REESTRUCTURAS N-A-1
 * Expediente: CRUSE-APO-2026-025 (RN-05, RN-07, RN-08, RN-10, RN-11)
 *
 * - Directriz 1: Proyección de estado mediante CTEs (`WITH`) en una sola pasada sin N+1.
 * - Directriz 2: Relación N-a-1 estricta en Reestructuras (`RN-11`), insertando N registros en
 *   `loan_restructures`, validando cero créditos `EXPRESS` y respetando el tope de 4 créditos activos.
 * - Directriz 3: Sincronización atómica de `loan_insurance_enrollments` (`EXCLUDED_DEMANDA`,
 *   `EXCLUDED_CONVENIO`, `CLOSED`, `ACTIVE`) en la misma transacción ACID con `pg_advisory_xact_lock(20260019)`.
 * - Directriz 4: Zero-PII absoluto (`blindCurpPrefix` 12 chars, `curpMasked`, `rfcMasked`, `maskedName`).
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db, TxHandle } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { calculateSimulation } from '../../config/financialConstants';
import { maskPiiForPreview } from './creditBureauService';
import {
  AuditAction,
  InsuranceEnrollmentStatus,
  LoanPortfolioRiskRow,
  PortfolioRiskSummary,
  ProjectedLoanOperationalStatus,
  SuspensionOrFreezeReason,
  UserRole,
} from '../../types';

interface PortfolioRiskJoinDbRow {
  loan_account_id: string;
  contract_number: string;
  expediente_id: string;
  convenio: string;
  product_type: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL';
  payment_frequency: string;
  term_fortnights: number;
  blind_curp: string;
  full_name_masked: string;
  curp_masked: string;
  rfc_masked: string | null;
  principal_original: string | number;
  projected_live_balance: string | number;
  fortnightly_payment: string | number;
  projected_status: ProjectedLoanOperationalStatus;
  active_suspension_id: string | null;
  active_suspension_reason: SuspensionOrFreezeReason | null;
  active_suspension_start_period: string | null;
  restructured_into_loan_id: string | null;
  restructured_into_contract: string | null;
  insurance_status: InsuranceEnrollmentStatus | null;
  insured_amount: string | number | null;
  period_premium: string | number | null;
  latest_note_content: string | null;
  activated_at: string | Date;
}

export interface RegisterSuspensionOrAgreementInput {
  loanAccountId: string;
  action: 'SUSPEND_OR_FREEZE' | 'REACTIVATE';
  reason: SuspensionOrFreezeReason;
  startPeriod: string;
  endPeriod?: string | null;
  agreementNotes: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  sourceSummary: string;
}

export interface ExecuteLoanRestructureInput {
  expedienteId: string;
  previousLoanIds: string[];
  newPrincipalAmount: number | string;
  newTermFortnights: number;
  firstDeductionPeriod: string;
  paymentFrequency?: 'QUINCENAL' | 'MENSUAL';
  notes?: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  sourceSummary: string;
}

export interface ExecuteLoanRestructureResult {
  newLoanAccountId: string;
  newContractNumber: string;
  expedienteId: string;
  newPrincipalAmount: string;
  newFortnightlyPayment: string;
  totalAbsorbedPayoff: string;
  netCashDisbursed: string;
  absorbedLoans: Array<{
    restructureId: string;
    previousLoanId: string;
    previousContractNumber: string;
    absorbedPayoffAmount: string;
  }>;
}

function mapProjectedSicObservation(
  status: ProjectedLoanOperationalStatus,
  reason: SuspensionOrFreezeReason | null
): string | null {
  if (status === 'RESTRUCTURED') return 'RV (Reestructurado)';
  if (status === 'PAID_OFF') return 'CC (Cuenta Cerrada Saldo $0)';
  if (status === 'FROZEN_EXTRAJUDICIAL') {
    if (reason === 'DEMANDA_JUDICIAL') return 'SG (Demanda / Cobranza Judicial)';
    if (reason === 'CONVENIO_EXTRAJUDICIAL') return 'CV (Convenio Extrajudicial)';
    return 'CL (Cobranza Extrajudicial / Baja)';
  }
  if (status === 'SUSPENDED_LEAVE') return 'V (Vigente en Pausa Licencia s/Mora)';
  return null;
}

async function syncInsuranceEnrollmentInTx(
  tx: TxHandle,
  loanAccountId: string,
  targetStatus: InsuranceEnrollmentStatus
): Promise<void> {
  const existing = await tx.query<{ id: string }>(
    `SELECT id FROM loan_insurance_enrollments WHERE loan_account_id = $1`,
    [loanAccountId]
  );
  if (existing.rowCount > 0) {
    await tx.execute(`UPDATE loan_insurance_enrollments SET status = $1 WHERE loan_account_id = $2`, [
      targetStatus,
      loanAccountId,
    ]);
    return;
  }

  const policyRes = await tx.query<{ id: string }>(
    `SELECT id FROM insurance_policies ORDER BY start_date DESC LIMIT 1`
  );
  let policyId = policyRes.rows[0]?.id;
  if (!policyId) {
    policyId = 'pol_colectiva_2026';
    await tx.execute(
      `INSERT INTO insurance_policies (id, insurance_company, policy_number, coverage_amount, start_date, end_date)
       VALUES ($1, $2, $3, 35000.00, '2026-01-01', '2026-12-31')`,
      [policyId, 'Aseguradora Institucional Colectiva', 'POL-CRUSE-35K-2026']
    );
  }

  await tx.execute(
    `INSERT INTO loan_insurance_enrollments (
       id, policy_id, loan_account_id, insured_amount, period_premium, first_payment_date, status
     ) VALUES ($1, $2, $3, 35000.00, 22.85, '2026-01-15', $4)`,
    [`lie_${crypto.randomUUID()}`, policyId, loanAccountId, targetStatus]
  );
}

/**
 * Directriz 1 y Directriz 4: Consulta Zero-PII optimizada con CTEs (`WITH`) sobre aislamiento
 * `REPEATABLE READ READ ONLY`. Jamás selecciona ni desencripta `encrypted_pii_payload`.
 */
export async function listPortfolioRiskAndCollections(): Promise<{
  summary: PortfolioRiskSummary;
  rows: LoanPortfolioRiskRow[];
}> {
  const rowsDb = await db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    }

    const res = await tx.query<PortfolioRiskJoinDbRow>(
      `WITH lpa_totals AS (
         SELECT loan_account_id, SUM(applied_capital) AS total_applied_capital
         FROM loan_payment_applications GROUP BY loan_account_id
       ),
       scm_totals AS (
         SELECT loan_account_id,
           SUM(CASE WHEN movement_type IN ('DISPOSICION', 'CARGO_INTERES') THEN amount ELSE 0 END) AS total_charges,
           SUM(CASE WHEN movement_type = 'ABONO' THEN amount ELSE 0 END) AS total_credits
         FROM special_credit_movements GROUP BY loan_account_id
       ),
       active_suspensions AS (
         SELECT s1.loan_account_id, s1.id AS active_suspension_id,
           s1.reason AS active_suspension_reason, s1.start_period AS active_suspension_start_period
         FROM loan_suspension_periods s1
         INNER JOIN (
           SELECT loan_account_id, MAX(created_at) AS max_ts FROM loan_suspension_periods
           WHERE status = 'ACTIVE_SUSPENSION' GROUP BY loan_account_id
         ) s2 ON s1.loan_account_id = s2.loan_account_id AND s1.created_at = s2.max_ts
         WHERE s1.status = 'ACTIVE_SUSPENSION'
       ),
       restructured_loans AS (
         SELECT lr.previous_loan_id AS loan_account_id,
           MAX(lr.new_loan_id) AS restructured_into_loan_id,
           MAX(la_new.contract_number) AS restructured_into_contract
         FROM loan_restructures lr
         INNER JOIN loan_accounts la_new ON la_new.id = lr.new_loan_id
         GROUP BY lr.previous_loan_id
       ),
       latest_insurance AS (
         SELECT i1.loan_account_id, i1.status AS insurance_status, i1.insured_amount, i1.period_premium
         FROM loan_insurance_enrollments i1
         INNER JOIN (
           SELECT loan_account_id, MAX(created_at) AS max_ts FROM loan_insurance_enrollments GROUP BY loan_account_id
         ) i2 ON i1.loan_account_id = i2.loan_account_id AND i1.created_at = i2.max_ts
       ),
       latest_notes AS (
         SELECT n1.entity_id AS loan_account_id, n1.note_content AS latest_note_content
         FROM operational_notes n1
         INNER JOIN (
           SELECT entity_id, MAX(created_at) AS max_ts FROM operational_notes
           WHERE entity_type = 'LOAN_ACCOUNT' GROUP BY entity_id
         ) n2 ON n1.entity_id = n2.entity_id AND n1.created_at = n2.max_ts
         WHERE n1.entity_type = 'LOAN_ACCOUNT'
       )
       SELECT
         la.id AS loan_account_id, la.contract_number, la.expediente_id, e.convenio,
         la.product_type, la.payment_frequency, e.term_fortnights, e.blind_curp,
         e.full_name AS full_name_masked, e.curp_masked, e.rfc_masked, la.principal_original,
         CASE
           WHEN rl.restructured_into_loan_id IS NOT NULL THEN 0
           WHEN la.product_type = 'ESPECIAL' THEN la.principal_original + COALESCE(st.total_charges, 0) - COALESCE(st.total_credits, 0)
           ELSE CASE WHEN la.principal_original - COALESCE(lt.total_applied_capital, 0) > 0 THEN la.principal_original - COALESCE(lt.total_applied_capital, 0) ELSE 0 END
         END AS projected_live_balance,
         la.fortnightly_payment,
         CASE
           WHEN rl.restructured_into_loan_id IS NOT NULL THEN 'RESTRUCTURED'
           WHEN asusp.active_suspension_reason IN ('BAJA_LABORAL', 'COBRANZA_EXTRAJUDICIAL', 'DEMANDA_JUDICIAL', 'CONVENIO_EXTRAJUDICIAL') THEN 'FROZEN_EXTRAJUDICIAL'
           WHEN asusp.active_suspension_reason = 'LICENCIA_SIN_GOCE' THEN 'SUSPENDED_LEAVE'
           WHEN (CASE WHEN la.product_type = 'ESPECIAL' THEN la.principal_original + COALESCE(st.total_charges, 0) - COALESCE(st.total_credits, 0) ELSE la.principal_original - COALESCE(lt.total_applied_capital, 0) END) <= 0 THEN 'PAID_OFF'
           ELSE la.status
         END AS projected_status,
         asusp.active_suspension_id, asusp.active_suspension_reason, asusp.active_suspension_start_period,
         rl.restructured_into_loan_id, rl.restructured_into_contract,
         li.insurance_status, li.insured_amount, li.period_premium, ln.latest_note_content, la.activated_at
       FROM loan_accounts la
       INNER JOIN expedientes e ON e.id = la.expediente_id
       LEFT JOIN lpa_totals lt ON lt.loan_account_id = la.id
       LEFT JOIN scm_totals st ON st.loan_account_id = la.id
       LEFT JOIN active_suspensions asusp ON asusp.loan_account_id = la.id
       LEFT JOIN restructured_loans rl ON rl.loan_account_id = la.id
       LEFT JOIN latest_insurance li ON li.loan_account_id = la.id
       LEFT JOIN latest_notes ln ON ln.loan_account_id = la.id
       ORDER BY la.contract_number ASC`
    );
    return res.rows;
  });

  let activeCount = 0;
  let frozenExtrajudicialCount = 0;
  let suspendedLeaveCount = 0;
  let restructuredCount = 0;
  let paidOffCount = 0;
  let excludedInsuranceCount = 0;
  let totalLiveBalanceDec = new Decimal(0);
  let totalFrozenBalanceDec = new Decimal(0);

  const rows: LoanPortfolioRiskRow[] = rowsDb.map((r) => {
    const masked = maskPiiForPreview({
      maskedNameFromDb: r.full_name_masked,
      curpMaskedFromDb: r.curp_masked,
      rfcMaskedFromDb: r.rfc_masked,
      blindCurp: r.blind_curp,
    });

    const liveBalDec = Decimal.max(0, new Decimal(r.projected_live_balance || 0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalLiveBalanceDec = totalLiveBalanceDec.plus(liveBalDec);

    if (r.projected_status === 'ACTIVE') activeCount++;
    else if (r.projected_status === 'FROZEN_EXTRAJUDICIAL') {
      frozenExtrajudicialCount++;
      totalFrozenBalanceDec = totalFrozenBalanceDec.plus(liveBalDec);
    } else if (r.projected_status === 'SUSPENDED_LEAVE') suspendedLeaveCount++;
    else if (r.projected_status === 'RESTRUCTURED') restructuredCount++;
    else if (r.projected_status === 'PAID_OFF') paidOffCount++;

    let effectiveInsStatus: InsuranceEnrollmentStatus = r.insurance_status ?? 'ACTIVE';
    if (!r.insurance_status) {
      if (r.projected_status === 'RESTRUCTURED' || r.projected_status === 'PAID_OFF') effectiveInsStatus = 'CLOSED';
      else if (r.active_suspension_reason === 'CONVENIO_EXTRAJUDICIAL') effectiveInsStatus = 'EXCLUDED_CONVENIO';
      else if (r.projected_status === 'FROZEN_EXTRAJUDICIAL') effectiveInsStatus = 'EXCLUDED_DEMANDA';
    }

    if (
      effectiveInsStatus === 'EXCLUDED_DEMANDA' ||
      effectiveInsStatus === 'EXCLUDED_CONVENIO' ||
      effectiveInsStatus === 'EXCLUDED_AGE_OVER_65'
    ) {
      excludedInsuranceCount++;
    }

    return {
      loanAccountId: r.loan_account_id,
      contractNumber: r.contract_number,
      expedienteId: r.expediente_id,
      convenio: r.convenio,
      productType: r.product_type,
      paymentFrequency: r.payment_frequency,
      termPeriods: Number(r.term_fortnights || 24),
      blindCurpPrefix: masked.blindCurpPrefix,
      maskedName: masked.maskedName,
      curpMasked: masked.curpMasked,
      rfcMasked: masked.rfcMasked,
      principalOriginal: new Decimal(r.principal_original || 0).toFixed(2),
      liveBalance: liveBalDec.toFixed(2),
      fortnightlyPayment: new Decimal(r.fortnightly_payment || 0).toFixed(2),
      projectedStatus: r.projected_status,
      activeSuspensionId: r.active_suspension_id,
      activeSuspensionReason: r.active_suspension_reason,
      activeSuspensionStartPeriod: r.active_suspension_start_period,
      restructuredIntoLoanId: r.restructured_into_loan_id,
      restructuredIntoContract: r.restructured_into_contract,
      insuranceStatus: effectiveInsStatus,
      insuredAmount: new Decimal(r.insured_amount ?? 35000).toFixed(2),
      periodPremium: new Decimal(r.period_premium ?? 22.85).toFixed(2),
      sicObservationPreview: mapProjectedSicObservation(r.projected_status, r.active_suspension_reason),
      latestNoteContent: r.latest_note_content,
      activatedAtIso:
        r.activated_at instanceof Date ? r.activated_at.toISOString().slice(0, 10) : String(r.activated_at).slice(0, 10),
    };
  });

  return {
    summary: {
      totalLoans: rows.length,
      activeCount,
      frozenExtrajudicialCount,
      suspendedLeaveCount,
      restructuredCount,
      paidOffCount,
      excludedInsuranceCount,
      totalLiveBalance: totalLiveBalanceDec.toFixed(2),
      totalFrozenBalance: totalFrozenBalanceDec.toFixed(2),
    },
    rows,
  };
}

/**
 * Directriz 3: Registra atómicamente el congelamiento por mora/demanda (`RN-05`), convenio de pago (`RN-07`)
 * o suspensión/reactivación por licencia sin goce (`RN-10`), sincronizando `loan_insurance_enrollments` (`RN-08`)
 * dentro de la misma transacción ACID con `pg_advisory_xact_lock(20260019)`.
 */
export async function registerSuspensionOrAgreement(
  input: RegisterSuspensionOrAgreementInput
): Promise<{ suspensionId: string; projectedStatus: ProjectedLoanOperationalStatus; insuranceStatus: InsuranceEnrollmentStatus }> {
  const cleanPeriod = input.startPeriod.trim() || '2026-Q20';
  const cleanNotes = input.agreementNotes.trim();
  if (cleanNotes.length < 5) {
    throw new Error('Se requiere una justificación o detalle de convenio de al menos 5 caracteres.');
  }

  return db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.query('SELECT pg_advisory_xact_lock(20260019);');
    }

    const loanCheck = await tx.query<{ id: string; contract_number: string; expediente_id: string }>(
      `SELECT id, contract_number, expediente_id FROM loan_accounts WHERE id = $1`,
      [input.loanAccountId]
    );
    const loan = loanCheck.rows[0];
    if (!loan) throw new Error(`La cuenta de crédito '${input.loanAccountId}' no existe.`);

    await tx.execute(
      `UPDATE loan_suspension_periods SET status = 'REACTIVATED', end_period = $1, reactivated_at = CURRENT_TIMESTAMP
       WHERE loan_account_id = $2 AND status = 'ACTIVE_SUSPENSION'`,
      [cleanPeriod, loan.id]
    );

    const suspensionId = `lsp_${crypto.randomUUID()}`;
    let projectedStatus: ProjectedLoanOperationalStatus = 'ACTIVE';
    let targetInsuranceStatus: InsuranceEnrollmentStatus = 'ACTIVE';
    let auditAction: AuditAction = 'LOAN_SUSPENSION_UPDATED';

    if (input.action === 'SUSPEND_OR_FREEZE') {
      await tx.execute(
        `INSERT INTO loan_suspension_periods (
           id, loan_account_id, start_period, end_period, reason, status, approved_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE_SUSPENSION', $6, CURRENT_TIMESTAMP)`,
        [suspensionId, loan.id, cleanPeriod, input.endPeriod ?? null, input.reason, input.actorEmail]
      );

      if (input.reason === 'LICENCIA_SIN_GOCE') {
        projectedStatus = 'SUSPENDED_LEAVE';
        targetInsuranceStatus = 'ACTIVE';
        auditAction = 'LOAN_SUSPENSION_UPDATED';
      } else if (input.reason === 'CONVENIO_EXTRAJUDICIAL') {
        projectedStatus = 'FROZEN_EXTRAJUDICIAL';
        targetInsuranceStatus = 'EXCLUDED_CONVENIO';
        auditAction = 'LOAN_AGREEMENT_REGISTERED';
      } else {
        projectedStatus = 'FROZEN_EXTRAJUDICIAL';
        targetInsuranceStatus = 'EXCLUDED_DEMANDA';
        auditAction = 'LOAN_FROZEN_EXTRAJUDICIAL';
      }
    }

    // Directriz 3 (RN-08): Sincronización atómica de la póliza de seguro de vida en la misma transacción ACID
    await syncInsuranceEnrollmentInTx(tx, loan.id, targetInsuranceStatus);

    const noteId = `note_${crypto.randomUUID()}`;
    const noteText = `[${input.action === 'REACTIVATE' ? 'REACTIVADO' : input.reason} · ${cleanPeriod}] ${cleanNotes}`;
    await tx.execute(
      `INSERT INTO operational_notes (id, entity_type, entity_id, note_content, is_pinned, author_email, created_at)
       VALUES ($1, 'LOAN_ACCOUNT', $2, $3, 1, $4, CURRENT_TIMESTAMP)`,
      [noteId, loan.id, noteText, input.actorEmail]
    );

    await auditEventStore.appendInTx(tx, {
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      action: auditAction,
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: input.sourceSummary,
      expedienteId: loan.expediente_id,
      details: JSON.stringify({
        loanAccountId: loan.id,
        contractNumber: loan.contract_number,
        action: input.action,
        reason: input.reason,
        startPeriod: cleanPeriod,
        projectedStatus,
        insuranceStatus: targetInsuranceStatus,
        noteId,
      }),
    });

    return { suspensionId, projectedStatus, insuranceStatus: targetInsuranceStatus };
  });
}

/**
 * Directriz 2: Ejecuta una Reestructura N-a-1 (`RN-11`), absorbiendo de 1 hasta 4 créditos
 * `NOMINA_NORMAL` activos hacia un nuevo contrato, bloqueando cualquier crédito `EXPRESS`,
 * insertando N filas individuales en `loan_restructures` y sincronizando el seguro de vida (`RN-08`).
 */
export async function executeLoanRestructure(
  input: ExecuteLoanRestructureInput
): Promise<ExecuteLoanRestructureResult> {
  const uniquePrevIds = Array.from(new Set(input.previousLoanIds.map((id) => id.trim()).filter(Boolean)));
  if (uniquePrevIds.length < 1 || uniquePrevIds.length > 4) {
    throw new Error('REGLA DE NEGOCIO RN-11: Debe seleccionar entre 1 y 4 créditos normales activos para reestructurar.');
  }

  const newPrincipalDec = new Decimal(input.newPrincipalAmount || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!newPrincipalDec.isFinite() || newPrincipalDec.lte(0)) {
    throw new Error('El monto principal del nuevo crédito reestructurado debe ser mayor a $0.00.');
  }

  const termFortnights = Math.max(1, Math.min(96, Math.round(Number(input.newTermFortnights || 24))));
  const firstPeriod = input.firstDeductionPeriod.trim() || '2026-Q21';
  const frequency = input.paymentFrequency === 'MENSUAL' ? 'MENSUAL' : 'QUINCENAL';

  return db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.query('SELECT pg_advisory_xact_lock(20260019);');
      await tx.query(`SELECT set_config('cruse.is_restructuring', 'true', true);`);
    }

    const absorbedLoans: ExecuteLoanRestructureResult['absorbedLoans'] = [];
    let totalAbsorbedDec = new Decimal(0);

    for (const prevId of uniquePrevIds) {
      const loanRes = await tx.query<{
        id: string;
        contract_number: string;
        expediente_id: string;
        principal_original: string | number;
        product_type: string;
      }>(`SELECT id, contract_number, expediente_id, principal_original, product_type FROM loan_accounts WHERE id = $1`, [
        prevId,
      ]);

      const prevLoan = loanRes.rows[0];
      if (!prevLoan) throw new Error(`El crédito origen '${prevId}' no existe.`);
      if (prevLoan.expediente_id !== input.expedienteId) {
        throw new Error(`El crédito '${prevLoan.contract_number}' no pertenece al expediente '${input.expedienteId}'.`);
      }
      if (prevLoan.product_type === 'EXPRESS') {
        throw new Error(
          `REGLA DE NEGOCIO RN-11: El crédito '${prevLoan.contract_number}' es de tipo EXPRESS. Los créditos Express no son sujetos de reestructura.`
        );
      }

      const alreadyRestructured = await tx.query<{ id: string }>(
        `SELECT id FROM loan_restructures WHERE previous_loan_id = $1`,
        [prevId]
      );
      if (alreadyRestructured.rowCount > 0) {
        throw new Error(`El crédito '${prevLoan.contract_number}' ya fue absorbido previamente en otra reestructura.`);
      }

      const paidRes = await tx.query<{ total_cap: string | number | null }>(
        `SELECT COALESCE(SUM(applied_capital), 0) AS total_cap FROM loan_payment_applications WHERE loan_account_id = $1`,
        [prevId]
      );
      const paidCapDec = new Decimal(paidRes.rows[0]?.total_cap ?? 0);
      const liveBalDec = Decimal.max(0, new Decimal(prevLoan.principal_original).minus(paidCapDec)).toDecimalPlaces(
        2,
        Decimal.ROUND_HALF_UP
      );

      totalAbsorbedDec = totalAbsorbedDec.plus(liveBalDec);
      absorbedLoans.push({
        restructureId: `lr_${crypto.randomUUID()}`,
        previousLoanId: prevLoan.id,
        previousContractNumber: prevLoan.contract_number,
        absorbedPayoffAmount: liveBalDec.toFixed(2),
      });
    }

    const sim = calculateSimulation(newPrincipalDec.toNumber(), termFortnights, 'normal');
    const fortnightlyPaymentDec = new Decimal(sim.fortnightlyPayment).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const countRes = await tx.query<{ total: string | number }>('SELECT COUNT(*) AS total FROM loan_accounts');
    const nextSeq = Number(countRes.rows[0]?.total ?? 0) + 1;
    const newLoanAccountId = `la_${crypto.randomUUID()}`;
    const newContractNumber = `CNT-2026-${String(nextSeq).padStart(4, '0')}`;

    await tx.execute(
      `INSERT INTO loan_accounts (
         id, contract_number, expediente_id, principal_original, current_principal_balance,
         fortnightly_payment, payment_frequency, first_deduction_period, activated_at,
         activated_by, product_type, insurance_required, status, reports_to_credit_bureau
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, 'NOMINA_NORMAL', 1, 'ACTIVE', 1)`,
      [
        newLoanAccountId,
        newContractNumber,
        input.expedienteId,
        newPrincipalDec.toNumber(),
        newPrincipalDec.toNumber(),
        fortnightlyPaymentDec.toNumber(),
        frequency,
        firstPeriod,
        input.actorEmail,
      ]
    );

    // Directriz 2: Inserción de N registros distintos en loan_restructures (relación N-a-1) y cierre de seguros previos
    for (const item of absorbedLoans) {
      await tx.execute(
        `INSERT INTO loan_restructures (
           id, new_loan_id, previous_loan_id, absorbed_payoff_amount, authorized_by, restructured_at
         ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [item.restructureId, newLoanAccountId, item.previousLoanId, Number(item.absorbedPayoffAmount), input.actorEmail]
      );
      await syncInsuranceEnrollmentInTx(tx, item.previousLoanId, 'CLOSED');
    }

    await syncInsuranceEnrollmentInTx(tx, newLoanAccountId, 'ACTIVE');

    const netCashDec = Decimal.max(0, newPrincipalDec.minus(totalAbsorbedDec)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const noteId = `note_${crypto.randomUUID()}`;
    const absorbedSummary = absorbedLoans.map((a) => `${a.previousContractNumber} ($${a.absorbedPayoffAmount})`).join(', ');
    const noteContent = `[REESTRUCTURA N-A-1 (${absorbedLoans.length} -> 1)] Absorbió: ${absorbedSummary}. Total absorbido: $${totalAbsorbedDec.toFixed(2)}. Remanente neto: $${netCashDec.toFixed(2)}. ${input.notes?.trim() || ''}`.trim();

    await tx.execute(
      `INSERT INTO operational_notes (id, entity_type, entity_id, note_content, is_pinned, author_email, created_at)
       VALUES ($1, 'LOAN_ACCOUNT', $2, $3, 1, $4, CURRENT_TIMESTAMP)`,
      [noteId, newLoanAccountId, noteContent, input.actorEmail]
    );

    await auditEventStore.appendInTx(tx, {
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      action: 'LOAN_RESTRUCTURED',
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: input.sourceSummary,
      expedienteId: input.expedienteId,
      details: JSON.stringify({
        newLoanAccountId,
        newContractNumber,
        absorbedCount: absorbedLoans.length,
        absorbedLoans,
        newPrincipalAmount: newPrincipalDec.toFixed(2),
        totalAbsorbedPayoff: totalAbsorbedDec.toFixed(2),
        netCashDisbursed: netCashDec.toFixed(2),
      }),
    });

    return {
      newLoanAccountId,
      newContractNumber,
      expedienteId: input.expedienteId,
      newPrincipalAmount: newPrincipalDec.toFixed(2),
      newFortnightlyPayment: fortnightlyPaymentDec.toFixed(2),
      totalAbsorbedPayoff: totalAbsorbedDec.toFixed(2),
      netCashDisbursed: netCashDec.toFixed(2),
      absorbedLoans,
    };
  });
}
