/**
 * SERVICIO DE APLICACIÓN DE PAGOS — WATERFALL AUTOMÁTICO Y DESGLOSE MANUAL (MANUAL_OVERRIDE)
 *
 * @implements RN-13 (Prelación Estándar vs Desglose Manual en Pagos Parciales)
 * @implements Condición 2 (Ecuación Contable Invariante: applied_insurance + applied_interest + applied_vat + applied_capital === amount_received)
 * @implements Restricción Forense 1 (Precisión máxima Decimal.js en cálculos intermedios; redondeo tardío ROUND_HALF_UP solo al persistir/validar ecuación)
 * @implements Restricción Forense 2 (Atomicidad transaccional estricta BEGIN IMMEDIATE ... COMMIT envolviendo validación + INSERT WORM + auditEventStore.appendInTx)
 * @implements Restricción Forense 3 (Payload JSON de auditoría forense con el desglose exacto aprobado manualmente)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { computeDue, applyWaterfall, LoanState } from './paymentWaterfall';
import { auditEventStore } from '../audit/auditEventStore';
import { ProductId, UserRole } from '../../types';

export type PaymentAllocationMode = 'AUTOMATIC' | 'MANUAL_OVERRIDE';

export interface ManualAllocationBreakdown {
  appliedInsurance: number | string;
  appliedInterest: number | string;
  appliedVat: number | string;
  appliedCapital: number | string;
}

export interface ApplyLoanPaymentInput {
  loanAccountId: string;
  batchId: string;
  reconciliationItemId: string;
  fortnightPeriod: string;
  amountReceived: number | string;
  allocationMode: PaymentAllocationMode;
  manualBreakdown?: ManualAllocationBreakdown;
  overrideReason?: string;
  authorizedBy: string;
  actorRole: UserRole;
  sourceIp?: string;
}

export interface AppliedLoanPaymentRecord {
  id: string;
  loanAccountId: string;
  expedienteId: string;
  batchId: string;
  reconciliationItemId: string;
  fortnightPeriod: string;
  amountReceived: number;
  appliedInsurance: number;
  appliedInterest: number;
  appliedVat: number;
  appliedCapital: number;
  balanceBefore: number;
  balanceAfter: number;
  allocationMode: PaymentAllocationMode;
  overrideReason: string | null;
  authorizedBy: string | null;
}

interface LoanAccountContextRow {
  id: string;
  expediente_id: string;
  principal_original: number;
  fortnightly_payment: number;
  product_type: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL';
}

interface LastApplicationStateRow {
  balance_after: number;
  arrears_insurance_after: number;
  arrears_interest_after: number;
  arrears_vat_after: number;
  credit_balance_after: number;
}

/**
 * Registra atómicamente la aplicación de un pago en `loan_payment_applications` (WORM),
 * soportando tanto prelación estándar (`AUTOMATIC`) como desglose manual (`MANUAL_OVERRIDE`).
 *
 * @implements RN-13
 */
