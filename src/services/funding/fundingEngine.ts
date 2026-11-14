/**
 * MOTOR MATEMÁTICO DE FONDEO E INVERSIONISTAS (CONVENCIÓN 365 / 30.4, SIMPLE VS COMPUESTO + EXENCIÓN ISR)
 * Expediente: CRUSE-APO-2026-063 (Caso 1 — Guardrails Forenses 1 y 6)
 *
 * @implements RN-09 (Inversionistas de Interés Simple vs Interés Compuesto / Capitalizable)
 * @implements RN-10 (Retención opcional de ISR por inversionista: applies_isr = 1 | 0)
 * @implements RN-11 (Movimientos de capital al corte sobre current_capital y tramos proporcionales 30.4)
 * @implements Guardrail Forense 1 (Cálculo de días calendario reales en Tramo 1 y 30.4 - daysTranche1 en Tramo 2 con Decimal.js)
 * @implements Guardrail Forense 6 (Retrocompatibilidad absoluta con parámetros opcionales y fallback a THIRTY_360)
 */

import Decimal from 'decimal.js';
import { differenceInDays, parseISO } from 'date-fns';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';

export type DayCountConvention = 'ACTUAL_365_30_4' | 'ACTUAL_365' | 'ACTUAL_360' | 'THIRTY_360';

export interface MonthlyYieldResult {
  grossYield: number;
  isrRetained: number;
  netYield: number;
  dayCountConvention: DayCountConvention;
  effectiveDaysUsed: string;
  monthlyRateDecimal: string;
  dailyRateDecimal: string;
}

export interface SplitTrancheInvestorYieldInput {
  capitalBefore: number | string | Decimal;
  capitalAfter: number | string | Decimal;
  annualRate: number | string | Decimal;
  annualIsrRate?: number | string | Decimal;
  periodStartDate: string;
  movementDate: string;
  periodEndDate: string;
  appliesIsr?: boolean | 0 | 1;
  dayCountConvention?: DayCountConvention;
}

export interface SplitTrancheInvestorYieldResult {
  daysTranche1: string;
  daysTranche2: string;
  totalDaysBase: string;
  tranche1GrossYield: string;
  tranche2GrossYield: string;
  grossYield: number;
  isrRetained: number;
  netYield: number;
  dayCountConvention: DayCountConvention;
}

export interface CapitalizationTransition {
  capitalBefore: number;
  capitalizedAmount: number;
  capitalAfter: number;
}

/**
 * Normaliza la convención de conteo de días, aplicando fallback seguro a 'THIRTY_360'
 * cuando un registro histórico carece de la columna poblada (Guardrail Forense 6).
 */
export function resolveDayCountConvention(
  rawConvention?: string | null,
  fallbackIfEmpty: DayCountConvention = 'ACTUAL_365_30_4'
): DayCountConvention {
  if (!rawConvention || rawConvention.trim() === '') {
    return fallbackIfEmpty;
  }
  const clean = rawConvention.trim().toUpperCase();
  if (
    clean === 'ACTUAL_365_30_4' ||
    clean === 'ACTUAL_365' ||
    clean === 'ACTUAL_360' ||
    clean === 'THIRTY_360'
  ) {
    return clean;
  }
  return 'THIRTY_360';
}

/**
 * Función matemática pura para el motor de fondeo (Mes Completo o Días Específicos).
 * Homologada a '2. relacion y pago inversionistas 2026.xlsx' (Lic. Alma):
 * - Bajo 'ACTUAL_365_30_4':
 *   Tasa_Mensual = (Tasa_Anual / 365) * 30.4
 *   Tasa_Diaria  = Tasa_Mensual / 30.4 = Tasa_Anual / 365
 *   Interés_Mes  = Saldo * 30.4 * Tasa_Diaria
 */
