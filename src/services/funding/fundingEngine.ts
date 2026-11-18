/**
 * MOTOR MATEMÁTICO DE FONDEO E INVERSIONISTAS (CONVENCIÓN 365 / 30.4, ACTUAL/365 Y RÉGIMEN FISCAL ISR)
 * Expedientes: CRUSE-APO-2026-063 / CRUSE-APO-2026-067 (Guardrail Forense 1)
 *
 * @implements RN-09 (Interés Simple vs Interés Compuesto / Capitalizable)
 * @implements RN-10 (Régimen Fiscal ISR determinista: Capital Art. 54 LISR vs Interés 20% Art. 135/160 LISR vs PM 0%)
 * @implements RN-11 (Tramos proporcionales sin distorsión en día 31 con precisión Decimal.js)
 */

import Decimal from 'decimal.js';
import { differenceInDays, parseISO } from 'date-fns';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';

export type DayCountConvention = 'ACTUAL_365_30_4' | 'ACTUAL_365' | 'ACTUAL_360' | 'THIRTY_360';

export type InvestorTaxRegime =
  | 'SISTEMA_FINANCIERO_ART54_CAPITAL'
  | 'MUTUO_PF_ART160_INTERES'
  | 'PERSONA_MORAL_SIN_RETENCION';

export type FundingLegalClassification =
  | 'ACCIONISTA_RELACIONADO'
  | 'LINEA_INSTITUCIONAL'
  | 'FONDEO_PRIVADO_EXENTO_ART103_LIC';

export interface MonthlyYieldResult {
  grossYield: number;
  isrRetained: number;
  netYield: number;
  dayCountConvention: DayCountConvention;
  taxRegime: InvestorTaxRegime;
  isrBaseApplied: 'CAPITAL_PROMEDIO' | 'INTERES_DEVENGADO' | 'EXENTO_PM';
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
  taxRegime?: InvestorTaxRegime;
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
  taxRegime: InvestorTaxRegime;
}

export interface CapitalizationTransition {
  capitalBefore: number;
  capitalizedAmount: number;
  capitalAfter: number;
}

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

export function resolveInvestorTaxRegime(
  rawRegime?: string | null,
  appliesIsr: boolean | 0 | 1 = true
): InvestorTaxRegime {
  if (appliesIsr === false || appliesIsr === 0) {
    return 'PERSONA_MORAL_SIN_RETENCION';
  }
  const clean = String(rawRegime ?? '').trim().toUpperCase();
  if (
    clean === 'SISTEMA_FINANCIERO_ART54_CAPITAL' ||
    clean === 'MUTUO_PF_ART160_INTERES' ||
    clean === 'PERSONA_MORAL_SIN_RETENCION'
  ) {
    return clean;
  }
  return 'SISTEMA_FINANCIERO_ART54_CAPITAL';
}

/**
 * Determina automáticamente la tasa de retención ISR conforme al régimen fiscal y ejercicio LIF.
 */
export function resolveStatutoryIsrRateByYear(
  fiscalYear: number,
  taxRegime: InvestorTaxRegime,
  overrides?: { rate2025?: string | number; rate2026?: string | number; mutuoPfRate?: string | number }
): Decimal {
  if (taxRegime === 'PERSONA_MORAL_SIN_RETENCION') {
    return new Decimal(0);
  }
  if (taxRegime === 'MUTUO_PF_ART160_INTERES') {
    return new Decimal(overrides?.mutuoPfRate ?? '0.2000');
  }
  if (fiscalYear <= 2025) {
    return new Decimal(overrides?.rate2025 ?? FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_05);
  }
  return new Decimal(overrides?.rate2026 ?? FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_09);
}

/**
 * Motor matemático puro de rendimiento mensual e ISR determinista por régimen fiscal (Guardrail 1).
 * - SISTEMA_FINANCIERO_ART54_CAPITAL: capital * (tasaLIF / baseYear) * effectiveDays
 * - MUTUO_PF_ART160_INTERES: grossYield * 0.20 (sobre INTERÉS BRUTO DEVENGADO, nunca sobre capital)
 * - PERSONA_MORAL_SIN_RETENCION: 0.00
 */
