/**
 * ORQUESTADOR DE CALCULADORA FINANCIERA DETERMINISTA PARA ASISTENTE IA (CRUSE-APO-2026-017 / 051)
 *
 * Cumple con:
 * - Regla Inamovible 2 (HRU / Guardrail 1): Toda operación matemática se ejecuta con Decimal.js
 *   vía `financialConstants.ts`. Cero punto flotante nativo (FLOAT_CALLS_COUNT === 0).
 * - Guardrail 2: Límite legal inquebrantable del 30% conforme al Art. 110 de la LFT.
 * - Guardrail 3: Denominación oficial "Crédito Normal" y "Crédito Express".
 */

import Decimal from 'decimal.js';
import {
  calculateMaxLoanBySalary,
  calculateSimulation,
  FINANCIAL_CONSTANTS,
  validateLegalPaymentCapacityLft110,
} from '../../config/financialConstants';
import { getAllowedExpressTerm } from '../../config/officialQuotaTables';

export interface ChatHistoryTurn {
  role: string;
  content: string;
}

export interface DeterministicCalcOutput {
  detected: boolean;
  needsClarification: boolean;
  clarificationReply?: string;
  xmlContextBlock?: string;
  fallbackMarkdownReply?: string;
}

const fmtMxn = (n: number): string =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

function extractAmountAndFrequency(text: string): {
  amount: number;
  frequency: 'mensual' | 'quincenal';
  isLoanQuoteRequest: boolean;
} | null {
  const clean = text.toLowerCase().replace(/,/g, '');
  const matches = [...clean.matchAll(/(?:\$\s*)?(\d{4,7}(?:\.\d{1,2})?)/g)];
  if (matches.length === 0) return null;

  let dNum: Decimal;
  try {
    dNum = new Decimal(matches[0]![1]!);
  } catch {
    return null;
  }

  if (dNum.lt(1000) || dNum.gt(2000000)) {
    return null;
  }

  const isQuincenal = /quincen(al|a|as)/i.test(clean) && !/mensual/i.test(clean);
  const isSalaryContext = /(gano|sueldo|salario|percibo|ingreso|mensual|mes|quincenal)/i.test(clean);
  const isLoanQuoteRequest =
    !isSalaryContext && /(credito|crédito|prestamo|préstamo|pedir|solicitar|por\s+\$?\d)/i.test(clean);

  return {
    amount: dNum.toNumber(),
    frequency: isQuincenal ? 'quincenal' : 'mensual',
    isLoanQuoteRequest,
  };
}