export function calculateMonthlyYieldAndISR(
  currentCapital: number | string | Decimal,
  annualRate: number | string | Decimal,
  annualIsrRate: number | string | Decimal = FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_09,
  daysInPeriod: number | string | Decimal = FINANCIAL_CONSTANTS.INVESTOR_AVG_MONTH_DAYS,
  appliesIsr: boolean | 0 | 1 = true,
  dayCountConvention: DayCountConvention = 'ACTUAL_365_30_4'
): MonthlyYieldResult {
  const cap = new Decimal(currentCapital);
  const rate = new Decimal(annualRate);
  const isrRate = new Decimal(annualIsrRate);
  const avgMonthDays = new Decimal(String(FINANCIAL_CONSTANTS.INVESTOR_AVG_MONTH_DAYS));
  const shouldRetainIsr = appliesIsr === true || appliesIsr === 1;

  const isBase365 =
    dayCountConvention === 'ACTUAL_365_30_4' || dayCountConvention === 'ACTUAL_365';
  const baseYear = isBase365
    ? new Decimal(FINANCIAL_CONSTANTS.INVESTOR_ANNUAL_DAYS_BASE)
    : new Decimal(360);

  // En convención ACTUAL_365_30_4, un corte mensual estándar (28..31 días calendario) devenga sobre 30.4 días promedio
  const rawDaysDec = new Decimal(daysInPeriod);
  const effectiveDays =
    dayCountConvention === 'ACTUAL_365_30_4' &&
    rawDaysDec.gte(28) &&
    rawDaysDec.lte(31) &&
    rawDaysDec.isInteger()
      ? avgMonthDays
      : rawDaysDec;

  const monthlyRateExact = rate.dividedBy(baseYear).times(avgMonthDays);
  const dailyRateExact = monthlyRateExact.dividedBy(avgMonthDays);
  const dailyIsrExact = isrRate.dividedBy(baseYear);

  const grossYieldExact = cap.times(dailyRateExact).times(effectiveDays);
  const isrRetainedExact = shouldRetainIsr
    ? cap.times(dailyIsrExact).times(effectiveDays)
    : new Decimal(0);

  const grossYield = grossYieldExact.toDP(2, Decimal.ROUND_HALF_UP);
  const isrRetained = isrRetainedExact.toDP(2, Decimal.ROUND_HALF_UP);
  const netYield = grossYield.minus(isrRetained).toDP(2, Decimal.ROUND_HALF_UP);

  return {
    grossYield: grossYield.toNumber(),
    isrRetained: isrRetained.toNumber(),
    netYield: netYield.toNumber(),
    dayCountConvention,
    effectiveDaysUsed: effectiveDays.toFixed(2),
    monthlyRateDecimal: monthlyRateExact.toDP(8, Decimal.ROUND_HALF_UP).toFixed(8),
    dailyRateDecimal: dailyRateExact.toDP(10, Decimal.ROUND_HALF_UP).toFixed(10),
  };
}

/**
 * Alias retrocompatible para consumidores externos del motor de fondeo (Guardrail 6).
 */
export const calculateInvestorYield = calculateMonthlyYieldAndISR;

/**
 * Guardrail Forense 1: Cálculo de rendimiento en meses con abono o retiro intermedio
 * ('2. relacion y pago inversionistas 2026.xlsx' — ej. César Augusto / Erika):
 * - daysTranche1 = differenceInDays(movementDate, periodStartDate) (días calendario reales)
 * - daysTranche2 = 30.4 - daysTranche1 (días proporcionales restantes para cerrar el mes promedio 30.4)
 * Cero hardcoding de días; todo se deriva de las fechas reales con Decimal.js.
 */
