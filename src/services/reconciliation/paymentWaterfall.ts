import Decimal from 'decimal.js';
import { ProductId } from '../../types';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';

export interface LoanState {
  balance: Decimal;
  arrearsInsurance: Decimal;
  arrearsInterest: Decimal;
  arrearsVat: Decimal;
  creditBalance: Decimal;
}

export interface PeriodDue {
  insurance: Decimal;
  interest: Decimal;
  vat: Decimal;
  capital: Decimal;
}

export interface Application {
  applied: PeriodDue;
  next: LoanState;
}

export function computeDue(s: LoanState, product: ProductId, cuota: Decimal): PeriodDue {
  const rate = product === 'normal' 
    ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_FORTNIGHTLY_INTEREST_RATE) 
    : new Decimal(FINANCIAL_CONSTANTS.EXPRESS_FORTNIGHTLY_INTEREST_RATE);
    
  const insurance = product === 'normal' 
    ? new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN) 
    : new Decimal(0);
    
  const interest = s.balance.times(rate).toDP(2, Decimal.ROUND_HALF_UP);
  const vat = interest.times(FINANCIAL_CONSTANTS.VAT_RATE).toDP(2, Decimal.ROUND_HALF_UP);
  const capital = Decimal.min(s.balance, Decimal.max(0, cuota.minus(insurance).minus(interest).minus(vat)));
  
  return { insurance, interest, vat, capital };
}

export function applyWaterfall(received: Decimal, due: PeriodDue, s: LoanState): Application {
  let available = received.plus(s.creditBalance);
  
  const take = (owed: Decimal) => {
    const x = Decimal.min(available, owed);
    available = available.minus(x);
    return x;
  };

  const owedIns = due.insurance.plus(s.arrearsInsurance);
  const owedInt = due.interest.plus(s.arrearsInterest);
  const owedVat = due.vat.plus(s.arrearsVat);
  
  const aIns = take(owedIns);
  const aInt = take(owedInt);
  const aVat = take(owedVat);
  const aCap = take(due.capital);
  
  return {
    applied: { insurance: aIns, interest: aInt, vat: aVat, capital: aCap },
    next: {
      balance: s.balance.minus(aCap),
      arrearsInsurance: owedIns.minus(aIns),
      arrearsInterest: owedInt.minus(aInt),
      arrearsVat: owedVat.minus(aVat),
      creditBalance: available
    }
  };
}