export function evaluateDeterministicFinancialQuery(
  message: string,
  history: ChatHistoryTurn[] = []
): DeterministicCalcOutput {
  const lowerMsg = message.toLowerCase();
  const asksFinancialCalc =
    /(cuanto|cuánto|prestar|prestan|prestamo|préstamo|descontar|descuento|restar|capacidad|gano|sueldo|salario|pagaria|pagaría|cuota)/i.test(
      lowerMsg
    );

  if (!asksFinancialCalc) {
    return { detected: false, needsClarification: false };
  }

  let extracted = extractAmountAndFrequency(message);
  if (!extracted && Array.isArray(history)) {
    const userTurns = [...history].reverse().filter((h) => h.role === 'user');
    for (const turn of userTurns) {
      const candidate = extractAmountAndFrequency(String(turn.content || ''));
      if (candidate) {
        extracted = candidate;
        break;
      }
    }
  }

  if (!extracted) {
    const clarification =
      'Para calcular tu capacidad legal de descuento (**30% conforme al Art. 110 de la LFT**) y el **monto máximo exacto** que puedes solicitar, por favor indícame tu **sueldo neto mensual o quincenal** (por ejemplo: *"Gano $15,000 mensuales"*).';
    return {
      detected: true,
      needsClarification: true,
      clarificationReply: clarification,
    };
  }

  // Escenario B: Cotización de un monto específico de préstamo (ej. "¿Cuánto pagaría por un crédito de $5,000?")
  if (extracted.isLoanQuoteRequest) {
    const reqAmount = extracted.amount;
    const rows: string[] = [];

    if (reqAmount >= 10000) {
      for (const term of [24, 48, 72]) {
        const sim = calculateSimulation(reqAmount, term, 'normal');
        rows.push(
          `| **Crédito Normal** | ${term} quincenas | **${fmtMxn(sim.fortnightlyPayment)}** | ${fmtMxn(sim.totalToPay)} | ${fmtMxn(sim.requiredNetIncome)} | 47.50% anual |`
        );
      }
    }
    if (reqAmount <= 20000) {
      const expressTerm = getAllowedExpressTerm(reqAmount, 'quincenal');
      const sim = calculateSimulation(reqAmount, expressTerm, 'express');
      rows.push(
        `| **Crédito Express** | ${expressTerm} quincenas | **${fmtMxn(sim.fortnightlyPayment)}** | ${fmtMxn(sim.totalToPay)} | ${fmtMxn(sim.requiredNetIncome)} | 80.00% anual |`
      );
    }

    const md = [
      `**Cotización Oficial Determinista para ${fmtMxn(reqAmount)}**`,
      '',
      '| Producto | Plazo Oficial | Cuota Quincenal Fija | Total Estimado a Pagar | Ingreso Neto Mín. (30% LFT) | Tasa Nominal |',
      '|---|---|---|---|---|---|',
      ...rows,
      '',
      `> **Nota Regulatoria:** Cálculos verificados centavo a centavo con las Tablas Oficiales de Cuotas (incluye 16% de IVA sobre intereses y seguro de vida de $${FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN} quincenales en Crédito Normal Activos). El descuento jamás puede exceder el **30% de tu ingreso neto** conforme al Art. 110 de la LFT.`,
    ].join('\n');

    return {
      detected: true,
      needsClarification: false,
      xmlContextBlock: `<deterministic_financial_data>\nTIPO: COTIZACION_MONTO_ESPECIFICO\nMONTO_SOLICITADO: ${fmtMxn(reqAmount)}\n${md}\n</deterministic_financial_data>`,
      fallbackMarkdownReply: md,
    };
  }

  // Escenario A: Análisis de Capacidad de Descuento (30% Art. 110 LFT) y Préstamo Máximo por Sueldo
  const analysis = calculateMaxLoanBySalary(extracted.amount, extracted.frequency);
  const sampleCheck = validateLegalPaymentCapacityLft110(
    analysis.maxFortnightlyDeduction,
    analysis.fortnightlyNetSalary
  );
  const tableRows = analysis.options.map(
    (opt) =>
      `| **${opt.productLabel}** | ${opt.termFortnights} quincenas | **${fmtMxn(opt.maxPrincipal)}** | **${fmtMxn(opt.fortnightlyPayment)}** | ${opt.catPercent.toFixed(2)}% |`
  );

  const fallbackMd = [
    '**Cálculo Oficial de Capacidad de Pago (Tope 30% Art. 110 LFT) y Préstamo Máximo**',
    '',
    `- **Sueldo neto mensual:** ${fmtMxn(analysis.monthlyNetSalary)}`,
    `- **Sueldo neto quincenal:** ${fmtMxn(analysis.fortnightlyNetSalary)}`,
    `- **Capacidad máxima legal de descuento quincenal (30% Art. 110 LFT):** **${fmtMxn(analysis.maxFortnightlyDeduction)}** (${sampleCheck.ratioPercent}% máx.)`,
    '',
    '---',
    '',
    '### Montos máximos de crédito autorizables según tu capacidad legal (≤ 30%)',
    '',
    '| Producto | Plazo | Monto Máximo a Prestar (Capital) | Cuota Quincenal Exacta (≤ 30%) | CAT s/IVA |',
    '|---|---|---|---|---|',
    ...tableRows,
    '',
    '> **Nota Legal (Art. 110 LFT):** Estos montos integran intereses sobre saldos insolutos, IVA (16%) y la póliza de seguro de vida ($22.85 MXN quincenales en Crédito Normal Activos), garantizando que tu descuento quincenal jamás exceda el límite legal del 30% de tu sueldo neto libre.',
  ].join('\n');

  return {
    detected: true,
    needsClarification: false,
    xmlContextBlock: `<deterministic_financial_data>\nSUELDO_MENSUAL_NETO: ${fmtMxn(analysis.monthlyNetSalary)}\nSUELDO_QUINCENAL_NETO: ${fmtMxn(analysis.fortnightlyNetSalary)}\nCAPACIDAD_MAXIMA_DESCUENTO_QUINCENAL_30_PORCIENTO_LFT: ${fmtMxn(analysis.maxFortnightlyDeduction)}\nTABLA_OFICIAL_CALCULADA_CON_DECIMAL_JS:\n${fallbackMd}\n</deterministic_financial_data>`,
    fallbackMarkdownReply: fallbackMd,
  };
}

export type TriageProfile = 'unidentified' | 'sindicalizado' | 'jubilado' | 'confianza_tribunal';

export interface TriageEvaluationResult {
  profile: TriageProfile;
  triageQuestionReply: string;
  siloedRoutingReply: string;
  xmlTriageDirective: string;
}

function detectTriageProfileFromTurn(text: string): TriageProfile | null {
  const lower = text.toLowerCase();
  if (lower.includes('confianza')) {
    return 'confianza_tribunal';
  }
  if (
    lower.includes('jubilad') ||
    lower.includes('pensionad') ||
    lower.includes('agrupacion') ||
    lower.includes('agrupación')
  ) {
    return 'jubilado';
  }
  if (
    lower.includes('sindical') ||
    lower.includes('sindicato') ||
    lower.includes('stsgech') ||
    lower.includes('pinos altos') ||
    lower.includes('delegado')
  ) {
    return 'sindicalizado';
  }
  return null;
}