export function applyLoanPayment(input: ApplyLoanPaymentInput): AppliedLoanPaymentRecord {
  // Restricción Forense 2: Transacción explícita BEGIN IMMEDIATE ... COMMIT
  return db.transaction((tx) => {
    const accountRes = tx.query<LoanAccountContextRow>(
      `SELECT id, expediente_id, principal_original, fortnightly_payment, product_type
       FROM loan_accounts
       WHERE id = ?`,
      [input.loanAccountId]
    );

    if (accountRes.rowCount === 0 || !accountRes.rows[0]) {
      throw new Error(`Cuenta de crédito '${input.loanAccountId}' no encontrada.`);
    }

    const loanAccount = accountRes.rows[0];
    const lastAppRes = tx.query<LastApplicationStateRow>(
      `SELECT balance_after, arrears_insurance_after, arrears_interest_after, arrears_vat_after, credit_balance_after
       FROM loan_payment_applications
       WHERE loan_account_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [loanAccount.id]
    );

    const currentState: LoanState =
      lastAppRes.rowCount > 0 && lastAppRes.rows[0]
        ? {
            balance: new Decimal(lastAppRes.rows[0].balance_after),
            arrearsInsurance: new Decimal(lastAppRes.rows[0].arrears_insurance_after),
            arrearsInterest: new Decimal(lastAppRes.rows[0].arrears_interest_after),
            arrearsVat: new Decimal(lastAppRes.rows[0].arrears_vat_after),
            creditBalance: new Decimal(lastAppRes.rows[0].credit_balance_after),
          }
        : {
            balance: new Decimal(loanAccount.principal_original),
            arrearsInsurance: new Decimal(0),
            arrearsInterest: new Decimal(0),
            arrearsVat: new Decimal(0),
            creditBalance: new Decimal(0),
          };

    const productForDue: ProductId = loanAccount.product_type === 'EXPRESS' ? 'express' : 'normal';
    const expectedPayment = new Decimal(loanAccount.fortnightly_payment);
    const due = computeDue(currentState, productForDue, expectedPayment);
    const receivedExact = new Decimal(input.amountReceived);

    if (!receivedExact.isFinite() || receivedExact.lt(0)) {
      throw new Error('El monto recibido (amountReceived) no puede ser negativo.');
    }

    let appliedInsuranceExact: Decimal;
    let appliedInterestExact: Decimal;
    let appliedVatExact: Decimal;
    let appliedCapitalExact: Decimal;
    let nextState: LoanState;
    let overrideReasonValue: string | null = null;
    let authorizedByValue: string | null = null;

    if (input.allocationMode === 'MANUAL_OVERRIDE') {
      if (!input.manualBreakdown) {
        throw new Error('REGLA DE NEGOCIO RN-13: Se requiere manualBreakdown cuando allocationMode es MANUAL_OVERRIDE.');
      }
      const trimmedReason = input.overrideReason?.trim() ?? '';
      if (trimmedReason.length < 5) {
        throw new Error('REGLA DE NEGOCIO RN-13: Se requiere una justificación explícita (overrideReason) para aplicar MANUAL_OVERRIDE.');
      }
      const trimmedAuth = input.authorizedBy?.trim() ?? '';
      if (!trimmedAuth) {
        throw new Error('REGLA DE NEGOCIO RN-13: Se requiere authorizedBy para aplicar MANUAL_OVERRIDE.');
      }

      // Restricción Forense 1: Cálculos intermedios en precisión máxima Decimal.js sin redondeo intermedio
      appliedInsuranceExact = new Decimal(input.manualBreakdown.appliedInsurance);
      appliedInterestExact = new Decimal(input.manualBreakdown.appliedInterest);
      appliedVatExact = new Decimal(input.manualBreakdown.appliedVat);
      appliedCapitalExact = new Decimal(input.manualBreakdown.appliedCapital);

      if (
        appliedInsuranceExact.isNegative() ||
        appliedInterestExact.isNegative() ||
        appliedVatExact.isNegative() ||
        appliedCapitalExact.isNegative()
      ) {
        throw new Error('REGLA DE NEGOCIO RN-13: Ningún rubro del desglose manual puede ser negativo.');
      }

      const sumManualExact = appliedInsuranceExact
        .plus(appliedInterestExact)
        .plus(appliedVatExact)
        .plus(appliedCapitalExact);

      // Validación final de la ecuación contable con redondeo tardío ROUND_HALF_UP
      const sumPersisted = sumManualExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const receivedPersisted = receivedExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      if (!sumPersisted.equals(receivedPersisted)) {
        throw new Error(
          `VIOLACIÓN DE ECUACIÓN CONTABLE (RN-13): La suma del desglose manual ($${sumPersisted.toFixed(2)}) no cuadra exactamente con el monto recibido ($${receivedPersisted.toFixed(2)}).`
        );
      }

      const owedInsExact = due.insurance.plus(currentState.arrearsInsurance);
      const owedIntExact = due.interest.plus(currentState.arrearsInterest);
      const owedVatExact = due.vat.plus(currentState.arrearsVat);

      nextState = {
        balance: Decimal.max(0, currentState.balance.minus(appliedCapitalExact)),
        arrearsInsurance: Decimal.max(0, owedInsExact.minus(appliedInsuranceExact)),
        arrearsInterest: Decimal.max(0, owedIntExact.minus(appliedInterestExact)),
        arrearsVat: Decimal.max(0, owedVatExact.minus(appliedVatExact)),
        creditBalance: currentState.creditBalance,
      };

      overrideReasonValue = trimmedReason;
      authorizedByValue = trimmedAuth;
    } else {
      const waterfallResult = applyWaterfall(receivedExact, due, currentState);
      appliedInsuranceExact = waterfallResult.applied.insurance;
      appliedInterestExact = waterfallResult.applied.interest;
      appliedVatExact = waterfallResult.applied.vat;
      appliedCapitalExact = waterfallResult.applied.capital;
      nextState = waterfallResult.next;
    }

    // Restricción Forense 1: Redondeo tardío a 2 decimales exclusivamente al persistir en BD
    const amountReceivedNum = receivedExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const dueInsNum = due.insurance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const dueIntNum = due.interest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const dueVatNum = due.vat.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const dueCapNum = due.capital.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    const appInsNum = appliedInsuranceExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const appIntNum = appliedInterestExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const appVatNum = appliedVatExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const appCapNum = appliedCapitalExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    const balBeforeNum = currentState.balance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const balAfterNum = nextState.balance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const arrInsAfterNum = nextState.arrearsInsurance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const arrIntAfterNum = nextState.arrearsInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const arrVatAfterNum = nextState.arrearsVat.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const credBalAfterNum = nextState.creditBalance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    const appId = `lpa_${crypto.randomUUID()}`;

    tx.execute(
      `INSERT INTO loan_payment_applications (
        id, loan_account_id, expediente_id, batch_id, reconciliation_item_id, fortnight_period, amount_received,
        due_insurance, due_interest, due_vat, due_capital,
        applied_insurance, applied_interest, applied_vat, applied_capital,
        balance_before, balance_after,
        arrears_insurance_after, arrears_interest_after, arrears_vat_after, credit_balance_after,
        allocation_mode, override_reason, authorized_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appId,
        loanAccount.id,
        loanAccount.expediente_id,
        input.batchId,
        input.reconciliationItemId,
        input.fortnightPeriod,
        amountReceivedNum,
        dueInsNum,
        dueIntNum,
        dueVatNum,
        dueCapNum,
        appInsNum,
        appIntNum,
        appVatNum,
        appCapNum,
        balBeforeNum,
        balAfterNum,
        arrInsAfterNum,
        arrIntAfterNum,
        arrVatAfterNum,
        credBalAfterNum,
        input.allocationMode,
        overrideReasonValue,
        authorizedByValue,
      ]
    );

    // Restricción Forense 3: Payload de Auditoría Forense con el desglose exacto aprobado manualmente
    const auditDetails =
      input.allocationMode === 'MANUAL_OVERRIDE'
        ? JSON.stringify({
            action: 'PAYMENT_MANUAL_OVERRIDE_APPLIED',
            loan_account_id: loanAccount.id,
            amount_received: amountReceivedNum,
            manual_allocation: {
              applied_insurance: appInsNum,
              applied_interest: appIntNum,
              applied_vat: appVatNum,
              applied_capital: appCapNum,
            },
            override_reason: overrideReasonValue,
            authorized_by: authorizedByValue,
          })
        : `Aplicación automática de pago por ${amountReceivedNum} para quincena ${input.fortnightPeriod} en cuenta ${loanAccount.id}.`;

    auditEventStore.appendInTx(tx, {
      action: 'PAYMENT_APPLIED',
      actorEmail: input.authorizedBy,
      actorRole: input.actorRole,
      outcome: 'success',
      sourceIp: input.sourceIp ?? '127.0.0.1',
      sourceSummary: 'loanPaymentApplicationService',
      expedienteId: loanAccount.expediente_id,
      details: auditDetails,
    });

    return {
      id: appId,
      loanAccountId: loanAccount.id,
      expedienteId: loanAccount.expediente_id,
      batchId: input.batchId,
      reconciliationItemId: input.reconciliationItemId,
      fortnightPeriod: input.fortnightPeriod,
      amountReceived: amountReceivedNum,
      appliedInsurance: appInsNum,
      appliedInterest: appIntNum,
      appliedVat: appVatNum,
      appliedCapital: appCapNum,
      balanceBefore: balBeforeNum,
      balanceAfter: balAfterNum,
      allocationMode: input.allocationMode,
      overrideReason: overrideReasonValue,
      authorizedBy: authorizedByValue,
    };
  });
}
