/**
 * CONFIGURACIÓN Y MOTOR MATEMÁTICO DE LA MATRIZ DE RIESGO INICIAL PLD/FT (DIAGRAMA LIC. GERARDO)
 *
 * @implements CRUSE-APO-2026-042 (Evidencia Forense #1 — Regla 2 HRU Cero Hardcoding)
 * @implements Regla 6 SQA: Uso exclusivo de Decimal.js (Cero Number() ni parseFloat() en cálculos)
 */

import Decimal from 'decimal.js';
import {
  CnbvRiskGrade,
  OccupationRiskCategory,
  RiskListScreeningCategory,
  RiskMatrixEvaluationInput,
  RiskMatrixEvaluationResult,
} from '../types/phase2Compliance';

export interface RiskMatrixConfig {
  /** Pesos ponderados de los 5 factores del Diagrama del Lic. Gerardo (Suman exactamente 1.00) */
  readonly factorWeights: {
    readonly occupationWeight: string;           // 0.25 (25%) — Ocupación / Giro
    readonly transactionalProfileWeight: string; // 0.25 (25%) — Perfil Transaccional Inicial (Monto / Ingreso)
    readonly geographicHubWeight: string;        // 0.15 (15%) — Zona Geográfica / Hub
    readonly productChannelWeight: string;       // 0.15 (15%) — Producto (Clásico vs Express vs Especial)
    readonly screeningListWeight: string;        // 0.20 (20%) — Resultado de Cruce en Listas
  };
  /** Puntajes intrínsecos por categoría (Escala 0 a 100 como strings exactos para Decimal.js) */
  readonly occupationScores: Readonly<Record<OccupationRiskCategory, string>>;
  readonly geographicHubScores: Readonly<Record<'CHIHUAHUA' | 'LEON' | 'CANCUN' | 'OTHER', string>>;
  readonly productTypeScores: Readonly<Record<'normal' | 'express' | 'especial', string>>;
  readonly listStatusScores: Readonly<Record<RiskListScreeningCategory, string>>;
  /** Reglas del Perfil Transaccional Inicial (Razón Cuota/Ingreso y Monto Solicitado) */
  readonly transactionalProfileRules: {
    readonly lowDebtRatioMax: string;          // '0.30' (30% del ingreso neto)
    readonly mediumDebtRatioMax: string;       // '0.45' (45% del ingreso neto)
    readonly lowAmountMaxMxn: string;          // '50000.00'
    readonly mediumAmountMaxMxn: string;       // '100000.00'
    readonly lowProfileScore: string;          // '15.00'
    readonly mediumProfileScore: string;       // '50.00'
    readonly highProfileScore: string;         // '85.00'
  };
  /** Umbrales de corte para dictaminar Grado de Riesgo Inicial (Sobrescribibles desde system_financial_parameters) */
  readonly thresholds: {
    readonly mediumRiskMinScore: string;       // Default: '35.00' (0 a 34.99 = BAJO)
    readonly highRiskMinScore: string;         // Default: '65.00' (35.00 a 64.99 = MEDIO; >= 65.00 = ALTO)
    readonly semesterReviewDays: number;       // Default: 180 días (6 meses — Diagrama Lic. Gerardo)
  };
}

export const DEFAULT_CNBV_RISK_MATRIX_CONFIG: RiskMatrixConfig = {
  factorWeights: {
    occupationWeight: '0.25',
    transactionalProfileWeight: '0.25',
    geographicHubWeight: '0.15',
    productChannelWeight: '0.15',
    screeningListWeight: '0.20',
  },
  occupationScores: {
    PUBLIC_SERVANT_UNIONIZED: '15.00',
    JUDICIAL_MAGISTRATE_ADMIN: '25.00',
    UNSPECIFIED_OR_INFORMAL: '60.00',
    HIGH_RISK_CASH_INTENSIVE: '85.00',
    PEP_OR_HIGH_PUBLIC_OFFICIAL: '100.00',
  },
  geographicHubScores: {
    CHIHUAHUA: '25.00',
    LEON: '25.00',
    CANCUN: '45.00', // Mayor ponderación turística/divisas según ENR SHCP
    OTHER: '50.00',
  },
  productTypeScores: {
    normal: '15.00',   // Retención directa por nómina (bajo riesgo de efectivo)
    express: '35.00',  // Plazo corto / emergencia
    especial: '75.00', // Línea abierta con disposiciones/abonos directos
  },
  listStatusScores: {
    CLEAN: '0.00',
    GRAY_LIST_PEP_OR_PRESUNTO: '85.00',
    BLACK_LIST_BLOCKED: '100.00',
  },
  transactionalProfileRules: {
    lowDebtRatioMax: '0.30',
    mediumDebtRatioMax: '0.45',
    lowAmountMaxMxn: '50000.00',
    mediumAmountMaxMxn: '100000.00',
    lowProfileScore: '15.00',
    mediumProfileScore: '50.00',
    highProfileScore: '85.00',
  },
  thresholds: {
    mediumRiskMinScore: '35.00',
    highRiskMinScore: '65.00',
    semesterReviewDays: 180,
  },
};

/**
 * Sanitiza un string numérico para Decimal.js sin usar jamás Number() ni parseFloat().
 */
export function sanitizeDecimalString(raw: string | undefined | null, fallback: string = '0.00'): Decimal {
  if (!raw) return new Decimal(fallback);
  const cleaned = raw.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return new Decimal(fallback);
  }
  try {
    return new Decimal(cleaned);
  } catch {
    return new Decimal(fallback);
  }
}

