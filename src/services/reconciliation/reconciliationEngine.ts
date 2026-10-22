import { db } from '../db/connectionPool';
import { PreparedPayrollRow } from './reconciliationValidator';
import { ProductId, UserRole } from '../../types';
import Decimal from 'decimal.js';
import { computeDue, applyWaterfall, LoanState } from './paymentWaterfall';
import { auditEventStore } from '../audit/auditEventStore';
import crypto from 'crypto';

export interface BatchProcessingResult {
  batchId: string;
  totalProcessed: number;
  matchExact: number;
  underpayment: number;
  missingInPayroll: number;
  overpayment: number;
  notInPortfolio: number;
}

interface ActivePortfolioLoanRow {
  loan_account_id: string;
  expediente_id: string;
  fortnightly_payment: number;
  blind_curp: string;
  curp_masked: string;
  full_name: string;
  product_type: string;
}

interface LastAppBalanceRow {
  balance_after: number;
  arrears_insurance_after: number;
  arrears_interest_after: number;
  arrears_vat_after: number;
  credit_balance_after: number;
}

export async function processReconciliationBatch(
  agreementName: string,
  fortnightPeriod: string,
  officerEmail: string,
  officerRole: UserRole | string,
  rows: PreparedPayrollRow[]
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

    const activeLoans = await tx.query<ActivePortfolioLoanRow>(
      `SELECT l.id AS loan_account_id, l.expediente_id, l.fortnightly_payment, e.blind_curp, e.curp_masked, e.full_name, e.product_type
       FROM loan_accounts l
       JOIN expedientes e ON l.expediente_id = e.id
       WHERE e.convenio = $1 AND e.status = 'activo'`,
      [agreementName]
    );

    const loanMap = new Map<string, ActivePortfolioLoanRow>();
    activeLoans.rows.forEach((l) => loanMap.set(l.blind_curp, l));

    let matchExact = 0;
    let underpayment = 0;
    let overpayment = 0;
    let missingInPayroll = 0;
    let notInPortfolio = 0;
    let totalExpected = new Decimal(0);
    let totalReceived = new Decimal(0);

    await tx.execute(
      `INSERT INTO reconciliation_batches (
        id, created_at, agreement_name, fortnight_period, total_records, total_amount_expected, total_amount_received, status, officer_email, batch_manifest_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        batchId,
        new Date().toISOString(),
        agreementName,
        fortnightPeriod,
        rows.length,
        0,
        0,
        'procesando',
        officerEmail,
        'PENDING_HASH',
      ]
    );

    const processItem = async (
      row: PreparedPayrollRow | null,
      loanInfo: ActivePortfolioLoanRow | undefined
    ) => {
      const itemId = `ri_${crypto.randomBytes(6).toString('hex')}`;
      const actualAmount = row ? row.amount : new Decimal(0);
      const expectedAmount = loanInfo ? new Decimal(loanInfo.fortnightly_payment) : new Decimal(0);
      let status: string;

      totalExpected = totalExpected.plus(expectedAmount);
      totalReceived = totalReceived.plus(actualAmount);

      if (!loanInfo) {
        status = 'NOT_IN_PORTFOLIO';
        notInPortfolio++;
      } else if (!row) {
        status = 'MISSING_IN_PAYROLL';
        missingInPayroll++;
      } else {
        const diff = actualAmount.minus(expectedAmount);
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
      }

      const diff = actualAmount.minus(expectedAmount);

      await tx.execute(
        `INSERT INTO reconciliation_items (
          id, batch_id, expediente_id, blind_curp, curp_masked, employee_name, expected_payment, actual_payment, difference, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          itemId,
          batchId,
          loanInfo?.expediente_id ?? null,
          row ? row.blindCurp : loanInfo!.blind_curp,
          row ? row.curpMasked : loanInfo!.curp_masked,
          row ? row.name : loanInfo!.full_name,
          expectedAmount.toNumber(),
          actualAmount.toNumber(),
          diff.toNumber(),
          status,
        ]
      );

      if (loanInfo) {
        const lastAppRes = await tx.query<LastAppBalanceRow>(
          `SELECT balance_after, arrears_insurance_after, arrears_interest_after, arrears_vat_after, credit_balance_after
           FROM loan_payment_applications
           WHERE expediente_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [loanInfo.expediente_id]
        );

        let currentState: LoanState;
        if (lastAppRes.rowCount > 0 && lastAppRes.rows[0]) {
          const s = lastAppRes.rows[0];
          currentState = {
            balance: new Decimal(s.balance_after),
            arrearsInsurance: new Decimal(s.arrears_insurance_after),
            arrearsInterest: new Decimal(s.arrears_interest_after),
            arrearsVat: new Decimal(s.arrears_vat_after),
            creditBalance: new Decimal(s.credit_balance_after),
          };
        } else {
          const loanAccountRes = await tx.query<{ principal_original: number }>(
            `SELECT principal_original FROM loan_accounts WHERE expediente_id = $1`,
            [loanInfo.expediente_id]
          );
          const origPrincipal = loanAccountRes.rows[0]?.principal_original ?? 0;
          currentState = {
            balance: new Decimal(origPrincipal),
            arrearsInsurance: new Decimal(0),
            arrearsInterest: new Decimal(0),
            arrearsVat: new Decimal(0),
            creditBalance: new Decimal(0),
          };
        }

        const due = computeDue(currentState, loanInfo.product_type as ProductId, expectedAmount);
        const app = applyWaterfall(actualAmount, due, currentState);
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
            loanInfo.loan_account_id || loanInfo.expediente_id,
            loanInfo.expediente_id,
            batchId,
            itemId,
            fortnightPeriod,
            actualAmount.toNumber(),
            due.insurance.toNumber(),
            due.interest.toNumber(),
            due.vat.toNumber(),
            due.capital.toNumber(),
            app.applied.insurance.toNumber(),
            app.applied.interest.toNumber(),
            app.applied.vat.toNumber(),
            app.applied.capital.toNumber(),
            currentState.balance.toNumber(),
            app.next.balance.toNumber(),
            app.next.arrearsInsurance.toNumber(),
            app.next.arrearsInterest.toNumber(),
            app.next.arrearsVat.toNumber(),
            app.next.creditBalance.toNumber(),
          ]
        );

        await auditEventStore.appendInTx(tx, {
          action: 'PAYMENT_APPLIED',
          actorEmail: officerEmail,
          actorRole: safeRole,
          outcome: 'success',
          sourceIp: '127.0.0.1',
          sourceSummary: 'reconciliationEngine',
          expedienteId: loanInfo.expediente_id,
          details: `Aplicación de pago por ${actualAmount.toNumber()} para quincena ${fortnightPeriod}.`,
        });
      }
    };

    for (const row of rows) {
      const loanInfo = loanMap.get(row.blindCurp);
      await processItem(row, loanInfo);
      if (loanInfo) {
        loanMap.delete(row.blindCurp);
      }
    }

    for (const loanInfo of loanMap.values()) {
      await processItem(null, loanInfo);
    }

    const hasDiscrepancies = underpayment > 0 || missingInPayroll > 0 || notInPortfolio > 0;
    const finalStatus = hasDiscrepancies ? 'cerrado_con_discrepancias' : 'conciliado_total';
    const totalRecords = matchExact + underpayment + overpayment + missingInPayroll + notInPortfolio;

    const manifestPayload = JSON.stringify({
      batchId,
      totalExpected,
      totalReceived,
      agreementName,
      fortnightPeriod,
    });
    const batchManifestHash = crypto.createHash('sha256').update(manifestPayload).digest('hex');

    await tx.execute(
      `UPDATE reconciliation_batches 
       SET total_records = $1, total_amount_expected = $2, total_amount_received = $3, status = $4, batch_manifest_hash = $5
       WHERE id = $6`,
      [
        totalRecords,
        totalExpected.toNumber(),
        totalReceived.toNumber(),
        finalStatus,
        batchManifestHash,
        batchId,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'RECONCILIATION_BATCH_SEALED',
      actorEmail: officerEmail,
      actorRole: safeRole,
      outcome: 'success',
      sourceIp: '127.0.0.1',
      sourceSummary: 'reconciliationEngine',
      details: `Lote ${batchId} cerrado. Status: ${finalStatus}. Hash: ${batchManifestHash}`,
    });

    return {
      batchId,
      totalProcessed: totalRecords,
      matchExact,
      underpayment,
      missingInPayroll,
      overpayment,
      notInPortfolio,
    };
  });
}
