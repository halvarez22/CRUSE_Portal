/**
 * MOTOR DE PRELACIÓN CONTRACTUAL DE PAGOS (ART. 364 CÓDIGO DE COMERCIO + CONDUSEF)
 * Expediente: CRUSE-APO-2026-067 (Guardrail Forense 2)
 *
 * Orden de prelación estricto (5 niveles, 100% Decimal.js, retrocompatible):
 *   1. Seguro de Vida y Accesorios (insurance)
 *   2. Comisiones Pactadas + IVA 16% (fees, feesVat)
 *   3. Interés Moratorio + IVA 16% (moratoryInterest, moratoryVat)
 *   4. Interés Ordinario + IVA 16% o EXEMPT_LIVA_ART15_XB (interest, vat)
 *   5. Capital (capital)
 */

import Decimal from 'decimal.js';
import { ProductId } from '../../types';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';

export type WaterfallVatMode = 'ADDED_16' | 'EXEMPT_LIVA_ART15_XB';

export interface LoanState {
  balance: Decimal;
  arrearsInsurance: Decimal;
  arrearsFees?: Decimal;
  arrearsFeesVat?: Decimal;
  arrearsMoratoryInterest?: Decimal;
  arrearsMoratoryVat?: Decimal;
  arrearsInterest: Decimal;
  arrearsVat: Decimal;
  creditBalance: Decimal;
}

export interface PeriodDue {
  insurance: Decimal;
  fees?: Decimal;
  feesVat?: Decimal;
  moratoryInterest?: Decimal;
  moratoryVat?: Decimal;
  interest: Decimal;
  vat: Decimal;
  capital: Decimal;
}

export interface AppliedWaterfallBreakdown {
  insurance: Decimal;
  fees: Decimal;
  feesVat: Decimal;
  moratoryInterest: Decimal;
  moratoryVat: Decimal;
  interest: Decimal;
  vat: Decimal;
  capital: Decimal;
}

export interface Application {
  applied: AppliedWaterfallBreakdown;
  next: LoanState;
  isPeriodFullyCovered: boolean;
  totalApplied: Decimal;
}

export interface ComputeDueOptions {
  vatMode?: WaterfallVatMode;
  fees?: Decimal;
  moratoryInterest?: Decimal;
  insuranceOverride?: Decimal;
}

export function computeDue(
  s: LoanState,
  product: ProductId,
  cuota: Decimal,
  options?: ComputeDueOptions
): PeriodDue {
  const rate =
    product === 'normal'
      ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_FORTNIGHTLY_INTEREST_RATE)
      : new Decimal(FINANCIAL_CONSTANTS.EXPRESS_FORTNIGHTLY_INTEREST_RATE);

  const insurance =
    options?.insuranceOverride !== undefined
      ? options.insuranceOverride.toDP(2, Decimal.ROUND_HALF_UP)
      : product === 'normal'
        ? new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN)
        : new Decimal(0);

  const vatRate =
    options?.vatMode === 'EXEMPT_LIVA_ART15_XB'
      ? new Decimal(0)
      : new Decimal(FINANCIAL_CONSTANTS.VAT_RATE);

  const fees = (options?.fees ?? new Decimal(0)).toDP(2, Decimal.ROUND_HALF_UP);
  const feesVat = fees.times(FINANCIAL_CONSTANTS.VAT_RATE).toDP(2, Decimal.ROUND_HALF_UP);

  const moratoryInterest = (options?.moratoryInterest ?? new Decimal(0)).toDP(2, Decimal.ROUND_HALF_UP);
  const moratoryVat = moratoryInterest.times(vatRate).toDP(2, Decimal.ROUND_HALF_UP);

  const interest = s.balance.times(rate).toDP(2, Decimal.ROUND_HALF_UP);
  const vat = interest.times(vatRate).toDP(2, Decimal.ROUND_HALF_UP);

  const capital = Decimal.min(
    s.balance,
    Decimal.max(
      0,
      cuota
        .minus(insurance)
        .minus(fees)
        .minus(feesVat)
        .minus(moratoryInterest)
        .minus(moratoryVat)
        .minus(interest)
        .minus(vat)
    )
  ).toDP(2, Decimal.ROUND_HALF_UP);

  return {
    insurance,
    fees,
    feesVat,
    moratoryInterest,
    moratoryVat,
    interest,
    vat,
    capital,
  };
}

/**
 * Aplica un pago conforme a la prelación contractual de 5 niveles (Art. 364 CCom).
 * Cuando fees = 0 y moratoryInterest = 0, produce resultados idénticos centavo a centavo
 * a la cascada histórica de créditos de nómina estándar.
 */
