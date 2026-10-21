/**
 * MOTOR MATEMÁTICO DE FONDEO E INVERSIONISTAS (INTERÉS SIMPLE VS COMPUESTO + EXENCIÓN ISR)
 *
 * @implements RN-09 (Inversionistas de Interés Simple vs Interés Compuesto / Capitalizable)
 * @implements RN-10 (Retención opcional de ISR por inversionista: applies_isr = 1 | 0)
 * @implements RN-11 (Movimientos de capital al corte sobre current_capital)
 * @implements Restricción Forense 1 (Precisión máxima Decimal.js en operaciones intermedias; redondeo tardío ROUND_HALF_UP al final)
 */

import Decimal from 'decimal.js';

export interface MonthlyYieldResult {
  grossYield: number;
  isrRetained: number;
  netYield: number;
}

export interface CapitalizationTransition {
  capitalBefore: number;
  capitalizedAmount: number;
  capitalAfter: number;
}

/**
 * Función matemática pura para el motor de fondeo.
 * Utiliza Decimal.js con precisión máxima intermedia y redondeo tardío (Anti-Drift).
 *
 * Fórmulas base de Administración (Alma):
 * - Rendimiento Bruto = Capital_Actual * (Tasa_Anual / 360) * Días_Mes
 * - ISR Retenido = appliesIsr ? Capital_Actual * (Tasa_ISR_Anual / 360) * Días_Mes : 0
 * - Rendimiento Neto = Rendimiento Bruto - ISR Retenido
 *
 * @implements RN-09
 * @implements RN-10
 * @implements RN-11
 */
export function calculateMonthlyYieldAndISR(
  currentCapital: number | string,
  annualRate: number | string,
  annualIsrRate: number | string,
  daysInPeriod: number,
  appliesIsr: boolean | 0 | 1 = true
): MonthlyYieldResult {
  const cap = new Decimal(currentCapital);
  const rate = new Decimal(annualRate);
  const isrRate = new Decimal(annualIsrRate);
  const days = new Decimal(daysInPeriod);
  const baseYear = new Decimal(360);
  const shouldRetainIsr = appliesIsr === true || appliesIsr === 1;

  // Cálculo intermedio en precisión máxima de Decimal.js (Restricción Forense 1)
  const grossYieldExact = cap.times(rate).dividedBy(baseYear).times(days);
  const isrRetainedExact = shouldRetainIsr
    ? cap.times(isrRate).dividedBy(baseYear).times(days)
    : new Decimal(0);

  // Redondeo tardío al centavo únicamente en los montos finales
  const grossYield = grossYieldExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const isrRetained = isrRetainedExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const netYield = grossYield.minus(isrRetained).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    grossYield: grossYield.toNumber(),
    isrRetained: isrRetained.toNumber(),
    netYield: netYield.toNumber(),
  };
}

/**
 * Calcula la transición de capital para inversiones de Interés Compuesto (`COMPOUND`),
 * sumando el rendimiento neto del periodo al `current_capital` con precisión Decimal.js.
 *
 * @implements RN-09
 * @implements RN-11
 */
export function computeCompoundCapitalization(
  currentCapital: number | string,
  netYield: number | string
): CapitalizationTransition {
  const beforeExact = new Decimal(currentCapital);
  const yieldExact = new Decimal(netYield);
  const afterExact = beforeExact.plus(yieldExact);

  return {
    capitalBefore: beforeExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    capitalizedAmount: yieldExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    capitalAfter: afterExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
  };
}
