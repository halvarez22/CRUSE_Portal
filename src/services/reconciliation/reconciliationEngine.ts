/**
 * MOTOR TRANSACCIONAL DE CONCILIACIÓN QUINCENAL Y DISTRIBUCIÓN MULTI-CRÉDITO WORM
 *
 * @implements CRUSE-APO-2026-026 (Directriz 1: Proyección Single-Pass CTE sin consultas N+1)
 * @implements CRUSE-APO-2026-026 (Directriz 2: Distribución determinista Multi-Crédito 1:N con Decimal.js y prelación activated_at ASC, id ASC)
 * @implements CRUSE-APO-2026-026 (Directriz 3: Sello criptográfico encadenando sourceFileHash SHA-256)
 * @implements CRUSE-APO-2026-026 (Directriz 4: Zero-PII absoluto en reconciliation_items y bitácora WORM)
 * @implements RN-05, RN-07, RN-08, RN-10, RN-13
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { PreparedPayrollRow, maskPayrollEmployeeName } from './reconciliationValidator';
import {
  ProductId,
  ReconciliationItem,
  ReconciliationItemStatus,
  UserRole,
} from '../../types';
import { computeDue, applyWaterfall, LoanState, PeriodDue } from './paymentWaterfall';
import { auditEventStore } from '../audit/auditEventStore';
import { ProjectedConvenioLoanRow, queryConvenioPortfolioCte } from './payrollIngestionService';

export interface BatchProcessingResult {
  batchId: string;
  sourceFileHash: string;
  batchManifestHash: string;
  totalProcessed: number;
  matchExact: number;
  underpayment: number;
  missingInPayroll: number;
  overpayment: number;
  suspendedInPayroll: number;
  notInPortfolio: number;
  totalExpected: number;
  totalReceived: number;
  netDifference: number;
  items: ReconciliationItem[];
}

export interface PlannedLoanApplication {
  item: ReconciliationItem;
  loanInfo: ProjectedConvenioLoanRow | null;
  actualAmount: Decimal;
  expectedAmount: Decimal;
  due?: PeriodDue;
  applied?: PeriodDue;
  balanceBefore?: Decimal;
  nextState?: LoanState;
}

function buildLoanCurrentState(loan: ProjectedConvenioLoanRow): LoanState {
  if (loan.last_balance_after !== null && loan.last_balance_after !== undefined) {
    return {
      balance: new Decimal(loan.last_balance_after),
      arrearsInsurance: new Decimal(loan.last_arrears_insurance ?? 0),
      arrearsInterest: new Decimal(loan.last_arrears_interest ?? 0),
      arrearsVat: new Decimal(loan.last_arrears_vat ?? 0),
      creditBalance: new Decimal(loan.last_credit_balance ?? 0),
    };
  }
  const liveBal = Decimal.max(
    0,
    new Decimal(loan.principal_original).minus(new Decimal(loan.total_applied_capital ?? 0))
  );
  return {
    balance: liveBal,
    arrearsInsurance: new Decimal(0),
    arrearsInterest: new Decimal(0),
    arrearsVat: new Decimal(0),
    creditBalance: new Decimal(0),
  };
}

function computeLoanDueWithInsuranceRules(
  loan: ProjectedConvenioLoanRow,
  currentState: LoanState,
  expectedPayment: Decimal
): PeriodDue {
  const productForDue: ProductId = loan.product_type === 'EXPRESS' ? 'express' : 'normal';
  const baseDue = computeDue(currentState, productForDue, expectedPayment);

  // RN-08: Excluir cobro de prima de seguro ($22.85) si la póliza fue excluida o el convenio no aplica seguro
  const isInsuranceExcluded =
    loan.insurance_required === 0 ||
    loan.charges_life_insurance === 0 ||
    loan.insurance_status === 'EXCLUDED_DEMANDA' ||
    loan.insurance_status === 'EXCLUDED_CONVENIO' ||
    loan.insurance_status === 'EXCLUDED_AGE_OVER_65' ||
    loan.insurance_status === 'CLOSED';

  if (isInsuranceExcluded && baseDue.insurance.gt(0)) {
    const adjustedCapital = Decimal.max(
      0,
      expectedPayment.minus(baseDue.interest).minus(baseDue.vat)
    );
    return {
      insurance: new Decimal(0),
      interest: baseDue.interest,
      vat: baseDue.vat,
      capital: Decimal.min(currentState.balance, adjustedCapital),
    };
  }
  return baseDue;
}

/**
 * Directriz 2: Planificador determinista de cascada multi-crédito (1:N por blind_curp)
 * con Decimal.js (ROUND_HALF_UP) y cero centavos perdidos.
 */
