/**
 * ORQUESTADOR DE CORTE MENSUAL DE FONDEO E INVERSIONISTAS (SIMPLE Y COMPUESTO / CAPITALIZABLE)
 *
 * @implements RN-09 (Capitalización automática mensual para inversiones COMPOUND)
 * @implements RN-10 (Exención de retención de ISR cuando investors.applies_isr = 0)
 * @implements RN-11 (Cálculo sobre investments.current_capital y registro en investment_capital_movements WORM)
 * @implements Restricción Forense 1 (Precisión máxima Decimal.js en acumuladores; redondeo tardío al retornar)
 * @implements Restricción Forense 2 (Atomicidad transaccional estricta BEGIN IMMEDIATE ... COMMIT: investor_payments + investment_capital_movements + UPDATE current_capital)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { getDaysInMonth, endOfMonth } from 'date-fns';
import { db, DbInputValue } from '../db/connectionPool';
import { kyselyBuilder } from '../db/kyselyConfig';
import { calculateMonthlyYieldAndISR, computeCompoundCapitalization } from './fundingEngine';

export interface FundingCronResult {
  processed: number;
  skipped: number;
  compoundCapitalizedCount: number;
  totalGrossYield: number;
  totalIsrRetained: number;
  totalCapitalizedAmount: number;
}

interface ActiveInvestmentRow {
  id: string;
  investor_id: string;
  interest_type: 'SIMPLE' | 'COMPOUND';
  capital: number;
  current_capital: number;
  annual_rate: number;
  start_date: string;
  isr_retention_rate: number;
  applies_isr: 0 | 1;
}

export interface RecordCapitalMovementInput {
  investmentId: string;
  movementDate: string;
  movementType: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number | string;
  referenceNumber: string;
  recordedBy: string;
}

/**
 * Convierte parámetros compilados de Kysely (`ReadonlyArray<unknown>`) a `DbInputValue[]`
 * con verificación de tipos en tiempo de ejecución y cero uso de `any` (Regla 6 SQA).
 */
function toDbInputValues(params: ReadonlyArray<unknown>): DbInputValue[] {
  return params.map((param): DbInputValue => {
    if (
      param === null ||
      param === undefined ||
      typeof param === 'string' ||
      typeof param === 'number' ||
      typeof param === 'boolean'
    ) {
      return param;
    }
    if (param instanceof Date) {
      return param.toISOString();
    }
    return String(param);
  });
}

/**
 * Ejecuta el corte mensual de fondeo de forma idempotente y atómica.
 *
 * @implements RN-09
 * @implements RN-10
 * @implements RN-11
 */
