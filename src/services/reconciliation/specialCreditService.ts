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
import { UserRole } from '../../types';

export type SpecialMovementType = 'DISPOSICION' | 'ABONO' | 'CARGO_INTERES';
export type SpecialDisbursementMethod = 'SPEI' | 'CHEQUE' | 'EFECTIVO' | 'TRANSFERENCIA';

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