/**
 * Evalúa de forma 100% determinista con Decimal.js la Matriz de Riesgo Inicial del Lic. Gerardo:
 * S_total = round_half_up( sum_{i=1}^5 (P_i * w_i), 2 )
 */
export function evaluateCnbvRiskMatrixDeterministic(
  input: RiskMatrixEvaluationInput,
  customThresholds?: {
    mediumRiskMinScore?: string;
    highRiskMinScore?: string;
    semesterReviewDays?: number;
  },
  config: RiskMatrixConfig = DEFAULT_CNBV_RISK_MATRIX_CONFIG
): RiskMatrixEvaluationResult {
  const wOcc = new Decimal(config.factorWeights.occupationWeight);
  const wProf = new Decimal(config.factorWeights.transactionalProfileWeight);
  const wGeo = new Decimal(config.factorWeights.geographicHubWeight);
  const wProd = new Decimal(config.factorWeights.productChannelWeight);
  const wList = new Decimal(config.factorWeights.screeningListWeight);

  const pOcc = new Decimal(config.occupationScores[input.occupationCategory]);
  const pGeo = new Decimal(config.geographicHubScores[input.hubRegion]);
  const pProd = new Decimal(config.productTypeScores[input.productType]);
  const pList = new Decimal(config.listStatusScores[input.listScreeningCategory]);

  // Cálculo del Perfil Transaccional Inicial (R = Cuota Quincenal / Ingreso Neto Quincenal) con Decimal.js
  const requestedAmount = sanitizeDecimalString(input.requestedAmountMxn, '0.00');
  const fortnightlyQuota = sanitizeDecimalString(input.projectedFortnightlyQuotaMxn, '0.00');
  const netIncome = sanitizeDecimalString(input.extractedFortnightlyNetIncomeMxn, '0.00');

  const debtToIncomeRatio = netIncome.greaterThan(new Decimal('0'))
    ? fortnightlyQuota.dividedBy(netIncome)
    : new Decimal('1.00');

  const lowRatioMax = new Decimal(config.transactionalProfileRules.lowDebtRatioMax);
  const medRatioMax = new Decimal(config.transactionalProfileRules.mediumDebtRatioMax);
  const lowAmtMax = new Decimal(config.transactionalProfileRules.lowAmountMaxMxn);
  const medAmtMax = new Decimal(config.transactionalProfileRules.mediumAmountMaxMxn);

  let pProf: Decimal;
  if (debtToIncomeRatio.lessThanOrEqualTo(lowRatioMax) && requestedAmount.lessThanOrEqualTo(lowAmtMax)) {
    pProf = new Decimal(config.transactionalProfileRules.lowProfileScore);
  } else if (debtToIncomeRatio.lessThanOrEqualTo(medRatioMax) && requestedAmount.lessThanOrEqualTo(medAmtMax)) {
    pProf = new Decimal(config.transactionalProfileRules.mediumProfileScore);
  } else {
    pProf = new Decimal(config.transactionalProfileRules.highProfileScore);
  }

  // Suma ponderada: S_total = round_half_up( sum(P_i * w_i), 2 )
  const weightedSum = pOcc
    .times(wOcc)
    .plus(pProf.times(wProf))
    .plus(pGeo.times(wGeo))
    .plus(pProd.times(wProd))
    .plus(pList.times(wList))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const tMedium = sanitizeDecimalString(
    customThresholds?.mediumRiskMinScore ?? config.thresholds.mediumRiskMinScore,
    config.thresholds.mediumRiskMinScore
  );
  const tHigh = sanitizeDecimalString(
    customThresholds?.highRiskMinScore ?? config.thresholds.highRiskMinScore,
    config.thresholds.highRiskMinScore
  );

  const forcedHighRiskByList =
    input.listScreeningCategory === 'GRAY_LIST_PEP_OR_PRESUNTO' ||
    input.listScreeningCategory === 'BLACK_LIST_BLOCKED' ||
    input.occupationCategory === 'PEP_OR_HIGH_PUBLIC_OFFICIAL';

  const requiresDirectionAuthorization =
    input.listScreeningCategory === 'GRAY_LIST_PEP_OR_PRESUNTO' ||
    input.occupationCategory === 'PEP_OR_HIGH_PUBLIC_OFFICIAL';

  let initialRiskGrade: CnbvRiskGrade;
  if (forcedHighRiskByList || weightedSum.greaterThanOrEqualTo(tHigh)) {
    initialRiskGrade = 'ALTO';
  } else if (weightedSum.greaterThanOrEqualTo(tMedium)) {
    initialRiskGrade = 'MEDIO';
  } else {
    initialRiskGrade = 'BAJO';
  }

  return {
    weightedScore: weightedSum.toFixed(2),
    initialRiskGrade,
    forcedHighRiskByList,
    requiresDirectionAuthorization,
    breakdown: {
      occupationScore: pOcc.toFixed(2),
      transactionalProfileScore: pProf.toFixed(2),
      geographicHubScore: pGeo.toFixed(2),
      productChannelScore: pProd.toFixed(2),
      screeningListScore: pList.toFixed(2),
      debtToIncomeRatio: debtToIncomeRatio.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    },
    semesterReviewDays: customThresholds?.semesterReviewDays ?? config.thresholds.semesterReviewDays,
  };
}
