/**
 * REGLAS PARAMETRIZADAS DE CAPACIDAD DE PAGO POR CONVENIO INSTITUCIONAL Y RENOVACIONES
 * Expediente: CRUSE-APO-2026-067 (Hallazgo B.5 + Guardrail Forense 8 Anti-God-Object)
 *
 * Distingue el marco normativo aplicable por tipo de convenio:
 * - Trabajadores al Servicio del Estado (STSGECH, Supremo Tribunal, Jubilados):
 *   Código Administrativo del Estado de Chihuahua / Reglas del Convenio de Retención.
 * - Sector Privado / Convenio General:
 *   Artículo 110 Fracc. IV de la Ley Federal del Trabajo (tope 30% sobre excedente del SMG).
 */

import Decimal from 'decimal.js';

export type ConvenioCapacityBase = 'NET_PERIODIC_INCOME' | 'EXCEDENTE_SMG_LFT_110';

export interface ConvenioCapacityPolicy {
  readonly code: string;
  readonly label: string;
  readonly legalBasis: string;
  readonly capacityBase: ConvenioCapacityBase;
  readonly maxDiscountRatio: string;
  readonly fortnightlyMinWageMxn: string;
}

export const CONVENIO_CAPACITY_POLICIES: Readonly<Record<string, ConvenioCapacityPolicy>> = {
  STSGECH: {
    code: 'STSGECH',
    label: 'Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH)',
    legalBasis: 'Convenio Institucional de Retención STSGECH y Código Administrativo del Estado de Chihuahua (tope prudencial 30% sobre ingreso neto libre).',
    capacityBase: 'NET_PERIODIC_INCOME',
    maxDiscountRatio: '0.30',
    fortnightlyMinWageMxn: '4182.00',
  },
  SUPREMO_TRIBUNAL: {
    code: 'SUPREMO_TRIBUNAL',
    label: 'Supremo Tribunal de Justicia del Estado de Chihuahua',
    legalBasis: 'Convenio de Retención por Nómina del Poder Judicial del Estado de Chihuahua (tope prudencial 30% sobre ingreso neto libre).',
    capacityBase: 'NET_PERIODIC_INCOME',
    maxDiscountRatio: '0.30',
    fortnightlyMinWageMxn: '4182.00',
  },
  JUBILADOS_CHIH: {
    code: 'JUBILADOS_CHIH',
    label: 'Jubilados y Pensionados de Gobierno del Estado de Chihuahua',
    legalBasis: 'Convenio Institucional de Pensionados y Política Prudencial Cruse (tope 30% sobre pensión neta libre).',
    capacityBase: 'NET_PERIODIC_INCOME',
    maxDiscountRatio: '0.30',
    fortnightlyMinWageMxn: '4182.00',
  },
  PRIVADO_LFT_110: {
    code: 'PRIVADO_LFT_110',
    label: 'Convenio Privado (Ley Federal del Trabajo)',
    legalBasis: 'Artículo 110 Fracción IV de la Ley Federal del Trabajo (tope 30% sobre el excedente del salario mínimo general).',
    capacityBase: 'EXCEDENTE_SMG_LFT_110',
    maxDiscountRatio: '0.30',
    fortnightlyMinWageMxn: '4182.00',
  },
};

export interface ConvenioCapacityEvaluationInput {
  convenioName?: string | null;
  periodicPayment: number | string | Decimal;
  netPeriodicIncome: number | string | Decimal;
  isRenewal?: boolean;
  priorLoanId?: string | null;
  priorLoanPeriodicDiscountToRelease?: number | string | Decimal;
  priorLoanBalanceToLiquidate?: number | string | Decimal;
  requestedPrincipal?: number | string | Decimal;
}

export interface ConvenioCapacityEvaluationResult {
  isValid: boolean;
  policyCode: string;
  legalBasis: string;
  computableBaseIncome: string;
  maxAllowedPayment: string;
  ratioPercent: string;
  netDisbursementCheckAmount: string;
  errorMessage: string | null;
}

export function resolveConvenioPolicy(convenioName?: string | null): ConvenioCapacityPolicy {
  const normalized = String(convenioName ?? '').trim().toUpperCase();
  if (normalized.includes('SUPREMO') || normalized.includes('TRIBUNAL')) {
    return CONVENIO_CAPACITY_POLICIES.SUPREMO_TRIBUNAL!;
  }
  if (normalized.includes('JUBILAD') || normalized.includes('PENSION')) {
    return CONVENIO_CAPACITY_POLICIES.JUBILADOS_CHIH!;
  }
  if (normalized.includes('PRIVAD') || normalized.includes('LFT')) {
    return CONVENIO_CAPACITY_POLICIES.PRIVADO_LFT_110!;
  }
  return CONVENIO_CAPACITY_POLICIES.STSGECH!;
}

