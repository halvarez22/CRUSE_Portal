/**
 * SERVICIO DE LÍNEA ABIERTA — CRÉDITO ESPECIAL SIN TABLA DE AMORTIZACIÓN
 *
 * @implements RN-01 (Crédito Especial Revolvente sin calendario fijo de amortización)
 * @implements Condición 1 WORM (Cero UPDATE sobre loan_accounts; saldo calculado algebraicamente desde special_credit_movements)
 * @implements Restricción Forense 1 (Precisión máxima Decimal.js en cálculos intermedios; redondeo tardío ROUND_HALF_UP solo al persistir)
 * @implements Guardrail Forense 1 (CRUSE-APO-2026-023: Sintaxis posicional nativa de PostgreSQL $1, $2... y transacciones asíncronas)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db, TxHandle } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import {
  FINANCIAL_CONSTANTS,
  LegalPaymentCapacityCheck,
  validateLegalPaymentCapacityLft110,
} from '../../config/financialConstants';
import { UserRole } from '../../types';

export type SpecialMovementType = 'DISPOSICION' | 'ABONO' | 'CARGO_INTERES';
export type SpecialDisbursementMethod = 'SPEI' | 'CHEQUE' | 'EFECTIVO' | 'TRANSFERENCIA';
export type SpecialCreditVatRegime = 'ADDED' | 'EXEMPT' | 'INCLUDED';

export interface SpecialCreditAccrualInput {
  balanceMxn: number | string | Decimal;
  monthlyRate: number | string | Decimal;
  daysElapsed: number | string | Decimal;
  vatRegime: SpecialCreditVatRegime;
}

export interface SpecialCreditAccrualResult {
  balanceMxn: string;
  monthlyRate: string;
  daysElapsed: string;
  vatRegime: SpecialCreditVatRegime;
  netInterest: string;
  vatAmount: string;
  totalInterestWithVat: string;
}

export interface RenewalDtiAuditInput {
  priorLoanId: string;
  priorLoanBalanceToLiquidate: number | string | Decimal;
  newPrincipalAmount: number | string | Decimal;
  newPeriodicPayment: number | string | Decimal;
  currentNetPeriodicIncome: number | string | Decimal;
  oficioPrimerPago?: string | null;
  oficioSuspension?: string | null;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp?: string;
}

export interface RenewalDtiAuditResult {
  priorLoanId: string;
  priorContractNumber: string;
  priorLoanBalanceLiquidated: string;
  periodicDiscountReleased: string;
  adjustedNetIncome: string;
  netDisbursementCheckAmount: string;
  priorLoanContractSha256: string;
  dtiCheck: LegalPaymentCapacityCheck;
}

export interface SpecialCreditMovementRow {
  id: string;
  loan_account_id: string;
  movement_date: string;
  movement_type: SpecialMovementType;
  amount: number;
  balance_before: number;
  balance_after: number;
  disbursement_method: SpecialDisbursementMethod | null;
  reference_number: string | null;
  recorded_by: string;
  created_at: string;
}

export interface SpecialCreditAccountRow {
  id: string;
  contract_number: string;
  expediente_id: string;
  principal_original: number;
  product_type: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL';
  status: string;
}

export interface RecordSpecialMovementInput {
  loanAccountId: string;
  movementDate: string;
  movementType: SpecialMovementType;
  amount: number | string;
  disbursementMethod?: SpecialDisbursementMethod | null;
  referenceNumber?: string | null;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp?: string;
}

export interface SpecialCreditBalanceSummary {
  loanAccountId: string;
  contractNumber: string;
  expedienteId: string;
  principalOriginal: number;
  totalDisposiciones: number;
  totalCargosInteres: number;
  totalAbonos: number;
  liveBalance: number;
  movementsCount: number;
}

async function computeLiveBalanceInTx(
  tx: TxHandle,
  loanAccountId: string
): Promise<{
  account: SpecialCreditAccountRow;
  liveBalanceExact: Decimal;
  totalDisposicionesExact: Decimal;
  totalCargosInteresExact: Decimal;
  totalAbonosExact: Decimal;
  movementsCount: number;
}> {
  const accRes = await tx.query<SpecialCreditAccountRow>(
    `SELECT id, contract_number, expediente_id, principal_original, product_type, status
     FROM loan_accounts
     WHERE id = $1`,
    [loanAccountId]
  );

  if (accRes.rowCount === 0 || !accRes.rows[0]) {
    throw new Error(`Cuenta de crédito '${loanAccountId}' no encontrada.`);
  }

  const account = accRes.rows[0];
  if (account.product_type !== 'ESPECIAL') {
    throw new Error(
      `REGLA DE NEGOCIO RN-01: La cuenta '${loanAccountId}' es de tipo '${account.product_type}'. Solo las cuentas 'ESPECIAL' admiten movimientos de línea abierta.`
    );
  }

  const movRes = await tx.query<{ movement_type: SpecialMovementType; amount: number }>(
    `SELECT movement_type, amount
     FROM special_credit_movements
     WHERE loan_account_id = $1
     ORDER BY created_at ASC, id ASC`,
    [loanAccountId]
  );

  const principalOriginal = new Decimal(account.principal_original);
  let totalDisposicionesExact = new Decimal(0);
  let totalCargosInteresExact = new Decimal(0);
  let totalAbonosExact = new Decimal(0);

  for (const mov of movRes.rows) {
    const movAmount = new Decimal(mov.amount);
    if (mov.movement_type === 'DISPOSICION') {
      totalDisposicionesExact = totalDisposicionesExact.plus(movAmount);
    } else if (mov.movement_type === 'CARGO_INTERES') {
      totalCargosInteresExact = totalCargosInteresExact.plus(movAmount);
    } else if (mov.movement_type === 'ABONO') {
      totalAbonosExact = totalAbonosExact.plus(movAmount);
    }
  }

  const liveBalanceExact = principalOriginal
    .plus(totalDisposicionesExact)
    .plus(totalCargosInteresExact)
    .minus(totalAbonosExact);

  return {
    account,
    liveBalanceExact,
    totalDisposicionesExact,
    totalCargosInteresExact,
    totalAbonosExact,
    movementsCount: movRes.rowCount,
  };
}

export async function getSpecialCreditBalanceSummary(
  loanAccountId: string
): Promise<SpecialCreditBalanceSummary> {
  return db.transaction(async (tx) => {
    const {
      account,
      liveBalanceExact,
      totalDisposicionesExact,
      totalCargosInteresExact,
      totalAbonosExact,
      movementsCount,
    } = await computeLiveBalanceInTx(tx, loanAccountId);

    return {
      loanAccountId: account.id,
      contractNumber: account.contract_number,
      expedienteId: account.expediente_id,
      principalOriginal: new Decimal(account.principal_original)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber(),
      totalDisposiciones: totalDisposicionesExact
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber(),
      totalCargosInteres: totalCargosInteresExact
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber(),
      totalAbonos: totalAbonosExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      liveBalance: liveBalanceExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      movementsCount,
    };
  });
}

export async function recordSpecialCreditMovement(
  input: RecordSpecialMovementInput
): Promise<SpecialCreditMovementRow> {
  const rawAmount = new Decimal(input.amount);
  if (!rawAmount.isFinite() || rawAmount.lte(0)) {
    throw new Error('El monto del movimiento de Crédito Especial debe ser estrictamente mayor a 0.');
  }

  return db.transaction(async (tx) => {
    const { account, liveBalanceExact } = await computeLiveBalanceInTx(tx, input.loanAccountId);

    const nextBalanceExact =
      input.movementType === 'ABONO'
        ? liveBalanceExact.minus(rawAmount)
        : liveBalanceExact.plus(rawAmount);

    const balanceBeforePersisted = liveBalanceExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const amountPersisted = rawAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const balanceAfterPersisted = nextBalanceExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    if (balanceAfterPersisted.isNegative()) {
      throw new Error(
        `El abono ($${amountPersisted.toFixed(2)}) excede el saldo insoluto actual ($${balanceBeforePersisted.toFixed(2)}) del Crédito Especial.`
      );
    }

    const movementId = `scm_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const disbursementMethod = input.disbursementMethod ?? null;
    const referenceNumber = input.referenceNumber ?? null;

    await tx.execute(
      `INSERT INTO special_credit_movements (
        id, loan_account_id, movement_date, movement_type, amount,
        balance_before, balance_after, disbursement_method, reference_number, recorded_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        movementId,
        account.id,
        input.movementDate,
        input.movementType,
        amountPersisted.toNumber(),
        balanceBeforePersisted.toNumber(),
        balanceAfterPersisted.toNumber(),
        disbursementMethod,
        referenceNumber,
        input.actorEmail,
        createdAt,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'PAYMENT_APPLIED',
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      outcome: 'success',
      sourceIp: input.sourceIp ?? '127.0.0.1',
      sourceSummary: 'specialCreditService',
      expedienteId: account.expediente_id,
      details: JSON.stringify({
        event: 'SPECIAL_CREDIT_MOVEMENT_RECORDED',
        loan_account_id: account.id,
        contract_number: account.contract_number,
        movement_id: movementId,
        movement_type: input.movementType,
        amount: amountPersisted.toNumber(),
        balance_before: balanceBeforePersisted.toNumber(),
        balance_after: balanceAfterPersisted.toNumber(),
        reference_number: referenceNumber,
      }),
    });

    return {
      id: movementId,
      loan_account_id: account.id,
      movement_date: input.movementDate,
      movement_type: input.movementType,
      amount: amountPersisted.toNumber(),
      balance_before: balanceBeforePersisted.toNumber(),
      balance_after: balanceAfterPersisted.toNumber(),
      disbursement_method: disbursementMethod,
      reference_number: referenceNumber,
      recorded_by: input.actorEmail,
      created_at: createdAt,
    };
  });
}

/**
 * Guardrail Forense 2 (CRUSE-APO-2026-063): Cálculo de devengo de Crédito Especial ('1. CREDITO ESPECIAL.xlsx')
 * con tasa mensual de hasta 5.0% sobre base 30.4 días y soporte para los 3 regímenes de IVA del SAT:
 * - 'ADDED':    +16% IVA adicional sobre interés bruto
 * - 'EXEMPT':   0% IVA (Efectivo / Actividad Empresarial Art. 15 LIVA)
 * - 'INCLUDED': Desglose inverso (/ 1.16) con redondeo ROUND_HALF_UP garantizando netInterest + vatAmount === totalInterestWithVat
 */
