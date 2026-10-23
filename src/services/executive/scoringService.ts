/**
 * MOTOR DE SCORING EXPLICABLE Y PARAMÉTRICO (MÓDULO B.3)
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 3
 *
 * Cumplimiento CNBV:
 * - La clasificación de riesgo (BAJO, MEDIO, ALTO) y el puntaje (300–950) se calculan
 *   100% mediante reglas paramétricas deterministas y aritmética exacta (Decimal.js).
 * - El modelo de lenguaje (Groq LLaMA 3.3 70B) se utiliza EXCLUSIVAMENTE para redactar
 *   el texto de justificación ejecutiva basado en los parámetros calculados (Zero-PII).
 */

import Decimal from 'decimal.js';
import Groq from 'groq-sdk';
import {
  FINANCIAL_CONSTANTS,
  calculateSimulation,
} from '../../config/financialConstants';
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
  const requestedAmount = Math.max(1000, Number(input.requestedAmount) || 10000);
  const termFortnights = Math.max(1, Number(input.termFortnights) || (productType === 'normal' ? 24 : 14));
  const fortnightlyNetSalary = Math.max(1, Number(input.fortnightlyNetSalary) || 9500);
  const currentPayrollDeductions = Math.max(0, Number(input.currentPayrollDeductions) || 0);
  const seniorityMonths = Math.max(0, Number(input.seniorityMonths) || 0);
  const convenio = (input.convenio || 'STSGECH').trim().toUpperCase();

  // 1. Simulación financiera exacta (Decimal.js)
  const simulation = calculateSimulation(requestedAmount, termFortnights, productType);
  const fortnightlyPaymentDec = new Decimal(simulation.fortnightlyPayment);
  const salaryDec = new Decimal(fortnightlyNetSalary);
  const currentDedDec = new Decimal(currentPayrollDeductions);

  // Capacidad institucional máxima (35% del sueldo neto quincenal)
  const maxTotalAllowedDedDec = salaryDec
    .times(FINANCIAL_CONSTANTS.MAX_PAYMENT_CAPACITY_RATIO)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const availableCapDec = Decimal.max(0, maxTotalAllowedDedDec.minus(currentDedDec));
  const freeIncomeDec = Decimal.max(1, salaryDec.minus(currentDedDec));

  // Ratios de endeudamiento (DTI sobre ingreso libre y sobre sueldo neto total)
  const dtiRatioDec = fortnightlyPaymentDec.dividedBy(freeIncomeDec);
  const totalDeductionRatioDec = currentDedDec.plus(fortnightlyPaymentDec).dividedBy(salaryDec);

  const dtiRatioPercent = dtiRatioDec.times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const totalDeductionRatioPercent = totalDeductionRatioDec
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // Cálculo del monto máximo recomendado según capacidad disponible real
  const factorBase =
    productType === 'normal'
      ? new Decimal(FINANCIAL_CONSTANTS.NORMAL_AMORTIZATION_FACTOR_24Q)
      : new Decimal(FINANCIAL_CONSTANTS.EXPRESS_AMORTIZATION_FACTOR_6Q);
  const step = productType === 'normal' ? 1000 : 500;
  const maxProductCap = productType === 'normal' ? 500000 : 20000;
  const rawMaxPrincipal = availableCapDec.times(termFortnights).dividedBy(factorBase);
  const recommendedMaxAmount = Math.min(
    maxProductCap,
    Math.max(0, rawMaxPrincipal.dividedBy(step).floor().times(step).toNumber())
  );

  // 2. Evaluación de Reglas Paramétricas Deterministas (Guardrail Forense 3)
  const rules: ScoringParametricRuleResult[] = [];
  let rawScore = FINANCIAL_CONSTANTS.SCORING_BASE_POINTS;
  let forceHighRisk = false;
  let forceAtLeastMediumRisk = false;

  // Regla 1: Nivel de Endeudamiento Total en Nómina (Tope 35% Institucional)
  const totalRatio = totalDeductionRatioDec.toNumber();
  if (totalRatio <= FINANCIAL_CONSTANTS.SCORING_DTI_SAFE_RATIO) {
    rawScore += 75;
    rules.push({
      ruleCode: 'RN_DTI_HOLGADO',
      label: 'Compromiso Salarial Neto (DTI <= 28%)',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(1)}% del sueldo neto`,
      impact: 'POSITIVE',
      pointsDelta: 75,
    });
  } else if (totalRatio <= FINANCIAL_CONSTANTS.SCORING_DTI_MODERATE_RATIO) {
    rawScore += 25;
    rules.push({
      ruleCode: 'RN_DTI_INSTITUCIONAL',
      label: 'Compromiso Salarial Dentro de Tope (28% - 35%)',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(1)}% del sueldo neto`,
      impact: 'NEUTRAL',
      pointsDelta: 25,
    });
  } else if (totalRatio <= FINANCIAL_CONSTANTS.SCORING_DTI_HIGH_RATIO) {
    rawScore -= 65;
    forceAtLeastMediumRisk = true;
    rules.push({
      ruleCode: 'RN_DTI_EXCEDE_35',
      label: 'Excede Tope Ordinario del 35% (35% - 40%)',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(1)}% del sueldo neto`,
      impact: 'WARNING',
      pointsDelta: -65,
    });
  } else {
    rawScore -= 170;
    forceHighRisk = true;
    rules.push({
      ruleCode: 'RN_DTI_CRITICO_40',
      label: 'Sobreendeudamiento Crítico (> 40% del Sueldo Neto)',
      valueFormatted: `${totalDeductionRatioPercent.toFixed(1)}% del sueldo neto`,
      impact: 'CRITICAL',
      pointsDelta: -170,
    });
  }

  // Regla 2: Antigüedad Laboral en la Dependencia / Sindicato
  if (seniorityMonths >= 24) {
    rawScore += 60;
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_SOLIDA',
      label: 'Estabilidad Laboral Consolidada (>= 24 meses)',
      valueFormatted: `${seniorityMonths} meses (${(seniorityMonths / 12).toFixed(1)} años)`,
      impact: 'POSITIVE',
      pointsDelta: 60,
    });
  } else if (seniorityMonths >= FINANCIAL_CONSTANTS.SCORING_MIN_SENIORITY_MONTHS_SAFE) {
    rawScore += 30;
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_ESTANDAR',
      label: 'Antigüedad Laboral Adecuada (12 a 23 meses)',
      valueFormatted: `${seniorityMonths} meses`,
      impact: 'POSITIVE',
      pointsDelta: 30,
    });
  } else if (seniorityMonths >= FINANCIAL_CONSTANTS.SCORING_MIN_SENIORITY_MONTHS_CRITICAL) {
    rawScore -= 55;
    forceAtLeastMediumRisk = true;
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_PREVENTIVA',
      label: 'Antigüedad Laboral en Periodo Inicial (6 a 11 meses)',
      valueFormatted: `${seniorityMonths} meses`,
      impact: 'WARNING',
      pointsDelta: -55,
    });
  } else {
    rawScore -= 160;
    forceHighRisk = true;
    rules.push({
      ruleCode: 'RN_ANTIGUEDAD_CRITICA',
      label: 'Antigüedad Inferior al Mínimo Normativo (< 6 meses)',
      valueFormatted: `${seniorityMonths} meses`,
      impact: 'CRITICAL',
      pointsDelta: -160,
    });
  }

  // Regla 3: Cobertura de Cuota por Capacidad Quincenal Disponible
  if (simulation.fortnightlyPayment <= availableCapDec.toNumber()) {
    rawScore += 45;
    rules.push({
      ruleCode: 'RN_COBERTURA_CUOTA_OK',
      label: 'Cuota Quincenal Cubierta por Margen Libre (35%)',
      valueFormatted: `Cuota $${simulation.fortnightlyPayment.toFixed(2)} <= Disp. $${availableCapDec.toFixed(2)}`,
      impact: 'POSITIVE',
      pointsDelta: 45,
    });
  } else {
    rawScore -= 85;
    forceAtLeastMediumRisk = true;
    rules.push({
      ruleCode: 'RN_CUOTA_SUPERA_MARGEN',
      label: 'Cuota Quincenal Supera Margen Libre Disponible',
      valueFormatted: `Cuota $${simulation.fortnightlyPayment.toFixed(2)} > Disp. $${availableCapDec.toFixed(2)}`,
      impact: 'WARNING',
      pointsDelta: -85,
    });
  }

  // Regla 4: Respaldo de Convenio Institucional de Retención Directa
  rules.push({
    ruleCode: 'RN_CONVENIO_RETENCION',
    label: `Convenio Institucional de Retención en Fuente (${convenio})`,
    valueFormatted: 'Descuento directo vía nómina antes de dispersión',
    impact: 'POSITIVE',
    pointsDelta: 20,
  });
  rawScore += 20;

  const finalScore = Math.max(
    FINANCIAL_CONSTANTS.SCORING_MIN_POINTS,
    Math.min(FINANCIAL_CONSTANTS.SCORING_MAX_POINTS, Math.round(rawScore))
  );

  // 3. Decisión Determinista de Nivel de Riesgo (BAJO, MEDIO, ALTO)
  let riskLevel: RiskLevelClassification;
  if (forceHighRisk || finalScore < FINANCIAL_CONSTANTS.SCORING_MEDIUM_RISK_MIN_SCORE) {
    riskLevel = 'ALTO';
  } else if (forceAtLeastMediumRisk || finalScore < FINANCIAL_CONSTANTS.SCORING_LOW_RISK_MIN_SCORE) {
    riskLevel = 'MEDIO';
  } else {
    riskLevel = 'BAJO';
  }

  const riskLabel =
    riskLevel === 'BAJO'
      ? '🟢 RIESGO BAJO (A+) — APROBACIÓN DIRECTA SUGERIDA'
      : riskLevel === 'MEDIO'
        ? '🟡 RIESGO MEDIO (B) — REVISIÓN DE MESA DE CONTROL / AJUSTE DE MONTO'
        : '🔴 RIESGO ALTO (C) — RECHAZO SUGERIDO O REESTRUCTURA A MONTO RECOMENDADO';

  const approvedSuggestion = riskLevel === 'BAJO';

  // 4. Redacción Ejecutiva Explicable (IA sobre parámetros deterministas — Cero PII)
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
  });

  let aiExecutiveJustification = deterministicNarrative;
  let generatedByModel = 'Motor Paramétrico Determinista CNBV + Plantilla Explicable';

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
              'Eres el Comité de Crédito de Microfinanciera Cruse SOFOM E.N.R. Redacta en 3 oraciones concisas la justificación ejecutiva para el Aprobador basándote EXCLUSIVAMENTE en los parámetros deterministas proporcionados. No alteres el nivel de riesgo ni los montos. Cero datos personales.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              dictamenDeterminista: riskLevel,
              score: finalScore,
              producto: productType === 'normal' ? 'Crédito Clásico (1.97% qnal)' : 'Crédito Express (3.33% qnal)',
              montoSolicitadoMxn: requestedAmount,
              plazoQuincenas: termFortnights,
              cuotaQuincenalMxn: simulation.fortnightlyPayment,
              capacidadDisponible35PctMxn: availableCapDec.toNumber(),
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
}): string {
  const prodName = params.productType === 'normal' ? 'Crédito Clásico (1.97% qnal)' : 'Crédito Express (3.33% qnal)';
  if (params.riskLevel === 'BAJO') {
    return `Dictamen Determinista de RIESGO BAJO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN a ${params.termFortnights} quincenas en convenio ${params.convenio}. La cuota quincenal de $${params.fortnightlyPayment.toFixed(2)} MXN se encuentra holgadamente cubierta por la capacidad neta disponible ($${params.availableCapacity.toFixed(2)} MXN), manteniendo un compromiso salarial total de ${params.totalDeductionRatioPercent.toFixed(1)}% (dentro del tope normativo del 35%) y antigüedad laboral de ${params.seniorityMonths} meses. Se sugiere APROBACIÓN DIRECTA.`;
  }
  if (params.riskLevel === 'MEDIO') {
    return `Dictamen Determinista de RIESGO MEDIO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN a ${params.termFortnights} quincenas. El compromiso salarial total alcanza ${params.totalDeductionRatioPercent.toFixed(1)}% del sueldo neto con una antigüedad de ${params.seniorityMonths} meses y cuota de $${params.fortnightlyPayment.toFixed(2)} MXN frente a un margen disponible de $${params.availableCapacity.toFixed(2)} MXN. Se sugiere REVISIÓN POR MESA DE CONTROL o ajustar el monto al tope paramétrico recomendado de $${params.recommendedMaxAmount.toLocaleString('es-MX')} MXN.`;
  }
  return `Dictamen Determinista de RIESGO ALTO (${params.finalScore}/950 pts) para ${prodName} por $${params.requestedAmount.toLocaleString('es-MX')} MXN. La solicitud presenta parámetros fuera de apetito de riesgo institucional (compromiso salarial de ${params.totalDeductionRatioPercent.toFixed(1)}% del ingreso neto y/o antigüedad laboral de ${params.seniorityMonths} meses frente al mínimo normativo de 6 meses). Se sugiere NO APROBAR en las condiciones actuales; el monto máximo soportado por su capacidad del 35% es de $${params.recommendedMaxAmount.toLocaleString('es-MX')} MXN.`;
}
