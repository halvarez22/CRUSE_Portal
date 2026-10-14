/**
 * FINANCIAL_CONSTANTS — Única fuente de verdad de constantes y fórmulas financieras.
 * Conforme a la Regla 2 (HRU) y Watch Item 1 de Auditoría Forense Qwen (Aritmética Decimal Exacta con decimal.js).
 */
import Decimal from 'decimal.js';
import { ProductId, SimulationResult, AmortizationRow } from '../types';

// Configuración de precisión decimal bancaria
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export const FINANCIAL_CONSTANTS = {
  // Tasas Anuales y Quincenales
  EXPRESS_ANNUAL_RATE: 0.48,                  // 48.0% anual fija sin IVA
  EXPRESS_FORTNIGHTLY_INTEREST_RATE: 0.0333,  // 3.33% nominal quincenal
  EXPRESS_AMORTIZATION_FACTOR_6Q: 1.1394,     // Factor global para 6 quincenas base

  NORMAL_ANNUAL_RATE: 0.475,                  // 47.50% anual fija sin IVA (3.95% mensual)
  NORMAL_FORTNIGHTLY_INTEREST_RATE: 0.0197,   // 1.97% nominal quincenal
  NORMAL_AMORTIZATION_FACTOR_24Q: 1.366656,   // Factor global para 24 quincenas base ($569.44 / $10k)

  // Crédito Especial
  ESPECIAL_MONTHLY_RATE_MIN: 0.025,           // 2.5% mensual mínimo
  ESPECIAL_MONTHLY_RATE_MAX: 0.040,           // 4.0% mensual máximo

  // Fondeo / Inversionistas
  INVESTOR_ISR_RETENTION_RATE_05: 0.005,      // 0.5% Retención ISR
  INVESTOR_ISR_RETENTION_RATE_09: 0.009,      // 0.9% Retención ISR

  // CAT Informativo Oficial (Publicado en cruse.com.mx y registrado ante CONDUSEF)
  CAT_NORMAL_PERCENT: 88.05,                  // 88.05% anual sin IVA
  CAT_EXPRESS_PERCENT: 136.66,                // 136.66% anual sin IVA

  // Fiscalidad y Seguros
  VAT_RATE: 0.16,                             // 16% IVA sobre intereses devengados
  LIFE_INSURANCE_FORTNIGHTLY_MXN: 22.85,      // $22.85 quincenal fijo (Crédito Normal)
  LIFE_INSURANCE_COVERAGE_MXN: 35000.0,       // $35,000.00 MXN suma asegurada (Siniestro)

  // Capacidad de Endeudamiento
  MAX_PAYMENT_CAPACITY_RATIO: 0.35,           // 35% del sueldo neto quincenal máximo
} as const;

/**
 * Genera el cálculo de amortización quincenal exacto libre de drift de punto flotante.
 */
export function calculateSimulation(
  amount: number,
  term: number,
  productType: ProductId
): SimulationResult {
  const P = new Decimal(amount);
  const n = new Decimal(term);
  const vatRate = new Decimal(FINANCIAL_CONSTANTS.VAT_RATE);

  const isNormal = productType === 'normal';
  const isEspecial = productType === 'especial';
  
  // Para especial tomaremos un factor dummy o equivalente a normal para que no rompa,
  // dado que Especial se calcula distinto en producción.
  const factorBase = isNormal
    ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_AMORTIZATION_FACTOR_24Q)
    : isEspecial 
      ? new Decimal(1.0) 
      : new Decimal(FINANCIAL_CONSTANTS.EXPRESS_AMORTIZATION_FACTOR_6Q);
  const termBase = isNormal ? new Decimal(24) : isEspecial ? new Decimal(1) : new Decimal(6);
  const rate = isNormal
    ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_FORTNIGHTLY_INTEREST_RATE)
    : isEspecial
      ? new Decimal(FINANCIAL_CONSTANTS.ESPECIAL_MONTHLY_RATE_MIN)
      : new Decimal(FINANCIAL_CONSTANTS.EXPRESS_FORTNIGHTLY_INTEREST_RATE);
  const insurancePerPeriod = isNormal
    ? new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN)
    : new Decimal(0);

  // Cuota Quincenal Fija con Factor de Amortización Oficial
  // Cuota = (Capital * FactorBase) / TermBase * (TermBase / n)
  const fortnightlyPaymentDec = isEspecial 
    ? P.times(rate).plus(P.dividedBy(n)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : P.times(factorBase).dividedBy(termBase).times(termBase.dividedBy(n)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  let balance = P;
  let totalInterest = new Decimal(0);
  let totalVat = new Decimal(0);
  let totalInsurance = new Decimal(0);

  const schedule: AmortizationRow[] = [];

  for (let i = 1; i <= term; i++) {
    // Interés quincenal sobre saldo insoluto
    const interest = balance.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const vat = interest.times(vatRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const insurance = insurancePerPeriod;

    let capital = fortnightlyPaymentDec.minus(interest).minus(vat).minus(insurance);

    // Ajuste en última quincena o saldos menores a 1 peso
    if (i === term || balance.minus(capital).lessThan(1)) {
      capital = balance;
    }

    balance = Decimal.max(0, balance.minus(capital));

    totalInterest = totalInterest.plus(interest);
    totalVat = totalVat.plus(vat);
    totalInsurance = totalInsurance.plus(insurance);

    schedule.push({
      period: i,
      balance: balance.toFixed(2),
      capital: capital.toFixed(2),
      interest: interest.toFixed(2),
      vat: vat.toFixed(2),
      insurance: insurance.toFixed(2),
      payment: fortnightlyPaymentDec.toFixed(2),
    });
  }

  const totalToPayDec = fortnightlyPaymentDec.times(term);

  return {
    schedule,
    fortnightlyPayment: fortnightlyPaymentDec.toNumber(),
    totalToPay: totalToPayDec.toNumber(),
    totalInterest: totalInterest.toDecimalPlaces(2).toNumber(),
    totalVat: totalVat.toDecimalPlaces(2).toNumber(),
    totalInsurance: totalInsurance.toDecimalPlaces(2).toNumber(),
    catPercent: isNormal
      ? FINANCIAL_CONSTANTS.CAT_NORMAL_PERCENT
      : FINANCIAL_CONSTANTS.CAT_EXPRESS_PERCENT,
  };
}