export function calculateSpecialCreditAccrualWithVatRegime(
  input: SpecialCreditAccrualInput
): SpecialCreditAccrualResult {
  const balanceDec = new Decimal(input.balanceMxn).toDP(2, Decimal.ROUND_HALF_UP);
  const rateDec = new Decimal(input.monthlyRate);
  const daysDec = new Decimal(input.daysElapsed);
  const maxRateDec = new Decimal(FINANCIAL_CONSTANTS.ESPECIAL_MONTHLY_RATE_MAX);

  if (balanceDec.lte(0)) {
    throw new Error('El saldo base del Crédito Especial debe ser mayor a $0.00 MXN.');
  }
  if (rateDec.lte(0) || rateDec.gt(maxRateDec)) {
    throw new Error(
      `La tasa mensual (${rateDec.times(100).toFixed(2)}%) excede el tope autorizado de ${maxRateDec.times(100).toFixed(2)}% para Crédito Especial.`
    );
  }
  if (daysDec.lte(0)) {
    throw new Error('Los días transcurridos deben ser mayores a 0.');
  }

  const avgMonthDays = new Decimal(String(FINANCIAL_CONSTANTS.INVESTOR_AVG_MONTH_DAYS));
  const dailyRate = rateDec.dividedBy(avgMonthDays);
  const rawInterest = balanceDec
    .times(dailyRate)
    .times(daysDec)
    .toDP(2, Decimal.ROUND_HALF_UP);

  let netInterest: Decimal;
  let vatAmount: Decimal;
  let totalInterestWithVat: Decimal;

  if (input.vatRegime === 'INCLUDED') {
    totalInterestWithVat = rawInterest;
    netInterest = totalInterestWithVat
      .dividedBy(new Decimal('1.16'))
      .toDP(2, Decimal.ROUND_HALF_UP);
    vatAmount = totalInterestWithVat.minus(netInterest).toDP(2, Decimal.ROUND_HALF_UP);
  } else if (input.vatRegime === 'EXEMPT') {
    netInterest = rawInterest;
    vatAmount = new Decimal(0).toDP(2, Decimal.ROUND_HALF_UP);
    totalInterestWithVat = netInterest;
  } else {
    netInterest = rawInterest;
    vatAmount = netInterest
      .times(new Decimal(FINANCIAL_CONSTANTS.VAT_RATE))
      .toDP(2, Decimal.ROUND_HALF_UP);
    totalInterestWithVat = netInterest.plus(vatAmount).toDP(2, Decimal.ROUND_HALF_UP);
  }

  return {
    balanceMxn: balanceDec.toFixed(2),
    monthlyRate: rateDec.toFixed(6),
    daysElapsed: daysDec.toFixed(2),
    vatRegime: input.vatRegime,
    netInterest: netInterest.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    totalInterestWithVat: totalInterestWithVat.toFixed(2),
  };
}