export function calculateMonthlyYieldAndISR(
  currentCapital: number | string | Decimal,
  annualRate: number | string | Decimal,
  annualIsrRate: number | string | Decimal = FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_09,
  daysInPeriod: number | string | Decimal = FINANCIAL_CONSTANTS.INVESTOR_AVG_MONTH_DAYS,
  appliesIsr: boolean | 0 | 1 = true,
  dayCountConvention: DayCountConvention = 'ACTUAL_365_30_4',
  taxRegime?: InvestorTaxRegime
): MonthlyYieldResult {
  const cap = new Decimal(currentCapital);
  const rate = new Decimal(annualRate);
  const resolvedRegime = resolveInvestorTaxRegime(taxRegime, appliesIsr);
  const avgMonthDays = new Decimal(String(FINANCIAL_CONSTANTS.INVESTOR_AVG_MONTH_DAYS));

  const isBase365 =
    dayCountConvention === 'ACTUAL_365_30_4' || dayCountConvention === 'ACTUAL_365';
  const baseYear = isBase365
    ? new Decimal(FINANCIAL_CONSTANTS.INVESTOR_ANNUAL_DAYS_BASE)
    : new Decimal(360);

  const rawDaysDec = new Decimal(daysInPeriod);
  const effectiveDays =
    dayCountConvention === 'ACTUAL_365_30_4' &&
    rawDaysDec.gte(28) &&
    rawDaysDec.lte(31) &&
    rawDaysDec.isInteger()
      ? avgMonthDays
      : rawDaysDec;

  const monthlyRateExact = rate.dividedBy(baseYear).times(avgMonthDays);
  const dailyRateExact = rate.dividedBy(baseYear);
  const grossYieldExact = cap.times(dailyRateExact).times(effectiveDays);

  let isrRetainedExact = new Decimal(0);
  let isrBaseApplied: MonthlyYieldResult['isrBaseApplied'] = 'EXENTO_PM';

  if (resolvedRegime === 'SISTEMA_FINANCIERO_ART54_CAPITAL') {
    const isrRate = new Decimal(annualIsrRate);
    isrRetainedExact = cap.times(isrRate.dividedBy(baseYear)).times(effectiveDays);
    isrBaseApplied = 'CAPITAL_PROMEDIO';
  } else if (resolvedRegime === 'MUTUO_PF_ART160_INTERES') {
    // Guardrail 1: Art. 135/142/160 LISR — 20% estrictamente sobre INTERÉS DEVENGADO
    const interestTaxRate = new Decimal(annualIsrRate).gte(new Decimal('0.10'))
      ? new Decimal(annualIsrRate)
      : new Decimal('0.2000');
    isrRetainedExact = grossYieldExact.times(interestTaxRate);
    isrBaseApplied = 'INTERES_DEVENGADO';
  }

  const grossYield = grossYieldExact.toDP(2, Decimal.ROUND_HALF_UP);
  const isrRetained = isrRetainedExact.toDP(2, Decimal.ROUND_HALF_UP);
  const netYield = grossYield.minus(isrRetained).toDP(2, Decimal.ROUND_HALF_UP);

  return {
    grossYield: grossYield.toNumber(),
    isrRetained: isrRetained.toNumber(),
    netYield: netYield.toNumber(),
    dayCountConvention,
    taxRegime: resolvedRegime,
    isrBaseApplied,
    effectiveDaysUsed: effectiveDays.toFixed(2),
    monthlyRateDecimal: monthlyRateExact.toDP(8, Decimal.ROUND_HALF_UP).toFixed(8),
    dailyRateDecimal: dailyRateExact.toDP(10, Decimal.ROUND_HALF_UP).toFixed(10),
  };
}

