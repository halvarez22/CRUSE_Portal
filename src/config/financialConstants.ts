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

  // Proyección ROI 36 Meses (Módulo B.2 — HRU)
  PROJECTION_MONTHS: 36,
  BASE_MONTHLY_GROWTH_FACTOR: 1.018,
  HUB_GROWTH_INCREMENT: 0.0045,
  REINVESTMENT_MONTHLY_MULTIPLIER: 0.012,
  DIGITAL_EFFICIENCY_FACTOR: 0.65,
  MAX_DEFAULT_RATE_PERCENT: 1.8,
  CAC_DIGITAL_MXN: 380,
  CLIENT_RETENTION_RATE: 0.88,

  // Umbrales Paramétricos Deterministas de Scoring (Módulo B.3 — Guardrail Forense 3)
  SCORING_BASE_POINTS: 750,
  SCORING_MIN_POINTS: 300,
  SCORING_MAX_POINTS: 950,
  SCORING_LOW_RISK_MIN_SCORE: 740,
  SCORING_MEDIUM_RISK_MIN_SCORE: 620,
  SCORING_DTI_SAFE_RATIO: 0.28,               // <= 28% del ingreso libre = Riesgo Bajo
  SCORING_DTI_MODERATE_RATIO: 0.35,           // 28% - 35% = tope institucional
  SCORING_DTI_HIGH_RATIO: 0.40,               // > 40% = Riesgo Alto
  SCORING_MIN_SENIORITY_MONTHS_SAFE: 12,      // >= 12 meses = estabilidad plena
  SCORING_MIN_SENIORITY_MONTHS_CRITICAL: 6,   // < 6 meses = alerta de antigüedad
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
  const monthlyPaymentEquivalentDec = fortnightlyPaymentDec
    .times(2)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    schedule,
    fortnightlyPayment: fortnightlyPaymentDec.toNumber(),
    monthlyPaymentEquivalent: monthlyPaymentEquivalentDec.toNumber(),
    totalToPay: totalToPayDec.toNumber(),
    totalInterest: totalInterest.toDecimalPlaces(2).toNumber(),
    totalVat: totalVat.toDecimalPlaces(2).toNumber(),
    totalInsurance: totalInsurance.toDecimalPlaces(2).toNumber(),
    catPercent: isNormal
      ? FINANCIAL_CONSTANTS.CAT_NORMAL_PERCENT
      : FINANCIAL_CONSTANTS.CAT_EXPRESS_PERCENT,
  };
}

export interface MaxLoanOption {
  productType: ProductId;
  productLabel: string;
  termFortnights: number;
  maxPrincipal: number;
  fortnightlyPayment: number;
  totalToPay: number;
  catPercent: number;
}

export interface SalaryCapacityAnalysis {
  inputSalary: number;
  frequency: 'mensual' | 'quincenal';
  monthlyNetSalary: number;
  fortnightlyNetSalary: number;
  maxFortnightlyDeduction: number;
  options: MaxLoanOption[];
}

/**
 * Calcula de forma 100% determinista (Decimal.js) la capacidad de descuento quincenal (35%)
 * y el monto máximo de préstamo para cada plazo oficial de Crédito Clásico y Crédito Express,
 * aplicando múltiplos limpios ($1,000 en Clásico, $500 en Express), topes de producto ($500k / $20k)
 * y validación cruzada garantizando fortnightlyPayment <= maxFortnightlyDeduction.
 */
export function calculateMaxLoanBySalary(
  netSalaryAmount: number,
  frequency: 'mensual' | 'quincenal'
): SalaryCapacityAnalysis {
  const rawSalary = new Decimal(netSalaryAmount);
  const monthlyNetDec = frequency === 'mensual' ? rawSalary : rawSalary.times(2);
  const fortnightlyNetDec =
    frequency === 'quincenal'
      ? rawSalary
      : rawSalary.dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const maxDeductionDec = fortnightlyNetDec
    .times(FINANCIAL_CONSTANTS.MAX_PAYMENT_CAPACITY_RATIO)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const maxDeduction = maxDeductionDec.toNumber();

  const configs: Array<{
    productType: ProductId;
    productLabel: string;
    terms: number[];
    minAmount: number;
    maxAmount: number;
    step: number;
    factorBase: Decimal;
  }> = [
    {
      productType: 'normal',
      productLabel: 'Crédito Clásico',
      terms: [24, 48, 72],
      minAmount: 10000,
      maxAmount: 500000,
      step: 1000,
      factorBase: new Decimal(FINANCIAL_CONSTANTS.NORMAL_AMORTIZATION_FACTOR_24Q),
    },
    {
      productType: 'express',
      productLabel: 'Crédito Express',
      terms: [6, 14, 20],
      minAmount: 1000,
      maxAmount: 20000,
      step: 500,
      factorBase: new Decimal(FINANCIAL_CONSTANTS.EXPRESS_AMORTIZATION_FACTOR_6Q),
    },
  ];

  const options: MaxLoanOption[] = [];

  for (const cfg of configs) {
    for (const term of cfg.terms) {
      // Despeje algebraico exacto desde Cuota = (P * factorBase) / term => P = (Cuota * term) / factorBase
      const rawMaxP = maxDeductionDec.times(term).dividedBy(cfg.factorBase);
      // Ajuste hacia abajo (floor) al múltiplo limpio ($1,000 o $500) y tope máximo del producto
      let candidateP = rawMaxP
        .dividedBy(cfg.step)
        .floor()
        .times(cfg.step);

      if (candidateP.greaterThan(cfg.maxAmount)) {
        candidateP = new Decimal(cfg.maxAmount);
      }

      if (candidateP.lessThan(cfg.minAmount)) {
        continue;
      }

      // Validación cruzada obligatoria con calculateSimulation() para garantizar cuota <= maxDeduction
      let sim = calculateSimulation(candidateP.toNumber(), term, cfg.productType);
      while (sim.fortnightlyPayment > maxDeduction && candidateP.minus(cfg.step).greaterThanOrEqualTo(cfg.minAmount)) {
        candidateP = candidateP.minus(cfg.step);
        sim = calculateSimulation(candidateP.toNumber(), term, cfg.productType);
      }

      if (sim.fortnightlyPayment <= maxDeduction) {
        options.push({
          productType: cfg.productType,
          productLabel: cfg.productLabel,
          termFortnights: term,
          maxPrincipal: candidateP.toNumber(),
          fortnightlyPayment: sim.fortnightlyPayment,
          totalToPay: sim.totalToPay,
          catPercent: sim.catPercent,
        });
      }
    }
  }

  return {
    inputSalary: rawSalary.toNumber(),
    frequency,
    monthlyNetSalary: monthlyNetDec.toNumber(),
    fortnightlyNetSalary: fortnightlyNetDec.toNumber(),
    maxFortnightlyDeduction: maxDeduction,
    options,
  };
}

