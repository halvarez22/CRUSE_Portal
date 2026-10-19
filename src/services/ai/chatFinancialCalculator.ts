/**
 * ORQUESTADOR DE CALCULADORA FINANCIERA DETERMINISTA PARA ASISTENTE IA (CRUSE-APO-2026-017)
 *
 * Cumple con:
 * - Regla Inamovible 2 (HRU / Watch Item 1): Toda operación matemática se ejecuta con Decimal.js
 *   vía `financialConstants.ts`. El LLM tiene prohibido calcular por su cuenta.
 * - Regla Inamovible 3 (SOLID / Anti-God-Object): Archivo dedicado < 180 líneas.
 * - Condición 2 de Auditoría Forense Qwen: Si el usuario solicita un cálculo financiero pero no
 *   hay un monto/sueldo claro en el mensaje ni en el historial reciente, retorna `needsClarification: true`
 *   sin adivinar ni alucinar números.
 */

import {
  calculateMaxLoanBySalary,
  calculateSimulation,
  FINANCIAL_CONSTANTS,
} from '../../config/financialConstants';

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

  const rawNum = Number(matches[0]![1]);
  if (!Number.isFinite(rawNum) || rawNum < 1000 || rawNum > 2000000) {
    return null;
  }

  const isQuincenal = /quincen(al|a|as)/i.test(clean) && !/mensual/i.test(clean);
  const isSalaryContext = /(gano|sueldo|salario|percibo|ingreso|mensual|mes|quincenal)/i.test(clean);
  const isLoanQuoteRequest =
    !isSalaryContext && /(credito|crédito|prestamo|préstamo|pedir|solicitar|por\s+\$?\d)/i.test(clean);

  return {
    amount: rawNum,
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

  // 1. Intentar extraer monto del mensaje actual; si no hay, buscar en los turnos del usuario en history (del más reciente al más antiguo)
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

  // Condición 2 (Qwen): Si pide cálculo pero no hay ningún sueldo/monto claro, jamás adivinar
  if (!extracted) {
    const clarification =
      'Para calcular tu capacidad de descuento (35%) y el **monto máximo exacto** que te podemos prestar, por favor indícame tu **sueldo neto mensual o quincenal** (por ejemplo: *"Gano $15,000 mensuales"*).';
    return {
      detected: true,
      needsClarification: true,
      clarificationReply: clarification,
    };
  }

  // Escenario B: Cotización de un monto específico de préstamo (ej. "¿Cuánto pagaría por un crédito de $30,000?")
  if (extracted.isLoanQuoteRequest) {
    const reqAmount = extracted.amount;
    const rows: string[] = [];
    for (const term of [24, 48, 72]) {
      const sim = calculateSimulation(reqAmount, term, 'normal');
      rows.push(
        `| **Crédito Clásico** | ${term} quincenas | **${fmtMxn(sim.fortnightlyPayment)}** | ${fmtMxn(sim.totalToPay)} | ${sim.catPercent}% |`
      );
    }
    if (reqAmount <= 20000) {
      for (const term of [6, 14, 20]) {
        const sim = calculateSimulation(reqAmount, term, 'express');
        rows.push(
          `| **Crédito Express** | ${term} quincenas | **${fmtMxn(sim.fortnightlyPayment)}** | ${fmtMxn(sim.totalToPay)} | ${sim.catPercent}% |`
        );
      }
    }
    const md = [
      `**Cotización Oficial Determinista para ${fmtMxn(reqAmount)}**`,
      '',
      '| Producto | Plazo | Cuota Quincenal Fija | Total a Pagar | CAT s/IVA |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      `> **Nota:** Cálculos exactos con motor financiero oficial (incluye IVA 16% sobre intereses y seguro de vida de $${FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN} quincenales en Crédito Clásico).`,
    ].join('\n');

    return {
      detected: true,
      needsClarification: false,
      xmlContextBlock: `<deterministic_financial_data>\nTIPO: COTIZACION_MONTO_ESPECIFICO\nMONTO_SOLICITADO: ${fmtMxn(reqAmount)}\n${md}\n</deterministic_financial_data>`,
      fallbackMarkdownReply: md,
    };
  }

  // Escenario A: Análisis de Capacidad de Descuento (35%) y Préstamo Máximo por Sueldo
  const analysis = calculateMaxLoanBySalary(extracted.amount, extracted.frequency);
  const tableRows = analysis.options.map(
    (opt) =>
      `| **${opt.productLabel}** | ${opt.termFortnights} quincenas | **${fmtMxn(opt.maxPrincipal)}** | **${fmtMxn(opt.fortnightlyPayment)}** | ${opt.catPercent}% |`
  );

  const fallbackMd = [
    '**Cálculo Oficial de Capacidad de Pago y Préstamo Máximo**',
    '',
    `- **Sueldo neto mensual:** ${fmtMxn(analysis.monthlyNetSalary)}`,
    `- **Sueldo neto quincenal:** ${fmtMxn(analysis.fortnightlyNetSalary)}`,
    `- **Capacidad máxima de descuento quincenal (35%):** **${fmtMxn(analysis.maxFortnightlyDeduction)}**`,
    '',
    '---',
    '',
    '### Montos máximos de crédito autorizables según tu capacidad',
    '',
    '| Producto | Plazo | Monto Máximo a Prestar (Capital) | Cuota Quincenal Exacta (≤ 35%) | CAT s/IVA |',
    '|---|---|---|---|---|',
    ...tableRows,
    '',
    '> **Nota:** Estos montos ya descuentan intereses, IVA (16%) y la póliza de seguro de vida ($22.85 MXN quincenales en Crédito Clásico), garantizando que tu descuento quincenal jamás supere el 35% de tu sueldo neto libre.',
  ].join('\n');

  return {
    detected: true,
    needsClarification: false,
    xmlContextBlock: `<deterministic_financial_data>\nSUELDO_MENSUAL_NETO: ${fmtMxn(analysis.monthlyNetSalary)}\nSUELDO_QUINCENAL_NETO: ${fmtMxn(analysis.fortnightlyNetSalary)}\nCAPACIDAD_MAXIMA_DESCUENTO_QUINCENAL_35_PORCIENTO: ${fmtMxn(analysis.maxFortnightlyDeduction)}\nTABLA_OFICIAL_CALCULADA_CON_DECIMAL_JS:\n${fallbackMd}\n</deterministic_financial_data>`,
    fallbackMarkdownReply: fallbackMd,
  };
}