export const calculateInvestorYield = calculateMonthlyYieldAndISR;

/**
 * Cálculo de rendimiento en meses con abono o retiro intermedio sin distorsión en día 31 (B.2 + Guardrail 1):
 * - Bajo ACTUAL_365 / ACTUAL_360: días calendario reales exactos (daysTranche1 + daysTranche2 = totalPeriodRealDays).
 * - Bajo ACTUAL_365_30_4: prorrateo exacto sobre totalPeriodRealDays escalado a 30.4 cuando el mes tiene 31 días
 *   y el movimiento cae en día 30-31, garantizando siempre daysTranche1 + daysTranche2 = totalDaysBase y cero negativos.
 */
export function calculateSplitTrancheInvestorYield(
  input: SplitTrancheInvestorYieldInput
): SplitTrancheInvestorYieldResult {
  const convention = input.dayCountConvention ?? 'ACTUAL_365_30_4';
  const resolvedRegime = resolveInvestorTaxRegime(
    input.taxRegime,
    input.appliesIsr === undefined ? true : input.appliesIsr
  );

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

  let daysTranche1: Decimal;
  let daysTranche2: Decimal;

  if (convention === 'ACTUAL_365' || convention === 'ACTUAL_360') {
    daysTranche1 = new Decimal(realDiffDays);
    daysTranche2 = new Decimal(totalPeriodRealDays - realDiffDays);
  } else if (new Decimal(realDiffDays).gt(totalDaysBase)) {
    // Prorrateo exacto para evitar truncamiento en meses de 31 días (B.2)
    daysTranche1 = totalDaysBase
      .times(realDiffDays)
      .dividedBy(totalPeriodRealDays)
      .toDP(4, Decimal.ROUND_HALF_UP);
    daysTranche2 = Decimal.max(new Decimal(0), totalDaysBase.minus(daysTranche1));
  } else {
    daysTranche1 = new Decimal(realDiffDays);
    daysTranche2 = Decimal.max(new Decimal(0), totalDaysBase.minus(daysTranche1));
  }

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

  const dailyRate = annualRate.dividedBy(baseYear);
  const tranche1GrossExact = capBefore.times(daysTranche1).times(dailyRate);
  const tranche2GrossExact = capAfter.times(daysTranche2).times(dailyRate);
  const totalGrossExact = tranche1GrossExact.plus(tranche2GrossExact);

  let totalIsrExact = new Decimal(0);
  if (resolvedRegime === 'SISTEMA_FINANCIERO_ART54_CAPITAL') {
    const dailyIsrRate = annualIsrRate.dividedBy(baseYear);
    totalIsrExact = capBefore
      .times(daysTranche1)
      .times(dailyIsrRate)
      .plus(capAfter.times(daysTranche2).times(dailyIsrRate));
  } else if (resolvedRegime === 'MUTUO_PF_ART160_INTERES') {
    const interestTaxRate = annualIsrRate.gte(new Decimal('0.10'))
      ? annualIsrRate
      : new Decimal('0.2000');
    totalIsrExact = totalGrossExact.times(interestTaxRate);
  }

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
    taxRegime: resolvedRegime,
  };
}

export function calculateCapitalizationTransition(
  currentCapital: number | string | Decimal,
  netYield: number | string | Decimal
): CapitalizationTransition {
  const capBefore = new Decimal(currentCapital).toDP(2, Decimal.ROUND_HALF_UP);
  const capAmt = new Decimal(netYield).toDP(2, Decimal.ROUND_HALF_UP);
  const capAfter = capBefore.plus(capAmt).toDP(2, Decimal.ROUND_HALF_UP);

  return {
    capitalBefore: capBefore.toNumber(),
    capitalizedAmount: capAmt.toNumber(),
    capitalAfter: capAfter.toNumber(),
  };
}

/** Alias retrocompatible para consumidores del cron mensual de fondeo. */
export const computeCompoundCapitalization = calculateCapitalizationTransition;
