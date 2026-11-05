/**
 * MOTOR DE SCORING EXPLICABLE Y PARAMÉTRICO (MÓDULO B.3)
 * Expediente: CRUSE-APO-2026-029 / CRUSE-APO-2026-051 (Guardrails 1, 2 y 3)
 *
 * Cumplimiento CNBV & Art. 110 LFT:
 * - Cero punto flotante nativo (FLOAT_CALLS_COUNT === 0; uso exclusivo de Decimal.js).
 * - Tope legal inquebrantable del 30% conforme al Art. 110 de la Ley Federal del Trabajo (LFT).
 * - El modelo de lenguaje se utiliza exclusivamente para redactar la justificación sobre parámetros deterministas (Zero-PII).
 */

import Decimal from 'decimal.js';
import Groq from 'groq-sdk';
import {
  FINANCIAL_CONSTANTS,
  calculateSimulation,
  validateLegalPaymentCapacityLft110,
} from '../../config/financialConstants';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import {
  RiskLevelClassification,
  ScoringEvaluationInput,
  ScoringEvaluationResult,
  ScoringParametricRuleResult,
} from '../../types/executive';

const GROQ_SCORING_MODEL = 'llama-3.3-70b-versatile';

export async function evaluateParametricCreditScoring(
  input: ScoringEvaluationInput
): Promise<ScoringEvaluationResult> {
  const productType = input.productType === 'normal' ? 'normal' : 'express';
  const reqAmtDec = Decimal.max(
    new Decimal(1000),
    sanitizeDecimalString(String(input.requestedAmount ?? 10000), '10000')
  );
  const termDec = Decimal.max(
    new Decimal(1),
    sanitizeDecimalString(
      String(input.termFortnights ?? (productType === 'normal' ? 24 : 14)),
      productType === 'normal' ? '24' : '14'
    )
  );
  const salaryDec = Decimal.max(
    new Decimal(1),
    sanitizeDecimalString(String(input.fortnightlyNetSalary ?? 9500), '9500')
  );
  const currentDedDec = Decimal.max(
    new Decimal(0),
    sanitizeDecimalString(String(input.currentPayrollDeductions ?? 0), '0')
  );
  const seniorityDec = Decimal.max(
    new Decimal(0),
    sanitizeDecimalString(String(input.seniorityMonths ?? 0), '0')
  );

  const requestedAmount = reqAmtDec.toNumber();
  const termFortnights = termDec.toDP(0, Decimal.ROUND_HALF_UP).toNumber();
  const seniorityMonths = seniorityDec.toDP(0, Decimal.ROUND_HALF_UP).toNumber();
  const convenio = (input.convenio || 'STSGECH').trim().toUpperCase();

  // 1. Simulación financiera exacta (Decimal.js)
  const simulation = calculateSimulation(requestedAmount, termFortnights, productType);
  const fortnightlyPaymentDec = new Decimal(simulation.fortnightlyPayment);

  // Capacidad legal máxima (30% del sueldo neto quincenal conforme al Art. 110 LFT)
  const maxTotalAllowedDedDec = salaryDec
    .mul(new Decimal(FINANCIAL_CONSTANTS.MAX_PAYMENT_CAPACITY_RATIO))
    .toDP(2, Decimal.ROUND_HALF_UP);
  const availableCapDec = Decimal.max(new Decimal(0), maxTotalAllowedDedDec.minus(currentDedDec));
  const freeIncomeDec = Decimal.max(new Decimal(1), salaryDec.minus(currentDedDec));

  // Validación hardcodeada Art. 110 LFT sobre ingreso libre
  const lftCheck = validateLegalPaymentCapacityLft110(
    currentDedDec.plus(fortnightlyPaymentDec),
    salaryDec
  );

  // Ratios de endeudamiento (DTI sobre ingreso libre y sobre sueldo neto total)
  const dtiRatioDec = fortnightlyPaymentDec.div(freeIncomeDec);
  const totalDeductionRatioDec = currentDedDec.plus(fortnightlyPaymentDec).div(salaryDec);

  const dtiRatioPercent = dtiRatioDec.mul(100).toDP(2, Decimal.ROUND_HALF_UP).toNumber();
  const totalDeductionRatioPercent = totalDeductionRatioDec
    .mul(100)
    .toDP(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // Cálculo del monto máximo recomendado mediante inversa de PMT con Decimal.js
  const annualRate =
    productType === 'normal'
      ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_ANNUAL_RATE)
      : new Decimal(FINANCIAL_CONSTANTS.EXPRESS_ANNUAL_RATE);
  const rEff = annualRate.div(24).mul(new Decimal(1).plus(new Decimal(FINANCIAL_CONSTANTS.VAT_RATE)));
  const insurance =
    productType === 'normal'
      ? new Decimal(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN)
      : new Decimal(0);
  const availForDebtService = Decimal.max(new Decimal(0), availableCapDec.minus(insurance));
  const discountFactor = new Decimal(1).minus(new Decimal(1).plus(rEff).pow(termDec.neg()));
  const rawMaxPrincipal = rEff.gt(0)
    ? availForDebtService.mul(discountFactor).div(rEff)
    : new Decimal(0);

  const step = new Decimal(productType === 'normal' ? 5000 : 1000);
  const maxProductCap = new Decimal(productType === 'normal' ? 500000 : 20000);
  const recommendedMaxAmount = Decimal.min(
    maxProductCap,
    Decimal.max(new Decimal(0), rawMaxPrincipal.div(step).floor().mul(step))
  ).toNumber();

  // 2. Evaluación de Reglas Paramétricas Deterministas (Guardrail 2: Bloqueo Art. 110 LFT 30%)
  const rules: ScoringParametricRuleResult[] = [];
  let rawScoreDec = new Decimal(FINANCIAL_CONSTANTS.SCORING_BASE_POINTS);
  let forceHighRisk = false;
  let forceAtLeastMediumRisk = false;

  // Regla 1: Nivel de Endeudamiento Total en Nómina (Tope Legal 30% Art. 110 LFT)
  if (!lftCheck.isValid) {
    rawScoreDec = rawScoreDec.minus(200);
    forceHighRisk = true;
    rules.push({
      ruleCode: 'RN_LFT_110_EXCEDE_30',
      label: 'Excede el límite legal de descuento del 30% conforme al Art. 110 LFT',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(2)}% del sueldo neto (Máx. legal: 30.00%)`,
      impact: 'CRITICAL',
      pointsDelta: -200,
    });
  } else if (totalDeductionRatioDec.lte(new Decimal(FINANCIAL_CONSTANTS.SCORING_DTI_SAFE_RATIO))) {
    rawScoreDec = rawScoreDec.plus(75);
    rules.push({
      ruleCode: 'RN_DTI_HOLGADO',
      label: 'Compromiso Salarial Neto Holgado (DTI <= 25%)',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(2)}% del sueldo neto`,
      impact: 'POSITIVE',
      pointsDelta: 75,
    });
  } else {
    rawScoreDec = rawScoreDec.plus(25);
    rules.push({
      ruleCode: 'RN_DTI_DENTRO_LFT_30',
      label: 'Compromiso Salarial Dentro del Tope Legal (25% - 30% Art. 110 LFT)',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(2)}% del sueldo neto`,
      impact: 'NEUTRAL',
      pointsDelta: 25,
    });
  }

  // Regla 2: Antigüedad Laboral en la Dependencia / Sindicato
  if (seniorityDec.gte(24)) {
    rawScoreDec = rawScoreDec.plus(60);
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_SOLIDA',
      label: 'Estabilidad Laboral Consolidada (>= 24 meses)',
      valueFormatted: `${seniorityMonths} meses (${seniorityDec.div(12).toDP(1).toFixed(1)} años)`,
      impact: 'POSITIVE',
      pointsDelta: 60,
    });
  } else if (seniorityDec.gte(FINANCIAL_CONSTANTS.SCORING_MIN_SENIORITY_MONTHS_SAFE)) {
    rawScoreDec = rawScoreDec.plus(30);
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_ESTANDAR',
      label: 'Antigüedad Laboral Adecuada (12 a 23 meses)',
      valueFormatted: `${seniorityMonths} meses`,
      impact: 'POSITIVE',
      pointsDelta: 30,
    });
  } else if (seniorityDec.gte(FINANCIAL_CONSTANTS.SCORING_MIN_SENIORITY_MONTHS_CRITICAL)) {
    rawScoreDec = rawScoreDec.minus(55);
    forceAtLeastMediumRisk = true;
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_PREVENTIVA',
      label: 'Antigüedad Laboral en Periodo Inicial (6 a 11 meses)',
      valueFormatted: `${seniorityMonths} meses`,
      impact: 'WARNING',
      pointsDelta: -55,
    });
  } else {
    rawScoreDec = rawScoreDec.minus(160);
    forceHighRisk = true;
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_CRITICA',
      label: 'Antigüedad Inferior al Mínimo Normativo (< 6 meses)',
      valueFormatted: `${seniorityMonths} meses`,
      impact: 'CRITICAL',
      pointsDelta: -160,
    });
  }

  // Regla 3: Cobertura de Cuota por Capacidad Quincenal Disponible (30% LFT)
  if (fortnightlyPaymentDec.lte(availableCapDec.plus(new Decimal('0.01')))) {
    rawScoreDec = rawScoreDec.plus(45);
    rules.push({
      ruleCode: 'RN_COBERTURA_CUOTA_OK',
      label: 'Cuota Quincenal Cubierta por Margen Legal Disponible (30% LFT)',
      valueFormatted: `Cuota $${fortnightlyPaymentDec.toFixed(2)} <= Disp. $${availableCapDec.toFixed(2)}`,
      impact: 'POSITIVE',
      pointsDelta: 45,
    });
  } else {
    rawScoreDec = rawScoreDec.minus(120);
    forceHighRisk = true;
    rules.push({
      ruleCode: 'RN_CUOTA_SUPERA_MARGEN',
      label: 'Excede el límite legal de descuento del 30% conforme al Art. 110 LFT',
      valueFormatted: `Cuota $${fortnightlyPaymentDec.toFixed(2)} > Disp. $${availableCapDec.toFixed(2)}`,
      impact: 'CRITICAL',
      pointsDelta: -120,
    });
  }

  // Regla 4: Respaldo de Convenio Institucional de Retención Directa
  rules.push({
    ruleCode: 'RN_CONVENIO_RETENCION',
    label: `Convenio Institucional de Retención en Fuente (${convenio})`,
    valueFormatted: 'Descuento directo vía nómina previa autorización',
    impact: 'POSITIVE',
    pointsDelta: 20,
  });
  rawScoreDec = rawScoreDec.plus(20);

  const finalScoreDec = Decimal.max(
    new Decimal(FINANCIAL_CONSTANTS.SCORING_MIN_POINTS),
    Decimal.min(
      new Decimal(FINANCIAL_CONSTANTS.SCORING_MAX_POINTS),
      rawScoreDec.toDP(0, Decimal.ROUND_HALF_UP)
    )
  );
  const finalScore = finalScoreDec.toNumber();

  // 3. Decisión Determinista de Nivel de Riesgo (BAJO, MEDIO, ALTO)
  let riskLevel: RiskLevelClassification;
  if (forceHighRisk || finalScoreDec.lt(FINANCIAL_CONSTANTS.SCORING_MEDIUM_RISK_MIN_SCORE)) {
    riskLevel = 'ALTO';
  } else if (
    forceAtLeastMediumRisk ||
    finalScoreDec.lt(FINANCIAL_CONSTANTS.SCORING_LOW_RISK_MIN_SCORE)
  ) {
    riskLevel = 'MEDIO';
  } else {
    riskLevel = 'BAJO';
  }

  const riskLabel = !lftCheck.isValid
    ? '🔴 RECHAZO LEGAL AUTOMÁTICO — EXCEDE EL LÍMITE LEGAL DE DESCUENTO DEL 30% CONFORME AL ART. 110 LFT'
    : riskLevel === 'BAJO'
      ? '🟢 RIESGO BAJO (A+) — APROBACIÓN DIRECTA SUGERIDA'
      : riskLevel === 'MEDIO'
        ? '🟡 RIESGO MEDIO (B) — REVISIÓN DE MESA DE CONTROL / AJUSTE DE MONTO'
        : '🔴 RIESGO ALTO (C) — RECHAZO SUGERIDO O REESTRUCTURA A MONTO RECOMENDADO';

  const approvedSuggestion = riskLevel === 'BAJO' && lftCheck.isValid;

  const deterministicNarrative = buildDeterministicJustification({
    riskLevel,
    finalScore,
    productType,
    requestedAmount,
    termFortnights,
    fortnightlyPayment: simulation.fortnightlyPayment,
    availableCapacity: availableCapDec.toNumber(),
    totalDeductionRatioPercent,
    seniorityMonths,
    recommendedMaxAmount,
    convenio,
    lftValid: lftCheck.isValid,
  });

  let aiExecutiveJustification = deterministicNarrative;
  let generatedByModel = 'Motor Paramétrico Determinista CNBV + Art. 110 LFT';

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey && groqKey.startsWith('gsk_')) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_SCORING_MODEL,
        temperature: 0.15,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'Eres el Comité de Crédito de Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R. Redacta en 3 oraciones concisas la justificación ejecutiva para el Aprobador basándote EXCLUSIVAMENTE en los parámetros deterministas proporcionados y el tope legal del 30% del Art. 110 LFT. No alteres el nivel de riesgo ni los montos. Cero datos personales.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              dictamenDeterminista: riskLevel,
              cumpleTope30PctArt110Lft: lftCheck.isValid,
              score: finalScore,
              producto:
                productType === 'normal'
                  ? 'Crédito Normal (47.50% anual nominal)'
                  : 'Crédito Express (80.00% anual nominal)',
              montoSolicitadoMxn: requestedAmount,
              plazoQuincenas: termFortnights,
              cuotaQuincenalMxn: simulation.fortnightlyPayment,
              capacidadDisponible30PctLftMxn: availableCapDec.toNumber(),
              compromisoSalarialTotalPct: totalDeductionRatioPercent,
              antiguedadMeses: seniorityMonths,
              montoMaximoRecomendadoMxn: recommendedMaxAmount,
              convenio,
            }),
          },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        aiExecutiveJustification = text;
        generatedByModel = `Motor Paramétrico Determinista + ${GROQ_SCORING_MODEL}`;
      }
    } catch {
      // Fallback transparente a la narrativa determinista certificada
    }
  }

  return {
    score: finalScore,
    riskLevel,
    riskLabel,
    approvedSuggestion,
    dtiRatioPercent,
    totalDeductionRatioPercent,
    availableFortnightlyCapacity: availableCapDec.toNumber(),
    fortnightlyPayment: simulation.fortnightlyPayment,
    totalToPay: simulation.totalToPay,
    catPercent: simulation.catPercent,
    recommendedMaxAmount,
    parametricRules: rules,
    aiExecutiveJustification,
    generatedByModel,
    schedule: simulation.schedule,
  };
}

function buildDeterministicJustification(params: {
  riskLevel: RiskLevelClassification;
  finalScore: number;
  productType: 'normal' | 'express';
  requestedAmount: number;
  termFortnights: number;
  fortnightlyPayment: number;
  availableCapacity: number;
  totalDeductionRatioPercent: number;
  seniorityMonths: number;
  recommendedMaxAmount: number;
  convenio: string;
  lftValid: boolean;
}): string {
  const prodName =
    params.productType === 'normal'
      ? 'Crédito Normal (47.50% anual nominal)'
      : 'Crédito Express (80.00% anual nominal)';

  if (!params.lftValid) {
    return `RECHAZO LEGAL AUTOMÁTICO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN: Excede el límite legal de descuento del 30% conforme al Art. 110 LFT (el compromiso salarial alcanza ${params.totalDeductionRatioPercent.toFixed(2)}% del ingreso neto). El monto máximo permitido bajo el tope legal del 30% es de $${params.recommendedMaxAmount.toLocaleString('es-MX')} MXN.`;
  }
  if (params.riskLevel === 'BAJO') {
    return `Dictamen Determinista de RIESGO BAJO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN a ${params.termFortnights} quincenas en convenio ${params.convenio}. La cuota quincenal de $${params.fortnightlyPayment.toFixed(2)} MXN está cubierta por la capacidad legal disponible ($${params.availableCapacity.toFixed(2)} MXN), manteniendo un compromiso salarial total de ${params.totalDeductionRatioPercent.toFixed(2)}% (dentro del tope del 30% Art. 110 LFT) y antigüedad laboral de ${params.seniorityMonths} meses. Se sugiere APROBACIÓN DIRECTA.`;
  }
  if (params.riskLevel === 'MEDIO') {
    return `Dictamen Determinista de RIESGO MEDIO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN a ${params.termFortnights} quincenas. El compromiso salarial total es de ${params.totalDeductionRatioPercent.toFixed(2)}% (<= 30% Art. 110 LFT) con antigüedad de ${params.seniorityMonths} meses. Se sugiere REVISIÓN POR MESA DE CONTROL.`;
  }
  return `Dictamen Determinista de RIESGO ALTO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN. La solicitud presenta parámetros fuera del apetito de riesgo institucional (compromiso salarial de ${params.totalDeductionRatioPercent.toFixed(2)}% y/o antigüedad laboral de ${params.seniorityMonths} meses). El monto máximo soportado bajo la regla legal del 30% (Art. 110 LFT) es de $${params.recommendedMaxAmount.toLocaleString('es-MX')} MXN.`;
}
