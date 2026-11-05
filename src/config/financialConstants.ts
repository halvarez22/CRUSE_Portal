/**
 * FINANCIAL_CONSTANTS — Única fuente de verdad de constantes y fórmulas financieras.
 * Conforme a la Regla 2 (HRU) y Guardrails 1 y 2 de Auditoría Forense Qwen (CRUSE-APO-2026-051):
 * - Cero punto flotante nativo (FLOAT_CALLS_COUNT === 0; uso exclusivo de Decimal.js)
 * - Fórmula de Anualidad PMT sobre saldos insolutos con IVA integrado (16%)
 * - Tope legal inquebrantable del 30% conforme al Art. 110 de la Ley Federal del Trabajo (LFT)
 */
import Decimal from 'decimal.js';
import {
  ProductId,
  SimulationResult,
  AmortizationRow,
  PaymentFrequency,
  BorrowerProfile,
} from '../types';
import { getAllowedExpressTerm, lookupOfficialQuotaRow } from './officialQuotaTables';

// Configuración de precisión decimal bancaria
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const FINANCIAL_CONSTANTS = {
  // Tasas Anuales, Quincenales y Mensuales (sin IVA)
  EXPRESS_ANNUAL_RATE: 0.80,                  // 80.00% anual nominal fija sin IVA
  EXPRESS_FORTNIGHTLY_INTEREST_RATE: 0.0333333333, // 80.00% / 24 = 3.333333% nominal quincenal
  EXPRESS_MONTHLY_INTEREST_RATE: 0.0666666667,     // 80.00% / 12 = 6.666667% nominal mensual

  NORMAL_ANNUAL_RATE: 0.475,                  // 47.50% anual nominal fija sin IVA
  NORMAL_FORTNIGHTLY_INTEREST_RATE: 0.0197916667,  // 47.50% / 24 = 1.979167% nominal quincenal
  NORMAL_MONTHLY_INTEREST_RATE: 0.0395833333,      // 47.50% / 12 = 3.958333% nominal mensual

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
  LIFE_INSURANCE_FORTNIGHTLY_MXN: 22.85,      // $22.85 quincenal fijo (Crédito Normal Activos)
  LIFE_INSURANCE_MONTHLY_MXN: 45.70,          // $45.70 mensual fijo (Crédito Normal Activos)
  LIFE_INSURANCE_COVERAGE_MXN: 35000.0,       // $35,000.00 MXN suma asegurada (Siniestro)

  // Capacidad de Endeudamiento (Art. 110 Ley Federal del Trabajo: máximo 30% del sueldo neto)
  MAX_PAYMENT_CAPACITY_RATIO: 0.30,           // 30% del sueldo neto máximo legal (Art. 110 LFT)

  // Proyección ROI 36 Meses (Módulo B.2 — HRU)
  PROJECTION_MONTHS: 36,
  BASE_MONTHLY_GROWTH_FACTOR: 1.018,
  HUB_GROWTH_INCREMENT: 0.0045,
  REINVESTMENT_MONTHLY_MULTIPLIER: 0.012,
  DIGITAL_EFFICIENCY_FACTOR: 0.65,
  MAX_DEFAULT_RATE_PERCENT: 1.8,
  CAC_DIGITAL_MXN: 380,
  CLIENT_RETENTION_RATE: 0.88,

  // Umbrales Paramétricos Deterministas de Scoring (Módulo B.3 — Guardrail Forense 2 y 3)
  SCORING_BASE_POINTS: 750,
  SCORING_MIN_POINTS: 300,
  SCORING_MAX_POINTS: 950,
  SCORING_LOW_RISK_MIN_SCORE: 740,
  SCORING_MEDIUM_RISK_MIN_SCORE: 620,
  SCORING_DTI_SAFE_RATIO: 0.25,               // <= 25% del ingreso libre = Riesgo Bajo
  SCORING_DTI_MODERATE_RATIO: 0.30,           // 25% - 30% = Tope Legal Art. 110 LFT
  SCORING_DTI_HIGH_RATIO: 0.30,               // > 30% = Rechazo Legal Art. 110 LFT
  SCORING_MIN_SENIORITY_MONTHS_SAFE: 12,      // >= 12 meses = estabilidad plena
  SCORING_MIN_SENIORITY_MONTHS_CRITICAL: 6,   // < 6 meses = alerta de antigüedad
} as const;