export function applyWaterfall(received: Decimal, due: PeriodDue, s: LoanState): Application {
  let available = received.plus(s.creditBalance).toDP(2, Decimal.ROUND_HALF_UP);

  const take = (owed: Decimal): Decimal => {
    const appliedAmt = Decimal.min(available, owed).toDP(2, Decimal.ROUND_HALF_UP);
    available = available.minus(appliedAmt).toDP(2, Decimal.ROUND_HALF_UP);
    return appliedAmt;
  };

  const zero = new Decimal(0);

  // Nivel 1: Seguro de Vida y Accesorios
  const owedIns = due.insurance.plus(s.arrearsInsurance);
  const aIns = take(owedIns);

  // Nivel 2: Comisiones Pactadas (+ IVA 16%)
  const owedFees = (due.fees ?? zero).plus(s.arrearsFees ?? zero);
  const owedFeesVat = (due.feesVat ?? zero).plus(s.arrearsFeesVat ?? zero);
  const aFees = take(owedFees);
  const aFeesVat = take(owedFeesVat);

  // Nivel 3: Interés Moratorio (+ IVA 16%)
  const owedMorInt = (due.moratoryInterest ?? zero).plus(s.arrearsMoratoryInterest ?? zero);
  const owedMorVat = (due.moratoryVat ?? zero).plus(s.arrearsMoratoryVat ?? zero);
  const aMorInt = take(owedMorInt);
  const aMorVat = take(owedMorVat);

  // Nivel 4: Interés Ordinario (+ IVA)
  const owedInt = due.interest.plus(s.arrearsInterest);
  const owedVat = due.vat.plus(s.arrearsVat);
  const aInt = take(owedInt);
  const aVat = take(owedVat);

  // Nivel 5: Capital (incluye excedente de prepago voluntario si queda disponible sobre saldo)
  const aCapBase = take(due.capital);
  const remainingPrincipal = Decimal.max(zero, s.balance.minus(aCapBase));
  const extraCap = available.gt(zero) && remainingPrincipal.gt(zero) ? take(remainingPrincipal) : zero;
  const aCap = aCapBase.plus(extraCap).toDP(2, Decimal.ROUND_HALF_UP);

  const totalApplied = aIns
    .plus(aFees)
    .plus(aFeesVat)
    .plus(aMorInt)
    .plus(aMorVat)
    .plus(aInt)
    .plus(aVat)
    .plus(aCap)
    .toDP(2, Decimal.ROUND_HALF_UP);

  const nextArrearsIns = owedIns.minus(aIns).toDP(2, Decimal.ROUND_HALF_UP);
  const nextArrearsFees = owedFees.minus(aFees).toDP(2, Decimal.ROUND_HALF_UP);
  const nextArrearsFeesVat = owedFeesVat.minus(aFeesVat).toDP(2, Decimal.ROUND_HALF_UP);
  const nextArrearsMorInt = owedMorInt.minus(aMorInt).toDP(2, Decimal.ROUND_HALF_UP);
  const nextArrearsMorVat = owedMorVat.minus(aMorVat).toDP(2, Decimal.ROUND_HALF_UP);
  const nextArrearsInt = owedInt.minus(aInt).toDP(2, Decimal.ROUND_HALF_UP);
  const nextArrearsVat = owedVat.minus(aVat).toDP(2, Decimal.ROUND_HALF_UP);

  const isPeriodFullyCovered =
    nextArrearsIns.lte(zero) &&
    nextArrearsFees.lte(zero) &&
    nextArrearsFeesVat.lte(zero) &&
    nextArrearsMorInt.lte(zero) &&
    nextArrearsMorVat.lte(zero) &&
    nextArrearsInt.lte(zero) &&
    nextArrearsVat.lte(zero) &&
    aCap.gte(due.capital);

  return {
    applied: {
      insurance: aIns,
      fees: aFees,
      feesVat: aFeesVat,
      moratoryInterest: aMorInt,
      moratoryVat: aMorVat,
      interest: aInt,
      vat: aVat,
      capital: aCap,
    },
    next: {
      balance: Decimal.max(zero, s.balance.minus(aCap)).toDP(2, Decimal.ROUND_HALF_UP),
      arrearsInsurance: nextArrearsIns,
      arrearsFees: nextArrearsFees,
      arrearsFeesVat: nextArrearsFeesVat,
      arrearsMoratoryInterest: nextArrearsMorInt,
      arrearsMoratoryVat: nextArrearsMorVat,
      arrearsInterest: nextArrearsInt,
      arrearsVat: nextArrearsVat,
      creditBalance: available,
    },
    isPeriodFullyCovered,
    totalApplied,
  };
}