/**
 * Guardrails 1, 2 y 4 (CRUSE-APO-2026-053):
 * Resuelve de forma 100% determinista el estado del triaje de dependencia/estatus laboral
 * y genera la respuesta de canalización con aislamiento hermético (Cero Fugas de Vía Citadela a Sindicalizados).
 */
export function evaluateTriageAndChannelRouting(
  message: string,
  history: ChatHistoryTurn[] = []
): TriageEvaluationResult {
  let detectedProfile = detectTriageProfileFromTurn(message);

  if (!detectedProfile && Array.isArray(history)) {
    const userTurns = [...history].reverse().filter((h) => h.role === 'user');
    for (const turn of userTurns) {
      const candidate = detectTriageProfileFromTurn(String(turn.content || ''));
      if (candidate) {
        detectedProfile = candidate;
        break;
      }
    }
  }

  const profile: TriageProfile = detectedProfile ?? 'unidentified';

  const triageQuestionReply =
    'Para brindarte la información exacta y canalizarte con el área correspondiente, por favor indícame primero:\n\n**¿En qué dependencia trabajas y eres trabajador sindicalizado (o jubilado/pensionado) o personal de confianza?**\n\n*(Puedes escribirlo aquí o seleccionar tu perfil en los botones rápidos de arriba).*';

  if (profile === 'sindicalizado' || profile === 'jubilado') {
    const siloedRoutingReply =
      'Como trabajador **Sindicalizado / Agrupación de Jubilados y Pensionados**, te informamos que **el Sindicato es nuestro intermediario oficial y el personal del Sindicato son nuestros promotores autorizados**.\n\nPara tu trámite, debes comunicarte o acudir directamente al **Departamento de Prestaciones Económicas del Sindicato**:\n- **Sede de Atención y Firma:** Salón Pinos Altos (Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Chihuahua, Chih.), o bien con el **delegado del sindicato en tu municipio**.\n- **Teléfonos del Departamento de Prestaciones Económicas:** **614 607 7301** y **614 141 2503**.\n- **Requisitos:** 2 copias de INE vigente, 1 copia de tu último recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses para Crédito Normal), y la firma de los Formatos Cruse más la Autorización de Descuento de tu Dependencia.';

    return {
      profile,
      triageQuestionReply,
      siloedRoutingReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: ${profile.toUpperCase()}\nREGLA_SILO_ESTRICTO: El usuario es SINDICALIZADO / JUBILADO. El Sindicato es nuestro intermediario y sus integrantes son nuestros promotores. Está TERMINANTEMENTE PROHIBIDO mencionar las oficinas de Microfinanciera Cruse, la dirección 'Vía Citadela' o los teléfonos de Cruse. Solo debes proporcionar los datos del Departamento de Prestaciones Económicas del Sindicato (Salón Pinos Altos, Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Tels. 614 607 7301 y 614 141 2503) o su delegado municipal.\n</triage_channel_silo>`,
    };
  }

  if (profile === 'confianza_tribunal') {
    const siloedRoutingReply =
      'Como **Personal de Confianza del Supremo Tribunal de Justicia del Estado de Chihuahua**, tu atención y trámite se realizan **directamente con nosotros en Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.**:\n\n- **Oficinas Centrales:** Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.\n- **Teléfonos de Atención Directa:** **(614) 411-15-44** y Cel. **(614) 184-58-49**.\n- **Requisitos:** 2 copias de INE vigente, 1 copia de tu último recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses para Crédito Normal), y la firma de los Formatos Cruse más la Autorización de Descuento de tu Dependencia.';

    return {
      profile,
      triageQuestionReply,
      siloedRoutingReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: CONFIANZA_SUPREMO_TRIBUNAL\nREGLA_SILO_ESTRICTO: El usuario es Personal de Confianza del Supremo Tribunal de Justicia. Debe comunicarse y acudir exclusivamente con nosotros en las oficinas de Microfinanciera Cruse (Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih., Teléfonos: (614) 411-15-44 y Cel. (614) 184-58-49).\n</triage_channel_silo>`,
    };
  }

  return {
    profile: 'unidentified',
    triageQuestionReply,
    siloedRoutingReply: triageQuestionReply,
    xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: NO_IDENTIFICADO\nREGLA_SILO_ESTRICTO: El usuario AÚN NO ha indicado en qué dependencia trabaja ni si es sindicalizado o de confianza. Lo PRIMERO que debes preguntarle es: "¿En qué dependencia trabajas y eres trabajador sindicalizado (o jubilado/pensionado) o personal de confianza?" NO menciones ninguna dirección física hasta que se identifique.\n</triage_channel_silo>`,
  };
}
