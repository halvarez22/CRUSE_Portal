/**
 * ORQUESTADOR DE CORTE MENSUAL DE FONDEO E INVERSIONISTAS (SIMPLE Y COMPUESTO / CAPITALIZABLE)
 *
 * @implements RN-09 (Capitalización automática mensual para inversiones COMPOUND)
 * @implements RN-10 (Exención de retención de ISR cuando investors.applies_isr = 0)
 * @implements RN-11 (Cálculo sobre investments.current_capital y registro en investment_capital_movements WORM)
 * @implements Restricción Forense 1 (Precisión máxima Decimal.js en acumuladores; redondeo tardío al retornar)
 * @implements Guardrail Forense 1 (CRUSE-APO-2026-023: Sintaxis posicional nativa de PostgreSQL $1, $2... y transacciones asíncronas)
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

  await db.transaction(async (tx) => {
    const activeInvestmentsRes = await tx.query<ActiveInvestmentRow>(`
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
    `);
    const activeInvestments = activeInvestmentsRes.rows;

    for (const inv of activeInvestments) {
      const referenceNumber = `${referencePrefix}-${inv.id}`;

      const existing = await tx.query<{ id: string }>(
        `SELECT id FROM investor_payments WHERE reference_number = $1`,
        [referenceNumber]
      );

      if (existing.rowCount > 0) {
        skipped++;
        continue;
      }

      const baseCapital = Number(inv.current_capital) > 0 ? inv.current_capital : inv.capital;
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

      await tx.execute(insertPaymentQuery.sql, toDbInputValues(insertPaymentQuery.parameters));

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

        await tx.execute(insertCapMovQuery.sql, toDbInputValues(insertCapMovQuery.parameters));

        await tx.execute(`UPDATE investments SET current_capital = $1 WHERE id = $2`, [
          capTransition.capitalAfter,
          inv.id,
        ]);

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
    totalCapitalizedAmount: totalCapitalizedExact
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber(),
  };
}

export async function recordInvestmentCapitalMovement(
  input: RecordCapitalMovementInput
): Promise<{
  movementId: string;
  capitalBefore: number;
  capitalAfter: number;
}> {
  const amountExact = new Decimal(input.amount);
  if (!amountExact.isFinite() || amountExact.lte(0)) {
    throw new Error('El monto del movimiento de capital debe ser estrictamente mayor a 0.');
  }

  return db.transaction(async (tx) => {
    const invRes = await tx.query<{ id: string; capital: number; current_capital: number }>(
      `SELECT id, capital, current_capital FROM investments WHERE id = $1`,
      [input.investmentId]
    );

    if (invRes.rowCount === 0 || !invRes.rows[0]) {
      throw new Error(`Inversión '${input.investmentId}' no encontrada.`);
    }

    const inv = invRes.rows[0];
    const baseCapExact = new Decimal(
      Number(inv.current_capital) > 0 ? inv.current_capital : inv.capital
    );
    const nextCapExact =
      input.movementType === 'WITHDRAWAL'
        ? baseCapExact.minus(amountExact)
        : baseCapExact.plus(amountExact);

    const capitalBefore = baseCapExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const amountPersisted = amountExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    const capitalAfter = nextCapExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    if (capitalAfter < 0) {
      throw new Error(
        `El retiro ($${amountPersisted.toFixed(2)}) excede el capital actual ($${capitalBefore.toFixed(2)}).`
      );
    }

    const movementId = `icm_${crypto.randomUUID()}`;
    await tx.execute(
      `INSERT INTO investment_capital_movements (
        id, investment_id, movement_date, movement_type, amount,
        capital_before, capital_after, reference_number, recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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

    await tx.execute(`UPDATE investments SET current_capital = $1 WHERE id = $2`, [
      capitalAfter,
      inv.id,
    ]);

    return { movementId, capitalBefore, capitalAfter };
  });
}