export async function runMonthlyFundingSettle(
  targetDate: Date,
  actorEmail: string = 'system_funding_cron@cruse.mx'
): Promise<FundingCronResult> {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const daysInMonth = getDaysInMonth(targetDate);
  const paymentDate = endOfMonth(targetDate).toISOString().split('T')[0] ?? '';
  const referencePrefix = `FND-${year}-${String(month + 1).padStart(2, '0')}`;

  let processed = 0;
  let skipped = 0;
  let compoundCapitalizedCount = 0;
  let totalGrossYieldExact = new Decimal(0);
  let totalIsrRetainedExact = new Decimal(0);
  let totalCapitalizedExact = new Decimal(0);

  // Restricción Forense 2: Bloque transaccional único BEGIN IMMEDIATE ... COMMIT
  db.transaction((tx) => {
    const activeInvestments = tx.query<ActiveInvestmentRow>(`
      SELECT
        inv.id,
        inv.investor_id,
        inv.interest_type,
        inv.capital,
        inv.current_capital,
        inv.annual_rate,
        inv.start_date,
        i.isr_retention_rate,
        i.applies_isr
      FROM investments inv
      JOIN investors i ON inv.investor_id = i.id
      WHERE inv.status = 'ACTIVE'
    `).rows;

    for (const inv of activeInvestments) {
      const referenceNumber = `${referencePrefix}-${inv.id}`;

      // Control de Idempotencia por número de referencia mensual
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM investor_payments WHERE reference_number = ?`,
        [referenceNumber]
      );

      if (existing.rowCount > 0) {
        skipped++;
        continue;
      }

      // Base de cálculo: current_capital (RN-11) y exención de ISR según applies_isr (RN-10)
      const baseCapital = inv.current_capital > 0 ? inv.current_capital : inv.capital;
      const yieldResult = calculateMonthlyYieldAndISR(
        baseCapital,
        inv.annual_rate,
        inv.isr_retention_rate,
        daysInMonth,
        inv.applies_isr
      );

      const paymentId = `pmt_${crypto.randomUUID()}`;
      const insertPaymentQuery = kyselyBuilder
        .insertInto('investor_payments')
        .values({
          id: paymentId,
          investor_id: inv.investor_id,
          investment_id: inv.id,
          payment_date: paymentDate,
          gross_yield: yieldResult.grossYield,
          isr_retained: yieldResult.isrRetained,
          net_paid: yieldResult.netYield,
          reference_number: referenceNumber,
        })
        .compile();

      tx.execute(insertPaymentQuery.sql, toDbInputValues(insertPaymentQuery.parameters));

      // RN-09 y Restricción Forense 2: Si es COMPOUND, capitalizar rendimiento neto en la MISMA transacción
      if (inv.interest_type === 'COMPOUND' && yieldResult.netYield > 0) {
        const capTransition = computeCompoundCapitalization(baseCapital, yieldResult.netYield);
        const capMovementId = `icm_${crypto.randomUUID()}`;
        const capRefNumber = `CAP-${year}-${String(month + 1).padStart(2, '0')}-${inv.id}`;

        const insertCapMovQuery = kyselyBuilder
          .insertInto('investment_capital_movements')
          .values({
            id: capMovementId,
            investment_id: inv.id,
            movement_date: paymentDate,
            movement_type: 'CAPITALIZATION',
            amount: capTransition.capitalizedAmount,
            capital_before: capTransition.capitalBefore,
            capital_after: capTransition.capitalAfter,
            reference_number: capRefNumber,
            recorded_by: actorEmail,
          })
          .compile();

        tx.execute(insertCapMovQuery.sql, toDbInputValues(insertCapMovQuery.parameters));

        tx.execute(
          `UPDATE investments SET current_capital = ? WHERE id = ?`,
          [capTransition.capitalAfter, inv.id]
        );

        compoundCapitalizedCount++;
        totalCapitalizedExact = totalCapitalizedExact.plus(capTransition.capitalizedAmount);
      }

      processed++;
      totalGrossYieldExact = totalGrossYieldExact.plus(yieldResult.grossYield);
      totalIsrRetainedExact = totalIsrRetainedExact.plus(yieldResult.isrRetained);
    }
  });

  return {
    processed,
    skipped,
    compoundCapitalizedCount,
    totalGrossYield: totalGrossYieldExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalIsrRetained: totalIsrRetainedExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalCapitalizedAmount: totalCapitalizedExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
  };
}

/**
 * Registra atómicamente una aportación (`DEPOSIT`) o retiro (`WITHDRAWAL`) de capital al corte
 * y actualiza `investments.current_capital` en la misma transacción.
 *
 * @implements RN-11
 */
export function recordInvestmentCapitalMovement(input: RecordCapitalMovementInput): {
  movementId: string;
  capitalBefore: number;
  capitalAfter: number;
} {
  const amountExact = new Decimal(input.amount);
  if (!amountExact.isFinite() || amountExact.lte(0)) {
    throw new Error('El monto del movimiento de capital debe ser estrictamente mayor a 0.');
  }

  return db.transaction((tx) => {
    const invRes = tx.query<{ id: string; capital: number; current_capital: number }>(
      `SELECT id, capital, current_capital FROM investments WHERE id = ?`,
      [input.investmentId]
    );

    if (invRes.rowCount === 0 || !invRes.rows[0]) {
      throw new Error(`Inversión '${input.investmentId}' no encontrada.`);
    }

    const inv = invRes.rows[0];
    const baseCapExact = new Decimal(inv.current_capital > 0 ? inv.current_capital : inv.capital);
    const nextCapExact =
      input.movementType === 'WITHDRAWAL'
        ? baseCapExact.minus(amountExact)
        : baseCapExact.plus(amountExact);

    const capitalBefore = baseCapExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const amountPersisted = amountExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const capitalAfter = nextCapExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    if (capitalAfter < 0) {
      throw new Error(`El retiro ($${amountPersisted.toFixed(2)}) excede el capital actual ($${capitalBefore.toFixed(2)}).`);
    }

    const movementId = `icm_${crypto.randomUUID()}`;
    tx.execute(
      `INSERT INTO investment_capital_movements (
        id, investment_id, movement_date, movement_type, amount,
        capital_before, capital_after, reference_number, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movementId,
        inv.id,
        input.movementDate,
        input.movementType,
        amountPersisted,
        capitalBefore,
        capitalAfter,
        input.referenceNumber,
        input.recordedBy,
      ]
    );

    tx.execute(`UPDATE investments SET current_capital = ? WHERE id = ?`, [capitalAfter, inv.id]);

    return { movementId, capitalBefore, capitalAfter };
  });
}