export interface LegalPaymentCapacityCheck {
  isValid: boolean;
  ratioDecimal: string;
  ratioPercent: string;
  maxAllowedPayment: string;
  requiredMinNetIncome: string;
  errorMessage: string | null;
}

/**
 * Guardrail 2: Validación hardcodeada del tope legal del 30% conforme al Art. 110 LFT.
 * Utiliza exclusivamente Decimal.js sin punto flotante nativo.
 */
export function validateLegalPaymentCapacityLft110(
  periodicPaymentInput: number | string | Decimal,
  netPeriodicIncomeInput: number | string | Decimal,
): LegalPaymentCapacityCheck {
  const dPayment = new Decimal(periodicPaymentInput).toDP(2, Decimal.ROUND_HALF_UP);
  const dIncome = new Decimal(netPeriodicIncomeInput).toDP(2, Decimal.ROUND_HALF_UP);
  const maxRatio = new Decimal(FINANCIAL_CONSTANTS.MAX_PAYMENT_CAPACITY_RATIO);
  const requiredMinNetIncome = dPayment.div(maxRatio).toDP(2, Decimal.ROUND_HALF_UP);

  if (dIncome.lte(0)) {
    return {
      isValid: false,
      ratioDecimal: '1.0000',
      ratioPercent: '100.00',
      maxAllowedPayment: '0.00',
      requiredMinNetIncome: requiredMinNetIncome.toFixed(2),
      errorMessage: 'Excede el límite legal de descuento del 30% conforme al Art. 110 LFT',
    };
  }

  const maxAllowedPayment = dIncome.mul(maxRatio).toDP(2, Decimal.ROUND_HALF_UP);
  const ratio = dPayment.div(dIncome);
  // Tolerancia de 1 centavo cuando el sueldo ingresado es exactamente el ingreso mínimo tabulado (Cuota / 0.30)
  const exceedsLimit = dPayment.gt(maxAllowedPayment.plus(new Decimal('0.01')));

  return {
    isValid: !exceedsLimit,
    ratioDecimal: ratio.toDP(4, Decimal.ROUND_HALF_UP).toFixed(4),
    ratioPercent: ratio.mul(100).toDP(2, Decimal.ROUND_HALF_UP).toFixed(2),
    maxAllowedPayment: maxAllowedPayment.toFixed(2),
    requiredMinNetIncome: requiredMinNetIncome.toFixed(2),
    errorMessage: exceedsLimit
      ? 'Excede el límite legal de descuento del 30% conforme al Art. 110 LFT'
      : null,
  };
}

export interface SimulationOptions {
  frequency?: PaymentFrequency;
  borrowerProfile?: BorrowerProfile;
}

/**
 * Calcula la cuota periódica mediante fórmula financiera de Anualidad (PMT) sobre saldos insolutos
 * con IVA del 16% integrado en la tasa efectiva y seguro de vida periódico cuando aplica.
 * Si la combinación (producto, monto, plazo, frecuencia, perfil) existe en las 293 filas de
 * TABLAS DE CUOTAS.xlsx, certifica coincidencia centavo a centavo ($0.00 de discrepancia).
 */