export function buildDeterministicReconciliationPlan(
  batchId: string,
  portfolioLoans: ProjectedConvenioLoanRow[],
  rows: PreparedPayrollRow[]
): {
  planned: PlannedLoanApplication[];
  matchExact: number;
  underpayment: number;
  missingInPayroll: number;
  overpayment: number;
  suspendedInPayroll: number;
  notInPortfolio: number;
  totalExpected: Decimal;
  totalReceived: Decimal;
} {
  const activeLoansByCurp = new Map<string, ProjectedConvenioLoanRow[]>();
  const suspendedLoansByCurp = new Map<string, ProjectedConvenioLoanRow[]>();
  const activeLoanByContract = new Map<string, ProjectedConvenioLoanRow>();
  const suspendedLoanByContract = new Map<string, ProjectedConvenioLoanRow>();

  for (const loan of portfolioLoans) {
    if (loan.projected_status === 'ACTIVE') {
      const list = activeLoansByCurp.get(loan.blind_curp) ?? [];
      list.push(loan);
      activeLoansByCurp.set(loan.blind_curp, list);
      activeLoanByContract.set(loan.contract_number.toUpperCase(), loan);
    } else if (loan.projected_status === 'SUSPENDED_LEAVE') {
      const list = suspendedLoansByCurp.get(loan.blind_curp) ?? [];
      list.push(loan);
      suspendedLoansByCurp.set(loan.blind_curp, list);
      suspendedLoanByContract.set(loan.contract_number.toUpperCase(), loan);
    }
  }

  const processedLoanIds = new Set<string>();
  const planned: PlannedLoanApplication[] = [];

  let matchExact = 0;
  let underpayment = 0;
  let missingInPayroll = 0;
  let overpayment = 0;
  let suspendedInPayroll = 0;
  let notInPortfolio = 0;
  let totalExpected = new Decimal(0);
  let totalReceived = new Decimal(0);

  const allocateToSingleLoan = (
    loan: ProjectedConvenioLoanRow,
    allocatedAmount: Decimal,
    maskedEmployeeName: string,
    multiLoanIndex?: number,
    multiLoanTotal?: number
  ) => {
    processedLoanIds.add(loan.loan_account_id);
    const expectedAmount = new Decimal(loan.fortnightly_payment).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP
    );
    const actualAmount = allocatedAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const diff = actualAmount.minus(expectedAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    totalExpected = totalExpected.plus(expectedAmount);
    totalReceived = totalReceived.plus(actualAmount);

    let status: ReconciliationItemStatus;
    if (diff.isZero()) {
      status = 'MATCH_EXACT';
      matchExact++;
    } else if (diff.isNegative()) {
      status = 'DISCREPANCY_UNDERPAYMENT';
      underpayment++;
    } else {
      status = 'DISCREPANCY_OVERPAYMENT';
      overpayment++;
    }

    const currentState = buildLoanCurrentState(loan);
    const due = computeLoanDueWithInsuranceRules(loan, currentState, expectedAmount);
    const wf = applyWaterfall(actualAmount, due, currentState);

    let appIns = wf.applied.insurance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    let appInt = wf.applied.interest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    let appVat = wf.applied.vat.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    let appCap = wf.applied.capital.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // Directriz 2: Garantizar invariante contable exacta al centavo (appIns + appInt + appVat + appCap === actualAmount)
    const sumApplied = appIns.plus(appInt).plus(appVat).plus(appCap);
    const residualCent = actualAmount.minus(sumApplied).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    let nextBal = wf.next.balance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    if (!residualCent.isZero() && actualAmount.gt(0)) {
      const candidateCap = appCap.plus(residualCent);
      if (candidateCap.gte(0)) {
        appCap = candidateCap;
        nextBal = Decimal.max(0, currentState.balance.minus(appCap)).toDecimalPlaces(
          2,
          Decimal.ROUND_HALF_UP
        );
      } else {
        appInt = Decimal.max(0, appInt.plus(residualCent));
      }
    }

    const itemId = `ri_${crypto.randomBytes(6).toString('hex')}`;
    const noteSuffix =
      multiLoanTotal && multiLoanTotal > 1
        ? ` [Prelación Multi-Crédito ${multiLoanIndex}/${multiLoanTotal} • Contrato ${loan.contract_number}]`
        : ` [Contrato ${loan.contract_number}]`;

    planned.push({
      item: {
        id: itemId,
        batchId,
        expedienteId: loan.expediente_id,
        loanAccountId: loan.loan_account_id,
        contractNumber: loan.contract_number,
        blindCurp: loan.blind_curp,
        curpMasked: loan.curp_masked,
        employeeName: maskedEmployeeName,
        expectedPayment: expectedAmount.toNumber(),
        actualPayment: actualAmount.toNumber(),
        difference: diff.toNumber(),
        status,
        auditNotes: `Cascada WORM (${status})${noteSuffix}`,
      },
      loanInfo: loan,
      actualAmount,
      expectedAmount,
      due: {
        insurance: due.insurance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        interest: due.interest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        vat: due.vat.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        capital: due.capital.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      },
      applied: {
        insurance: appIns,
        interest: appInt,
        vat: appVat,
        capital: appCap,
      },
      balanceBefore: currentState.balance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      nextState: {
        balance: nextBal,
        arrearsInsurance: wf.next.arrearsInsurance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        arrearsInterest: wf.next.arrearsInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        arrearsVat: wf.next.arrearsVat.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        creditBalance: wf.next.creditBalance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      },
    });
  };

  const pushSuspendedItem = (suspLoan: ProjectedConvenioLoanRow) => {
    processedLoanIds.add(suspLoan.loan_account_id);
    suspendedInPayroll++;
    planned.push({
      item: {
        id: `ri_${crypto.randomBytes(6).toString('hex')}`,
        batchId,
        expedienteId: suspLoan.expediente_id,
        loanAccountId: suspLoan.loan_account_id,
        contractNumber: suspLoan.contract_number,
        blindCurp: suspLoan.blind_curp,
        curpMasked: suspLoan.curp_masked,
        employeeName: maskPayrollEmployeeName(suspLoan.full_name),
        expectedPayment: 0,
        actualPayment: 0,
        difference: 0,
        status: 'SUSPENDED_IN_PAYROLL',
        auditNotes: `Suspensión autorizada por licencia sin goce (RN-07) • Contrato ${suspLoan.contract_number}`,
      },
      loanInfo: null,
      actualAmount: new Decimal(0),
      expectedAmount: new Decimal(0),
    });
  };

  for (const row of rows) {
    const safeName = maskPayrollEmployeeName(row.name);

    if (row.contractNumber) {
      const contractKey = row.contractNumber.toUpperCase();
      const explicitLoan = activeLoanByContract.get(contractKey);
      if (explicitLoan && !processedLoanIds.has(explicitLoan.loan_account_id)) {
        allocateToSingleLoan(explicitLoan, row.amount, safeName, 1, 1);
        continue;
      }
      const explicitSuspLoan = suspendedLoanByContract.get(contractKey);
      if (
        explicitSuspLoan &&
        !processedLoanIds.has(explicitSuspLoan.loan_account_id) &&
        (row.amount.isZero() || row.isSuspensionMarker)
      ) {
        pushSuspendedItem(explicitSuspLoan);
        continue;
      }
    }

    // Directriz 2: Distribución Multi-Crédito por blind_curp en orden activated_at ASC, loan_account_id ASC
    const workerActiveLoans = (activeLoansByCurp.get(row.blindCurp) ?? []).filter(
      (l) => !processedLoanIds.has(l.loan_account_id)
    );

    if (workerActiveLoans.length > 0) {
      let remainingPool = row.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const totalLoans = workerActiveLoans.length;

      for (let i = 0; i < totalLoans; i++) {
        const loan = workerActiveLoans[i]!;
        const loanExpected = new Decimal(loan.fortnightly_payment).toDecimalPlaces(
          2,
          Decimal.ROUND_HALF_UP
        );

        let allocatedToLoan: Decimal;
        if (i < totalLoans - 1) {
          allocatedToLoan = Decimal.min(remainingPool, loanExpected).toDecimalPlaces(
            2,
            Decimal.ROUND_HALF_UP
          );
          remainingPool = remainingPool
            .minus(allocatedToLoan)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        } else {
          // El último crédito activo absorbe exactamente el remanente (0 centavos flotantes)
          allocatedToLoan = remainingPool.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          remainingPool = new Decimal(0);
        }

        allocateToSingleLoan(loan, allocatedToLoan, safeName, i + 1, totalLoans);
      }
      continue;
    }

    const workerSuspended = suspendedLoansByCurp.get(row.blindCurp) ?? [];
    if (workerSuspended.length > 0 && (row.amount.isZero() || row.isSuspensionMarker)) {
      pushSuspendedItem(workerSuspended[0]!);
      continue;
    }

    notInPortfolio++;
    const actualAmt = row.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalReceived = totalReceived.plus(actualAmt);
    planned.push({
      item: {
        id: `ri_${crypto.randomBytes(6).toString('hex')}`,
        batchId,
        blindCurp: row.blindCurp,
        curpMasked: row.curpMasked,
        employeeName: safeName,
        expectedPayment: 0,
        actualPayment: actualAmt.toNumber(),
        difference: actualAmt.toNumber(),
        status: 'NOT_IN_PORTFOLIO',
        auditNotes: 'Retención recibida sin crédito activo vinculado en este convenio',
      },
      loanInfo: null,
      actualAmount: actualAmt,
      expectedAmount: new Decimal(0),
    });
  }

  for (const loan of portfolioLoans) {
    if (processedLoanIds.has(loan.loan_account_id)) continue;

    if (loan.projected_status === 'SUSPENDED_LEAVE') {
      pushSuspendedItem(loan);
    } else if (loan.projected_status === 'ACTIVE') {
      allocateToSingleLoan(
        loan,
        new Decimal(0),
        maskPayrollEmployeeName(loan.full_name),
        1,
        1
      );
      underpayment--;
      missingInPayroll++;
      const lastPlanned = planned[planned.length - 1]!;
      lastPlanned.item.status = 'MISSING_IN_PAYROLL';
      lastPlanned.item.auditNotes = `Baja / Omisión en nómina sin suspensión autorizada • Contrato ${loan.contract_number}`;
    }
  }

  return {
    planned,
    matchExact,
    underpayment,
    missingInPayroll,
    overpayment,
    suspendedInPayroll,
    notInPortfolio,
    totalExpected,
    totalReceived,
  };
}