export function calculateSplitTrancheInvestorYield(
  input: SplitTrancheInvestorYieldInput
): SplitTrancheInvestorYieldResult {
  const convention = input.dayCountConvention ?? 'ACTUAL_365_30_4';
  const startDt = parseISO(input.periodStartDate.trim().slice(0, 10));
  const moveDt = parseISO(input.movementDate.trim().slice(0, 10));
  const endDt = parseISO(input.periodEndDate.trim().slice(0, 10));

  const realDiffDays = differenceInDays(moveDt, startDt);
  const totalPeriodRealDays = differenceInDays(endDt, startDt);
  if (realDiffDays < 0 || totalPeriodRealDays <= 0 || realDiffDays > totalPeriodRealDays) {
    throw new Error(
      `Rango de fechas inválido en corte dividido: inicio=${input.periodStartDate}, movimiento=${input.movementDate}, fin=${input.periodEndDate}`
    );
  }

  const totalDaysBase =
    convention === 'ACTUAL_365_30_4'
      ? new Decimal(String(FINANCIAL_CONSTANTS.INVESTOR_AVG_MONTH_DAYS))
      : convention === 'THIRTY_360'
        ? new Decimal(30)
        : new Decimal(totalPeriodRealDays);

  const daysTranche1 = new Decimal(realDiffDays);
  const daysTranche2 = Decimal.max(new Decimal(0), totalDaysBase.minus(daysTranche1));

  const baseYear =
    convention === 'ACTUAL_365_30_4' || convention === 'ACTUAL_365'
      ? new Decimal(FINANCIAL_CONSTANTS.INVESTOR_ANNUAL_DAYS_BASE)
      : new Decimal(360);

  const capBefore = new Decimal(input.capitalBefore);
  const capAfter = new Decimal(input.capitalAfter);
  const annualRate = new Decimal(input.annualRate);
  const annualIsrRate = new Decimal(
    input.annualIsrRate ?? FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_09
  );
  const shouldRetainIsr =
    input.appliesIsr === undefined || input.appliesIsr === true || input.appliesIsr === 1;

  const dailyRate = annualRate.dividedBy(baseYear);
  const dailyIsrRate = annualIsrRate.dividedBy(baseYear);

  const tranche1GrossExact = capBefore.times(daysTranche1).times(dailyRate);
  const tranche2GrossExact = capAfter.times(daysTranche2).times(dailyRate);
  const totalGrossExact = tranche1GrossExact.plus(tranche2GrossExact);

  const tranche1IsrExact = shouldRetainIsr
    ? capBefore.times(daysTranche1).times(dailyIsrRate)
    : new Decimal(0);
  const tranche2IsrExact = shouldRetainIsr
    ? capAfter.times(daysTranche2).times(dailyIsrRate)
    : new Decimal(0);
  const totalIsrExact = tranche1IsrExact.plus(tranche2IsrExact);

  const grossYieldDec = totalGrossExact.toDP(2, Decimal.ROUND_HALF_UP);
  const isrRetainedDec = totalIsrExact.toDP(2, Decimal.ROUND_HALF_UP);
  const netYieldDec = grossYieldDec.minus(isrRetainedDec).toDP(2, Decimal.ROUND_HALF_UP);

  return {
    daysTranche1: daysTranche1.toFixed(1),
    daysTranche2: daysTranche2.toFixed(1),
    totalDaysBase: totalDaysBase.toFixed(1),
    tranche1GrossYield: tranche1GrossExact.toDP(2, Decimal.ROUND_HALF_UP).toFixed(2),
    tranche2GrossYield: tranche2GrossExact.toDP(2, Decimal.ROUND_HALF_UP).toFixed(2),
    grossYield: grossYieldDec.toNumber(),
    isrRetained: isrRetainedDec.toNumber(),
    netYield: netYieldDec.toNumber(),
    dayCountConvention: convention,
  };
}

/**
 * Calcula la transición de capital para inversiones de Interés Compuesto (`COMPOUND`),
 * sumando el rendimiento neto del periodo al `current_capital` con precisión Decimal.js.
 */
export function computeCompoundCapitalization(
  currentCapital: number | string | Decimal,
  netYield: number | string | Decimal
): CapitalizationTransition {
  const beforeExact = new Decimal(currentCapital);
  const yieldExact = new Decimal(netYield);
  const afterExact = beforeExact.plus(yieldExact);

  return {
    capitalBefore: beforeExact.toDP(2, Decimal.ROUND_HALF_UP).toNumber(),
    capitalizedAmount: yieldExact.toDP(2, Decimal.ROUND_HALF_UP).toNumber(),
    capitalAfter: afterExact.toDP(2, Decimal.ROUND_HALF_UP).toNumber(),
  };
}