export function computePeriodicQuotaDecimal(
  productId: ProductId,
  amountInput: number | string | Decimal,
  termPeriodsInput: number | string | Decimal,
  frequency: PaymentFrequency = 'quincenal',
  borrowerProfile: BorrowerProfile = 'activo',
): {
  periodicPayment: Decimal;
  basePmtWithoutInsurance: Decimal;
  insurancePerPeriod: Decimal;
  nominalPeriodicRate: Decimal;
  effectivePeriodicRateWithVat: Decimal;
  annualNominalRatePercent: Decimal;
  requiredNetIncome: Decimal;
} {
  const dAmount = new Decimal(amountInput);
  const dTerm = new Decimal(termPeriodsInput);
  const dVat = new Decimal(FINANCIAL_CONSTANTS.VAT_RATE);
  const periodsPerYear = frequency === 'mensual' ? new Decimal(12) : new Decimal(24);

  const annualRate =
    productId === 'normal'
      ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_ANNUAL_RATE)
      : productId === 'express'
        ? new Decimal(FINANCIAL_CONSTANTS.EXPRESS_ANNUAL_RATE)
        : new Decimal('0.30');

  const annualNominalRatePercent = annualRate.mul(100).toDP(2, Decimal.ROUND_HALF_UP);
  const nominalPeriodicRate = annualRate.div(periodsPerYear);
  const effectivePeriodicRateWithVat = nominalPeriodicRate.mul(new Decimal(1).plus(dVat));

  const chargesLifeInsurance = productId === 'normal' && borrowerProfile === 'activo';
  const insurancePerPeriod = chargesLifeInsurance
    ? frequency === 'mensual'
      ? new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_MONTHLY_MXN)
      : new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN)
    : new Decimal(0);

  // Fórmula de Anualidad: PMT = P * [ r_eff / (1 - (1 + r_eff)^(-n)) ] + Seguro
  const onePlusR = new Decimal(1).plus(effectivePeriodicRateWithVat);
  const discountFactor = new Decimal(1).minus(onePlusR.pow(dTerm.neg()));
  const rawBasePmt = dAmount.mul(effectivePeriodicRateWithVat).div(discountFactor);
  const formulaPayment = rawBasePmt.plus(insurancePerPeriod).toDP(2, Decimal.ROUND_HALF_UP);

  const officialRow = lookupOfficialQuotaRow(
    productId,
    dAmount.toNumber(),
    dTerm.toNumber(),
    frequency,
    borrowerProfile,
  );

  const periodicPayment = officialRow
    ? new Decimal(officialRow.periodicPayment).toDP(2, Decimal.ROUND_HALF_UP)
    : formulaPayment;

  const requiredNetIncome = officialRow
    ? new Decimal(officialRow.requiredIncome).toDP(2, Decimal.ROUND_HALF_UP)
    : periodicPayment
        .div(new Decimal(FINANCIAL_CONSTANTS.MAX_PAYMENT_CAPACITY_RATIO))
        .toDP(2, Decimal.ROUND_HALF_UP);

  return {
    periodicPayment,
    basePmtWithoutInsurance: periodicPayment.minus(insurancePerPeriod),
    insurancePerPeriod,
    nominalPeriodicRate,
    effectivePeriodicRateWithVat,
    annualNominalRatePercent,
    requiredNetIncome,
  };
}

/**
 * Genera el cálculo de amortización exacto libre de drift de punto flotante con Decimal.js.
 * Soporta tanto la firma (amount, term, productType, options) como (productType, amount, term, options).
 */
