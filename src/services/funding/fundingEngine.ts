import Decimal from 'decimal.js';

export interface MonthlyYieldResult {
  grossYield: number;
  isrRetained: number;
  netYield: number;
}

/**
 * Función matemática pura para el motor de fondeo.
 * Utiliza decimal.js para prevenir drift en los cálculos financieros.
 *
 * Fórmula base de Alma:
 * Rendimiento = Capital * (Tasa_Anual / 360) * dias
 * ISR = Capital * (Tasa_ISR_Anual / 360) * dias
 * 
 * @param capital - Capital invertido (ej. 100000)
 * @param annualRate - Tasa de rendimiento anual (ej. 0.18 para 18%)
 * @param annualIsrRate - Tasa de retención ISR anual (ej. 0.005 para 0.5%)
 * @param daysInPeriod - Días exactos del mes (28, 29, 30, 31)
 */
export function calculateMonthlyYieldAndISR(
  capital: number | string,
  annualRate: number | string,
  annualIsrRate: number | string,
  daysInPeriod: number
): MonthlyYieldResult {
  const cap = new Decimal(capital);
  const rate = new Decimal(annualRate);
  const isrRate = new Decimal(annualIsrRate);
  const days = new Decimal(daysInPeriod);
  const baseYear = new Decimal(360);

  // Gross Yield = Capital * (AnnualRate / 360) * Days
  const grossYield = cap
    .times(rate)
    .dividedBy(baseYear)
    .times(days)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // ISR Retenido = Capital * (ISR_Rate / 360) * Days (Fórmula legal validada con Alma)
  const isrRetained = cap
    .times(isrRate)
    .dividedBy(baseYear)
    .times(days)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Net = Gross - ISR
  const netYield = grossYield.minus(isrRetained);

  return {
    grossYield: grossYield.toNumber(),
    isrRetained: isrRetained.toNumber(),
    netYield: netYield.toNumber(),
  };
}