/**
 * Guardrail Forense 3 (CRUSE-APO-2026-063): Evaluación y sellado WORM de liberación de capacidad 30% LFT
 * para renovaciones ('Q. EMISION simulador y carga.xlsx' y 'M. EMISION MENSUAL.xlsx').
 * Verifica que priorLoanId exista en BD, que el saldo a liquidar cuadre al centavo con el saldo insoluto real,
 * y sella el evento WORM DTI_CAPACITY_RELEASED_FOR_RENEWAL con el hash SHA-256 del contrato anterior.
 */
export async function evaluateAndAuditRenewalDtiCapacity(
  input: RenewalDtiAuditInput
): Promise<RenewalDtiAuditResult> {
  const cleanPriorId = String(input.priorLoanId ?? '').trim();
  if (!cleanPriorId) {
    throw new Error('Guardrail 3: Se requiere priorLoanId válido para procesar una renovación.');
  }

  return db.transaction(async (tx) => {
    const loanRes = await tx.query<{
      id: string;
      contract_number: string;
      expediente_id: string;
      principal_original: string | number;
      fortnightly_payment: string | number;
      product_type: string;
      activated_at: string | Date;
    }>(
      `SELECT id, contract_number, expediente_id, principal_original, fortnightly_payment, product_type, activated_at
       FROM loan_accounts WHERE id = $1`,
      [cleanPriorId]
    );

    const priorLoan = loanRes.rows[0];
    if (!priorLoan) {
      throw new Error(`Guardrail 3: El crédito anterior '${cleanPriorId}' no existe en la base de datos.`);
    }

    const paidRes = await tx.query<{ total_cap: string | number | null }>(
      `SELECT COALESCE(SUM(applied_capital), 0) AS total_cap FROM loan_payment_applications WHERE loan_account_id = $1`,
      [priorLoan.id]
    );
    const paidCapDec = new Decimal(paidRes.rows[0]?.total_cap ?? 0);
    const realLiveBalanceDec = Decimal.max(
      new Decimal(0),
      new Decimal(priorLoan.principal_original).minus(paidCapDec)
    ).toDP(2, Decimal.ROUND_HALF_UP);

    const declaredBalanceDec = new Decimal(input.priorLoanBalanceToLiquidate).toDP(
      2,
      Decimal.ROUND_HALF_UP
    );
    if (!declaredBalanceDec.equals(realLiveBalanceDec)) {
      throw new Error(
        `Guardrail 3: El saldo a liquidar declarado ($${declaredBalanceDec.toFixed(2)}) no cuadra con el saldo insoluto real en BD ($${realLiveBalanceDec.toFixed(2)}) para el contrato ${priorLoan.contract_number}.`
      );
    }

    const periodicDiscountReleasedDec = new Decimal(priorLoan.fortnightly_payment).toDP(
      2,
      Decimal.ROUND_HALF_UP
    );
    const priorLoanContractSha256 = crypto
      .createHash('sha256')
      .update(
        `${priorLoan.id}|${priorLoan.contract_number}|${priorLoan.expediente_id}|${realLiveBalanceDec.toFixed(2)}`,
        'utf8'
      )
      .digest('hex');

    const dtiCheck = validateLegalPaymentCapacityLft110(
      input.newPeriodicPayment,
      input.currentNetPeriodicIncome,
      {
        isRenewal: true,
        previousLoanPeriodicDiscountToRelease: periodicDiscountReleasedDec,
        previousLoanBalanceToLiquidate: realLiveBalanceDec,
        requestedPrincipal: input.newPrincipalAmount,
      }
    );

    await auditEventStore.appendInTx(tx, {
      action: 'DTI_CAPACITY_RELEASED_FOR_RENEWAL',
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      outcome: dtiCheck.isValid ? 'success' : 'denied',
      sourceIp: input.sourceIp ?? '127.0.0.1',
      sourceSummary: 'specialCreditService:evaluateAndAuditRenewalDtiCapacity',
      expedienteId: priorLoan.expediente_id,
      details: JSON.stringify({
        priorLoanId: priorLoan.id,
        priorContractNumber: priorLoan.contract_number,
        priorLoanBalanceLiquidated: realLiveBalanceDec.toFixed(2),
        periodicDiscountReleased: periodicDiscountReleasedDec.toFixed(2),
        adjustedNetIncome: dtiCheck.adjustedNetIncome,
        netDisbursementCheckAmount: dtiCheck.netDisbursementCheckAmount,
        priorLoanContractSha256,
        oficioPrimerPago: input.oficioPrimerPago ?? null,
        oficioSuspension: input.oficioSuspension ?? null,
        isValidLft110: dtiCheck.isValid,
      }),
    });

    return {
      priorLoanId: priorLoan.id,
      priorContractNumber: priorLoan.contract_number,
      priorLoanBalanceLiquidated: realLiveBalanceDec.toFixed(2),
      periodicDiscountReleased: periodicDiscountReleasedDec.toFixed(2),
      adjustedNetIncome: dtiCheck.adjustedNetIncome,
      netDisbursementCheckAmount: dtiCheck.netDisbursementCheckAmount,
      priorLoanContractSha256,
      dtiCheck,
    };
  });
}