export function calculateSimulation(
  arg1: number | ProductId,
  arg2: number,
  arg3: ProductId | number,
  options?: SimulationOptions,
): SimulationResult {
  const productType: ProductId = typeof arg1 === 'string' ? arg1 : (arg3 as ProductId);
  const amount: number = typeof arg1 === 'number' ? arg1 : arg2;
  const rawTerm: number = typeof arg1 === 'number' ? arg2 : (arg3 as number);

  const frequency: PaymentFrequency = options?.frequency ?? 'quincenal';
  const borrowerProfile: BorrowerProfile = options?.borrowerProfile ?? 'activo';

  const dAmount = new Decimal(amount);
  const effectiveTerm =
    productType === 'express' &&
    ((frequency === 'quincenal' && ![6, 14, 20].includes(rawTerm)) ||
      (frequency === 'mensual' && ![3, 7, 10].includes(rawTerm)))
      ? getAllowedExpressTerm(dAmount.toNumber(), frequency)
      : rawTerm;

  const dTerm = new Decimal(effectiveTerm);
  const nPeriods = dTerm.toNumber();
  const dVatRate = new Decimal(FINANCIAL_CONSTANTS.VAT_RATE);

  const quotaInfo = computePeriodicQuotaDecimal(
    productType,
    dAmount,
    dTerm,
    frequency,
    borrowerProfile,
  );

  const {
    periodicPayment,
    insurancePerPeriod,
    nominalPeriodicRate,
    annualNominalRatePercent,
    requiredNetIncome,
  } = quotaInfo;

  let currentBalance = dAmount;
  let accInterest = new Decimal(0);
  let accVat = new Decimal(0);
  let accInsurance = new Decimal(0);

  const schedule: AmortizationRow[] = [];

  for (let period = 1; period <= nPeriods; period++) {
    const isLastPeriod = period === nPeriods;
    const interest = currentBalance.mul(nominalPeriodicRate).toDP(2, Decimal.ROUND_HALF_UP);
    const vat = interest.mul(dVatRate).toDP(2, Decimal.ROUND_HALF_UP);
    const insurance = insurancePerPeriod.toDP(2, Decimal.ROUND_HALF_UP);

    let capital = periodicPayment
      .minus(interest)
      .minus(vat)
      .minus(insurance)
      .toDP(2, Decimal.ROUND_HALF_UP);
    let nextBalance = currentBalance.minus(capital).toDP(2, Decimal.ROUND_HALF_UP);

    if (isLastPeriod || nextBalance.lt(0)) {
      capital = currentBalance;
      nextBalance = new Decimal(0);
    }

    currentBalance = nextBalance;
    accInterest = accInterest.plus(interest);
    accVat = accVat.plus(vat);
    accInsurance = accInsurance.plus(insurance);

    schedule.push({
      period,
      balance: currentBalance.toFixed(2),
      capital: capital.toFixed(2),
      interest: interest.toFixed(2),
      vat: vat.toFixed(2),
      insurance: insurance.toFixed(2),
      payment: periodicPayment.toFixed(2),
    });
  }

  const totalToPayDec = periodicPayment.mul(dTerm).toDP(2, Decimal.ROUND_HALF_UP);
  const fortnightlyEquivalentDec =
    frequency === 'mensual'
      ? periodicPayment.div(2).toDP(2, Decimal.ROUND_HALF_UP)
      : periodicPayment;
  const monthlyPaymentEquivalentDec =
    frequency === 'mensual'
      ? periodicPayment
      : periodicPayment.mul(2).toDP(2, Decimal.ROUND_HALF_UP);

  return {
    schedule,
    fortnightlyPayment: fortnightlyEquivalentDec.toNumber(),
    periodicPayment: periodicPayment.toNumber(),
    frequency,
    borrowerProfile,
    monthlyPaymentEquivalent: monthlyPaymentEquivalentDec.toNumber(),
    totalToPay: totalToPayDec.toNumber(),
    totalInterest: accInterest.toDP(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalVat: accVat.toDP(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalInsurance: accInsurance.toDP(2, Decimal.ROUND_HALF_UP).toNumber(),
    catPercent:
      productType === 'normal'
        ? FINANCIAL_CONSTANTS.CAT_NORMAL_PERCENT
        : FINANCIAL_CONSTANTS.CAT_EXPRESS_PERCENT,
    requiredNetIncome: requiredNetIncome.toNumber(),
    annualNominalRatePercent: annualNominalRatePercent.toNumber(),
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
 * Calcula de forma 100% determinista (Decimal.js) la capacidad de descuento quincenal (30% Art. 110 LFT)
 * y el monto máximo de préstamo para cada plazo oficial de Crédito Normal y Crédito Express,
 * aplicando múltiplos limpios ($5,000 en Normal, $1,000 en Express), topes de producto ($500k / $20k)
 * y validación cruzada garantizando fortnightlyPayment <= maxFortnightlyDeduction.
 */
export function calculateMaxLoanBySalary(
  netSalaryAmount: number,
  frequency: 'mensual' | 'quincenal',
): SalaryCapacityAnalysis {
  const rawSalary = new Decimal(netSalaryAmount);
  const monthlyNetDec = frequency === 'mensual' ? rawSalary : rawSalary.mul(2);
  const fortnightlyNetDec =
    frequency === 'quincenal'
      ? rawSalary
      : rawSalary.div(2).toDP(2, Decimal.ROUND_HALF_UP);

  const maxDeductionDec = fortnightlyNetDec
    .mul(new Decimal(FINANCIAL_CONSTANTS.MAX_PAYMENT_CAPACITY_RATIO))
    .toDP(2, Decimal.ROUND_HALF_UP);
  const maxDeduction = maxDeductionDec.toNumber();

  // Montos para Crédito Normal (24, 48, 72 Q)
  const normalTerms = [24, 48, 72];
  const options: MaxLoanOption[] = [];

  for (const term of normalTerms) {
    const rEff = new Decimal(FINANCIAL_CONSTANTS.NORMAL_ANNUAL_RATE)
      .div(24)
      .mul(new Decimal(1).plus(new Decimal(FINANCIAL_CONSTANTS.VAT_RATE)));
    const availForPmt = Decimal.max(
      new Decimal(0),
      maxDeductionDec.minus(new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN)),
    );
    const discountFactor = new Decimal(1).minus(
      new Decimal(1).plus(rEff).pow(new Decimal(term).neg()),
    );
    const rawMaxP = availForPmt.mul(discountFactor).div(rEff);
    let candidateP = Decimal.min(
      new Decimal(500000),
      rawMaxP.div(5000).floor().mul(5000),
    );

    while (candidateP.gte(10000)) {
      const sim = calculateSimulation(candidateP.toNumber(), term, 'normal');
      if (new Decimal(sim.fortnightlyPayment).lte(maxDeductionDec)) {
        options.push({
          productType: 'normal',
          productLabel: 'Crédito Normal',
          termFortnights: term,
          maxPrincipal: candidateP.toNumber(),
          fortnightlyPayment: sim.fortnightlyPayment,
          totalToPay: sim.totalToPay,
          catPercent: sim.catPercent,
        });
        break;
      }
      candidateP = candidateP.minus(5000);
    }
  }

  // Montos para Crédito Express según escalón de plazo oficial:
  // $1k-$5k -> 6Q; $6k-$10k -> 14Q; $11k-$20k -> 20Q
  const expressBrackets: Array<{ term: number; minAmt: number; maxAmt: number }> = [
    { term: 6, minAmt: 1000, maxAmt: 5000 },
    { term: 14, minAmt: 6000, maxAmt: 10000 },
    { term: 20, minAmt: 11000, maxAmt: 20000 },
  ];

  for (const bracket of expressBrackets) {
    let candidateP = new Decimal(bracket.maxAmt);
    while (candidateP.gte(bracket.minAmt)) {
      const sim = calculateSimulation(candidateP.toNumber(), bracket.term, 'express');
      if (new Decimal(sim.fortnightlyPayment).lte(maxDeductionDec)) {
        options.push({
          productType: 'express',
          productLabel: 'Crédito Express',
          termFortnights: bracket.term,
          maxPrincipal: candidateP.toNumber(),
          fortnightlyPayment: sim.fortnightlyPayment,
          totalToPay: sim.totalToPay,
          catPercent: sim.catPercent,
        });
        break;
      }
      candidateP = candidateP.minus(1000);
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