export async function processReconciliationBatch(
  agreementName: string,
  fortnightPeriod: string,
  officerEmail: string,
  officerRole: UserRole | string,
  rows: PreparedPayrollRow[],
  sourceFileHash: string = 'MANUAL_RECORDS_PAYLOAD'
): Promise<BatchProcessingResult> {
  const safeRole = (officerRole as UserRole) || 'oficial_cumplimiento';

  return db.transaction(async (tx) => {
    const existingBatch = await tx.query<{ id: string }>(
      'SELECT id FROM reconciliation_batches WHERE agreement_name = $1 AND fortnight_period = $2',
      [agreementName, fortnightPeriod]
    );
    if (existingBatch.rowCount > 0) {
      await auditEventStore.appendInTx(tx, {
        action: 'RECONCILIATION_BATCH_REJECTED',
        actorEmail: officerEmail,
        actorRole: safeRole,
        outcome: 'denied',
        sourceIp: '127.0.0.1',
        sourceSummary: 'reconciliationEngine',
        details: `Lote duplicado rechazado: ${agreementName} - ${fortnightPeriod}`,
      });
      throw new Error(
        `El lote para el convenio ${agreementName} en el periodo ${fortnightPeriod} ya fue procesado.`
      );
    }

    const batchId = `rb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const portfolioLoans = await queryConvenioPortfolioCte(tx, agreementName);
    const plan = buildDeterministicReconciliationPlan(batchId, portfolioLoans, rows);

    const hasDiscrepancies =
      plan.underpayment > 0 || plan.missingInPayroll > 0 || plan.notInPortfolio > 0;
    const finalStatus = hasDiscrepancies ? 'cerrado_con_discrepancias' : 'conciliado_total';
    const totalRecords = plan.planned.length;

    const manifestPayload = JSON.stringify({
      batchId,
      sourceFileHash,
      agreementName,
      fortnightPeriod,
      totalExpected: plan.totalExpected.toFixed(2),
      totalReceived: plan.totalReceived.toFixed(2),
      totalRecords,
    });
    const batchManifestHash = crypto.createHash('sha256').update(manifestPayload).digest('hex');

    await tx.execute(
      `INSERT INTO reconciliation_batches (
        id, created_at, agreement_name, fortnight_period, total_records,
        total_amount_expected, total_amount_received, status, officer_email, batch_manifest_hash, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        batchId,
        new Date().toISOString(),
        agreementName,
        fortnightPeriod,
        totalRecords,
        plan.totalExpected.toNumber(),
        plan.totalReceived.toNumber(),
        finalStatus,
        officerEmail,
        batchManifestHash,
        `SourceSHA256:${sourceFileHash}`,
      ]
    );

    for (const entry of plan.planned) {
      const { item, loanInfo } = entry;
      await tx.execute(
        `INSERT INTO reconciliation_items (
          id, batch_id, expediente_id, blind_curp, curp_masked, employee_name,
          expected_payment, actual_payment, difference, status, audit_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          item.id,
          batchId,
          item.expedienteId ?? null,
          item.blindCurp,
          item.curpMasked,
          item.employeeName,
          item.expectedPayment,
          item.actualPayment,
          item.difference,
          item.status,
          item.auditNotes,
        ]
      );

      if (loanInfo && entry.due && entry.applied && entry.balanceBefore && entry.nextState) {
        const appId = `lpa_${crypto.randomBytes(6).toString('hex')}`;
        await tx.execute(
          `INSERT INTO loan_payment_applications (
            id, loan_account_id, expediente_id, batch_id, reconciliation_item_id, fortnight_period, amount_received,
            due_insurance, due_interest, due_vat, due_capital,
            applied_insurance, applied_interest, applied_vat, applied_capital,
            balance_before, balance_after,
            arrears_insurance_after, arrears_interest_after, arrears_vat_after, credit_balance_after
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [
            appId,
            loanInfo.loan_account_id,
            loanInfo.expediente_id,
            batchId,
            item.id,
            fortnightPeriod,
            entry.actualAmount.toNumber(),
            entry.due.insurance.toNumber(),
            entry.due.interest.toNumber(),
            entry.due.vat.toNumber(),
            entry.due.capital.toNumber(),
            entry.applied.insurance.toNumber(),
            entry.applied.interest.toNumber(),
            entry.applied.vat.toNumber(),
            entry.applied.capital.toNumber(),
            entry.balanceBefore.toNumber(),
            entry.nextState.balance.toNumber(),
            entry.nextState.arrearsInsurance.toNumber(),
            entry.nextState.arrearsInterest.toNumber(),
            entry.nextState.arrearsVat.toNumber(),
            entry.nextState.creditBalance.toNumber(),
          ]
        );
      }
    }

    await auditEventStore.appendInTx(tx, {
      action: 'RECONCILIATION_BATCH_SEALED',
      actorEmail: officerEmail,
      actorRole: safeRole,
      outcome: 'success',
      sourceIp: '127.0.0.1',
      sourceSummary: 'reconciliationEngine',
      details: `Lote ${batchId} sellado (${agreementName} ${fortnightPeriod}). SourceSHA256: ${sourceFileHash.slice(0, 16)} | ManifestSHA256: ${batchManifestHash.slice(0, 16)}`,
    });

    return {
      batchId,
      sourceFileHash,
      batchManifestHash,
      totalProcessed: totalRecords,
      matchExact: plan.matchExact,
      underpayment: plan.underpayment,
      missingInPayroll: plan.missingInPayroll,
      overpayment: plan.overpayment,
      suspendedInPayroll: plan.suspendedInPayroll,
      notInPortfolio: plan.notInPortfolio,
      totalExpected: plan.totalExpected.toNumber(),
      totalReceived: plan.totalReceived.toNumber(),
      netDifference: plan.totalReceived.minus(plan.totalExpected).toNumber(),
      items: plan.planned.map((p) => ({
        ...p.item,
        blindCurp: p.item.blindCurp.slice(0, 12),
      })),
    };
  });
}