/**
 * Candado transaccional de renovaciones (Hallazgo B.5):
 * Impide liberar capacidad de descuento si no existe un priorLoanId verificable
 * cuyo saldo insoluto quede retenido del cheque neto a dispersar.
 */
export function evaluateConvenioPaymentCapacity(
  input: ConvenioCapacityEvaluationInput
): ConvenioCapacityEvaluationResult {
  const policy = resolveConvenioPolicy(input.convenioName);
  const paymentDec = new Decimal(input.periodicPayment).toDP(2, Decimal.ROUND_HALF_UP);
  const baseIncomeDec = new Decimal(input.netPeriodicIncome).toDP(2, Decimal.ROUND_HALF_UP);
  const requestedPrincipalDec = Decimal.max(0, new Decimal(input.requestedPrincipal ?? 0)).toDP(2, Decimal.ROUND_HALF_UP);

  if (input.isRenewal) {
    const cleanPriorId = String(input.priorLoanId ?? '').trim();
    const priorBalDec = new Decimal(input.priorLoanBalanceToLiquidate ?? 0).toDP(2, Decimal.ROUND_HALF_UP);
    if (!cleanPriorId || priorBalDec.lte(0)) {
      return {
        isValid: false,
        policyCode: policy.code,
        legalBasis: policy.legalBasis,
        computableBaseIncome: baseIncomeDec.toFixed(2),
        maxAllowedPayment: '0.00',
        ratioPercent: '100.00',
        netDisbursementCheckAmount: '0.00',
        errorMessage:
          'CANDADO DE RENOVACIÓN: Para liberar el descuento de un crédito anterior es obligatorio vincular el priorLoanId activo y retener su saldo insoluto de la dispersión neta.',
      };
    }
  }

  const releasedDiscountDec = input.isRenewal
    ? Decimal.max(0, new Decimal(input.priorLoanPeriodicDiscountToRelease ?? 0)).toDP(2, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const priorBalanceDec = input.isRenewal
    ? Decimal.max(0, new Decimal(input.priorLoanBalanceToLiquidate ?? 0)).toDP(2, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const netCheckDec = Decimal.max(0, requestedPrincipalDec.minus(priorBalanceDec)).toDP(2, Decimal.ROUND_HALF_UP);

  const adjustedIncome = baseIncomeDec.plus(releasedDiscountDec).toDP(2, Decimal.ROUND_HALF_UP);
  const computableBase =
    policy.capacityBase === 'EXCEDENTE_SMG_LFT_110'
      ? Decimal.max(0, adjustedIncome.minus(new Decimal(policy.fortnightlyMinWageMxn))).toDP(2, Decimal.ROUND_HALF_UP)
      : adjustedIncome;

  const maxRatio = new Decimal(policy.maxDiscountRatio);
  const maxAllowed = computableBase.times(maxRatio).toDP(2, Decimal.ROUND_HALF_UP);

  if (computableBase.lte(0) || paymentDec.gt(maxAllowed.plus(new Decimal('0.01')))) {
    const pct = computableBase.gt(0)
      ? paymentDec.dividedBy(computableBase).times(100).toDP(2, Decimal.ROUND_HALF_UP).toFixed(2)
      : '100.00';
    return {
      isValid: false,
      policyCode: policy.code,
      legalBasis: policy.legalBasis,
      computableBaseIncome: computableBase.toFixed(2),
      maxAllowedPayment: maxAllowed.toFixed(2),
      ratioPercent: pct,
      netDisbursementCheckAmount: netCheckDec.toFixed(2),
      errorMessage: `Excede el límite máximo permitido (${maxRatio.times(100).toFixed(0)}%) conforme a: ${policy.legalBasis}`,
    };
  }

  return {
    isValid: true,
    policyCode: policy.code,
    legalBasis: policy.legalBasis,
    computableBaseIncome: computableBase.toFixed(2),
    maxAllowedPayment: maxAllowed.toFixed(2),
    ratioPercent: paymentDec.dividedBy(computableBase).times(100).toDP(2, Decimal.ROUND_HALF_UP).toFixed(2),
    netDisbursementCheckAmount: netCheckDec.toFixed(2),
    errorMessage: null,
  };
}
