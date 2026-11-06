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
import {
  AI_ASSISTANT_WELCOME_MESSAGE,
  PARTIAL_TRIAGE_VARIATION_POOLS,
  TRIAGE_FOLLOWUP_VARIATION_POOL,
} from '../../data/cruseData';

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

export const ALLOWED_DEPENDENCIES = [
  'tribunal_poder_judicial',
  'gobierno_estado',
  'agrupacion_jubilados',
  'out_of_scope',
  'unknown',
] as const;

export const ALLOWED_PLAZA_TYPES = [
  'sindicalizado',
  'confianza',
  'jubilado_pensionado',
  'unknown',
] as const;

export type DependencyKind = (typeof ALLOWED_DEPENDENCIES)[number];
export type PlazaTypeKind = (typeof ALLOWED_PLAZA_TYPES)[number];

export interface ExtractedTriageEntities {
  dependency: DependencyKind;
  plazaType: PlazaTypeKind;
}

export type TriageProfile =
  | 'unidentified'
  | 'out_of_scope'
  | 'partial_tribunal_missing_plaza'
  | 'partial_gob_missing_plaza'
  | 'partial_confianza_missing_dep'
  | 'resolved_confianza_no_convenio'
  | 'resolved_sindicalizado_or_jubilado'
  | 'resolved_confianza_tribunal';

export interface TriageEvaluationResult {
  profile: TriageProfile;
  dependency: DependencyKind;
  plazaType: PlazaTypeKind;
  isFullyResolved: boolean;
  triageQuestionReply: string;
  siloedRoutingReply: string;
  xmlTriageDirective: string;
}

export const OUT_OF_SCOPE_ELIGIBILITY_MESSAGE =
  'Actualmente, nuestros convenios de descuento vía nómina aplican exclusivamente para trabajadores del Poder Judicial / Supremo Tribunal de Justicia, Gobierno del Estado de Chihuahua (STSGECH) y la Agrupación de Jubilados y Pensionados. ¿Laboras en alguna de estas instituciones?';

/**
 * Guardrail 1 (CRUSE-APO-2026-054): Prompt de extracción semántica de entidades para el LLM
 * restringido estrictamente a los enums autorizados.
 */
export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `
Eres un clasificador determinista de entidades para Microfinanciera Cruse en Chihuahua.
Analiza el historial de conversación (dando máxima prioridad al mensaje más reciente si el usuario corrige su información) y devuelve ÚNICAMENTE un objeto JSON válido con dos propiedades:
- "dependency": uno de ["tribunal_poder_judicial", "gobierno_estado", "agrupacion_jubilados", "out_of_scope", "unknown"]
- "plazaType": uno de ["sindicalizado", "confianza", "jubilado_pensionado", "unknown"]

Reglas de mapeo semántico:
1. "tribunal_poder_judicial": Poder Judicial, Supremo Tribunal de Justicia (STJ / TSJ), juzgados del estado, magistrados/jueces/tribunales estatales.
2. "gobierno_estado": Gobierno del Estado de Chihuahua, STSGECH, secretarías estatales (Hacienda, Educación estatal, Salud estatal, Fiscalía estatal, Registro Civil, Recaudación de Rentas).
3. "agrupacion_jubilados": Agrupación de Jubilados y Pensionados al Servicio de Gobierno del Estado de Chihuahua, Pensiones Civiles (jubilados/pensionados).
4. "out_of_scope": Cualquier otra institución o empresa sin convenio (ej. CFE, IMSS, ISSSTE, PEMEX, Presidencia Municipal / Municipio, UACH, Gobierno Federal, empresa privada, maquiladora, banco).
5. "plazaType":
   - "sindicalizado": trabajador de base, sindicalizado, agremiado al sindicato / STSGECH / delegado sindical.
   - "confianza": personal de confianza, plaza de confianza, contrato de confianza.
   - "jubilado_pensionado": jubilado, pensionado.
   - "unknown": si aún no lo ha mencionado.
Responde SOLO con el JSON: {"dependency":"...","plazaType":"..."}
`.trim();

/**
 * Guardrail 1 (CRUSE-APO-2026-054): Validación determinista contra Enums estrictos.
 * Si el LLM devuelve un valor fuera de ALLOWED_DEPENDENCIES o ALLOWED_PLAZA_TYPES,
 * se descarta y se utiliza el valor determinista seguro ('unknown' o fallback).
 */
export function validateAndSanitizeExtractedEntities(
  rawCandidate: unknown,
  fallbackEntities: ExtractedTriageEntities = { dependency: 'unknown', plazaType: 'unknown' }
): ExtractedTriageEntities {
  if (!rawCandidate || typeof rawCandidate !== 'object') {
    return { ...fallbackEntities };
  }
  const candidate = rawCandidate as Record<string, unknown>;
  const rawDep = typeof candidate.dependency === 'string' ? candidate.dependency.trim() : '';
  const rawPlaza = typeof candidate.plazaType === 'string' ? candidate.plazaType.trim() : '';

  const isValidDep = (ALLOWED_DEPENDENCIES as readonly string[]).includes(rawDep);
  const isValidPlaza = (ALLOWED_PLAZA_TYPES as readonly string[]).includes(rawPlaza);

  const safeDep: DependencyKind = isValidDep
    ? (rawDep as DependencyKind)
    : fallbackEntities.dependency;
  const safePlaza: PlazaTypeKind = isValidPlaza
    ? (rawPlaza as PlazaTypeKind)
    : fallbackEntities.plazaType;

  return {
    dependency: safeDep !== 'unknown' ? safeDep : fallbackEntities.dependency,
    plazaType: safePlaza !== 'unknown' ? safePlaza : fallbackEntities.plazaType,
  };
}

function extractEntitiesFromSingleTurn(text: string): {
  dependency: DependencyKind | null;
  plazaType: PlazaTypeKind | null;
} {
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let dependency: DependencyKind | null = null;
  let plazaType: PlazaTypeKind | null = null;

  // 1. Detección de Dependencia (Prioridad a fuera de alcance para Guardrail 3, luego convenios oficiales y coloquiales)
  if (
    /\b(cfe|comision federal|imss|issste|pemex|municipio|presidencia municipal|ayuntamiento|uach|uacj|gobierno federal|maquila|maquiladora|empresa privada|telmex|bimbo|oxxo|walmart|coppel|bancomer|bbva|santander)\b/i.test(
      lower
    )
  ) {
    dependency = 'out_of_scope';
  } else if (
    /\b(poder judicial|supremo tribunal|tribunal de justicia|\bstj\b|\btsj\b|juzgad|tribunal|magistrad|juez|actuari|secretari[oa] de acuerdos|ciudad judicial)\b/i.test(
      lower
    )
  ) {
    dependency = 'tribunal_poder_judicial';
  } else if (/\b(agrupacion de jubilados|agrupacion de los jubilados|pensiones civiles)\b/i.test(lower)) {
    dependency = 'agrupacion_jubilados';
  } else if (
    /\b(gobierno del estado|gob del estado|gobierno estatal|trabajador del estado|emplead[oa] estatal|en gobierno|stsgech|secretaria de hacienda|secretaria de educacion|secretaria de salud|fiscalia|recaudacion de rentas|registro civil)\b/i.test(
      lower
    )
  ) {
    dependency = 'gobierno_estado';
  }

  // 2. Detección de Tipo de Plaza (con soporte para correcciones y vocabulario coloquial)
  const negatesSindicalizado =
    /(no soy sindicalizad|no soy de base|no pertenezco al sindicato|perdon.*confianza|disculpa.*confianza|error.*confianza)/i.test(
      lower
    );
  const negatesConfianza =
    /(no soy de confianza|perdon.*(sindicalizad|base)|disculpa.*(sindicalizad|base)|error.*(sindicalizad|base))/i.test(
      lower
    );

  if (negatesSindicalizado && /\bconfianza\b/i.test(lower)) {
    plazaType = 'confianza';
  } else if (negatesConfianza && /(sindicalizad|sindicato|stsgech|\bbase\b)/i.test(lower)) {
    plazaType = 'sindicalizado';
  } else if (/(jubilad|pensionad)/i.test(lower)) {
    plazaType = 'jubilado_pensionado';
    if (!dependency) {
      dependency = 'agrupacion_jubilados';
    }
  } else if (/\bconfianza\b/i.test(lower)) {
    plazaType = 'confianza';
  } else if (
    /(sindicalizad|sindicato|stsgech|pinos altos|delegad|plaza de base|trabajador de base|soy de base|tengo base|plaza base|agremiad|burocrata)/i.test(
      lower
    )
  ) {
    plazaType = 'sindicalizado';
    if (!dependency && /\bstsgech\b/i.test(lower)) {
      dependency = 'gobierno_estado';
    }
  }

  return { dependency, plazaType };
}

/**
 * Guardrail 4 (CRUSE-APO-2026-055): Rotación Anti-Bucle basada en el conteo real de turnos del usuario.
 */
export function selectVariationByTurn(
  pool: readonly string[],
  history: ReadonlyArray<{ role?: string; sender?: string }> = []
): string {
  const userTurnsCount = Array.isArray(history)
    ? history.filter((m) => m.role === 'user' || m.sender === 'user').length
    : 0;
  return pool[userTurnsCount % pool.length] ?? AI_ASSISTANT_WELCOME_MESSAGE;
}

/**
 * Guardrail 3 (CRUSE-APO-2026-054): Persistencia y Actualización Cronológica de Estado.
 * Recorre los turnos del usuario desde el más antiguo hasta el mensaje actual,
 * permitiendo acumular respuestas parciales en múltiples turnos y sobrescribir con correcciones recientes.
 */
export function extractEntitiesDeterministically(
  message: string,
  history: ChatHistoryTurn[] = []
): ExtractedTriageEntities {
  let accDependency: DependencyKind = 'unknown';
  let accPlazaType: PlazaTypeKind = 'unknown';

  const chronologicalUserTexts: string[] = [];
  if (Array.isArray(history)) {
    for (const turn of history) {
      if (turn.role === 'user' && turn.content) {
        chronologicalUserTexts.push(String(turn.content));
      }
    }
  }
  chronologicalUserTexts.push(message);

  for (const text of chronologicalUserTexts) {
    const step = extractEntitiesFromSingleTurn(text);
    if (step.dependency !== null) {
      accDependency = step.dependency;
    }
    if (step.plazaType !== null) {
      accPlazaType = step.plazaType;
    }
  }

  return {
    dependency: accDependency,
    plazaType: accPlazaType,
  };
}

/**
 * Guardrails 1, 2, 3 y 4 (CRUSE-APO-2026-053 / 054):
 * Máquina de Estados Multi-Turno de 2 Dimensiones (Dependencia × Tipo de Plaza)
 * con soporte para Extracción Híbrida (LLM + Validación Enums), Dependencias Fuera de Alcance,
 * Correcciones en Tiempo Real y Silo Hermético Sindicato vs Oficinas Cruse.
 */
export function evaluateTriageAndChannelRouting(
  message: string,
  history: ChatHistoryTurn[] = [],
  llmExtractedCandidate?: unknown
): TriageEvaluationResult {
  const deterministicEntities = extractEntitiesDeterministically(message, history);
  const currentTurnStep = extractEntitiesFromSingleTurn(message);

  // Fusión Híbrida (Guardrail 1 + Guardrail 3):
  // Validamos la salida del LLM contra los Enums permitidos, pero garantizamos que cualquier
  // corrección explícita en el último turno del usuario prevalezca de forma determinista.
  const validatedHybrid = validateAndSanitizeExtractedEntities(
    llmExtractedCandidate,
    deterministicEntities
  );

  const dependency: DependencyKind =
    currentTurnStep.dependency !== null
      ? currentTurnStep.dependency
      : validatedHybrid.dependency;

  const plazaType: PlazaTypeKind =
    currentTurnStep.plazaType !== null
      ? currentTurnStep.plazaType
      : validatedHybrid.plazaType;

  const triageQuestionReply = selectVariationByTurn(TRIAGE_FOLLOWUP_VARIATION_POOL, history);

  // Estado 2 (Guardrail 2): Dependencia fuera de alcance (CFE, IMSS, Municipio, UACH, etc.)
  if (dependency === 'out_of_scope') {
    return {
      profile: 'out_of_scope',
      dependency,
      plazaType,
      isFullyResolved: false,
      triageQuestionReply: OUT_OF_SCOPE_ELIGIBILITY_MESSAGE,
      siloedRoutingReply: OUT_OF_SCOPE_ELIGIBILITY_MESSAGE,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: DEPENDENCIA_FUERA_DE_ALCANCE\nREGLA_SILO_ESTRICTO: El usuario indicó una dependencia sin convenio activo. Responde amablemente: "${OUT_OF_SCOPE_ELIGIBILITY_MESSAGE}" NO menciones direcciones físicas.\n</triage_channel_silo>`,
    };
  }

  // Estado 8 (Guardrail 4): Sindicalizado o Jubilado/Pensionado -> SILO SINDICATO (Salón Pinos Altos)
  if (
    plazaType === 'sindicalizado' ||
    plazaType === 'jubilado_pensionado' ||
    dependency === 'agrupacion_jubilados'
  ) {
    const depLabel =
      dependency === 'tribunal_poder_judicial'
        ? 'del **Poder Judicial / Supremo Tribunal de Justicia del Estado de Chihuahua**'
        : dependency === 'gobierno_estado'
          ? 'de **Gobierno del Estado de Chihuahua (STSGECH)**'
          : 'de nuestra **Red de Convenios Institucionales (STSGECH / Poder Judicial / Agrupación de Jubilados y Pensionados)**';

    const siloedRoutingReply =
      `Como trabajador **Sindicalizado / Agrupación de Jubilados y Pensionados** ${depLabel}, te informamos que **el Sindicato es nuestro intermediario oficial y el personal del Sindicato son nuestros promotores autorizados**.\n\nPara tu trámite, debes comunicarte o acudir directamente al **Departamento de Prestaciones Económicas del Sindicato**:\n- **Sede de Atención y Firma:** Salón Pinos Altos (Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Chihuahua, Chih.), o bien con el **delegado del sindicato en tu municipio**.\n- **Teléfonos del Departamento de Prestaciones Económicas:** **614 607 7301** y **614 141 2503**.\n- **Requisitos:** 2 copias de INE vigente, 1 copia de tu último recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses para Crédito Normal), y la firma de los Formatos Cruse más la Autorización de Descuento de tu Dependencia.`;

    return {
      profile: 'resolved_sindicalizado_or_jubilado',
      dependency,
      plazaType: plazaType === 'unknown' ? 'jubilado_pensionado' : plazaType,
      isFullyResolved: true,
      triageQuestionReply,
      siloedRoutingReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: SINDICALIZADO_O_JUBILADO\nDEPENDENCIA_DETECTADA: ${dependency.toUpperCase()}\nREGLA_SILO_ESTRICTO: El usuario es SINDICALIZADO / JUBILADO. El Sindicato es nuestro intermediario y sus integrantes son nuestros promotores. Está TERMINANTEMENTE PROHIBIDO mencionar las oficinas de Microfinanciera Cruse, la dirección 'Vía Citadela' o los teléfonos de Cruse. Solo debes proporcionar los datos del Departamento de Prestaciones Económicas del Sindicato (Salón Pinos Altos, Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Tels. 614 607 7301 y 614 141 2503) o su delegado municipal.\n</triage_channel_silo>`,
    };
  }

  // Estado 7: Personal de Confianza del Poder Judicial / Supremo Tribunal de Justicia -> SILO OFICINAS CRUSE
  if (dependency === 'tribunal_poder_judicial' && plazaType === 'confianza') {
    const siloedRoutingReply =
      'Como **Personal de Confianza del Poder Judicial / Supremo Tribunal de Justicia del Estado de Chihuahua**, tu atención y trámite se realizan **directamente con nosotros en Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.**:\n\n- **Oficinas Centrales:** Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.\n- **Teléfonos de Atención Directa:** **(614) 411-15-44** y Cel. **(614) 184-58-49**.\n- **Requisitos:** 2 copias de INE vigente, 1 copia de tu último recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses para Crédito Normal), y la firma de los Formatos Cruse más la Autorización de Descuento de tu Dependencia.';

    return {
      profile: 'resolved_confianza_tribunal',
      dependency,
      plazaType,
      isFullyResolved: true,
      triageQuestionReply,
      siloedRoutingReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: CONFIANZA_SUPREMO_TRIBUNAL\nREGLA_SILO_ESTRICTO: El usuario es Personal de Confianza del Poder Judicial / Supremo Tribunal de Justicia. Debe comunicarse y acudir exclusivamente con nosotros en las oficinas de Microfinanciera Cruse (Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih., Teléfonos: (614) 411-15-44 y Cel. (614) 184-58-49). Está PROHIBIDO enviarlo al Salón Pinos Altos.\n</triage_channel_silo>`,
    };
  }

  // Estado 6: Personal de Confianza de Gobierno del Estado (aclaración de alcance de convenio)
  if (dependency === 'gobierno_estado' && plazaType === 'confianza') {
    const clarifyNoConvenio =
      'Gracias por confirmarlo. Te informamos que en **Gobierno del Estado de Chihuahua**, nuestro convenio de descuento vía nómina opera exclusivamente para personal **Sindicalizado (STSGECH)** y para la **Agrupación de Jubilados y Pensionados** (el convenio para **Personal de Confianza** aplica únicamente en el **Poder Judicial / Supremo Tribunal de Justicia**).\n\n¿Cuentas con plaza sindicalizada (STSGECH), eres jubilado/pensionado, o laboras en el Poder Judicial?';

    return {
      profile: 'resolved_confianza_no_convenio',
      dependency,
      plazaType,
      isFullyResolved: false,
      triageQuestionReply: clarifyNoConvenio,
      siloedRoutingReply: clarifyNoConvenio,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: CONFIANZA_GOBIERNO_ESTADO_SIN_CONVENIO\nREGLA_SILO_ESTRICTO: Explica con cortesía que en Gobierno del Estado el convenio aplica para personal Sindicalizado (STSGECH) y Jubilados/Pensionados, mientras que el convenio de Confianza es exclusivo del Poder Judicial / Supremo Tribunal de Justicia.\n</triage_channel_silo>`,
    };
  }

  // Estado 3 (Caso Gerardo Ornelas): Indicó Poder Judicial / Supremo Tribunal, falta Tipo de Plaza
  if (dependency === 'tribunal_poder_judicial' && plazaType === 'unknown') {
    const partialTribunalReply = selectVariationByTurn(
      PARTIAL_TRIAGE_VARIATION_POOLS.tribunalMissingPlaza,
      history
    );

    return {
      profile: 'partial_tribunal_missing_plaza',
      dependency,
      plazaType,
      isFullyResolved: false,
      triageQuestionReply: partialTribunalReply,
      siloedRoutingReply: partialTribunalReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: PARCIAL_PODER_JUDICIAL_FALTA_PLAZA\nREGLA_SILO_ESTRICTO: El usuario YA indicó que trabaja en el Poder Judicial / Supremo Tribunal de Justicia de Chihuahua. Responde su duda general sobre nuestros productos (Crédito Normal $10k-$500k, Crédito Express $1k-$20k, sin aval, 0% comisión, tope 30% LFT) SIN mencionar ninguna dirección física ni teléfono, y pregúntale ÚNICAMENTE si su plaza es sindicalizada o de confianza.\n</triage_channel_silo>`,
    };
  }

  // Estado 4: Indicó Gobierno del Estado, falta Tipo de Plaza
  if (dependency === 'gobierno_estado' && plazaType === 'unknown') {
    const partialGobReply = selectVariationByTurn(
      PARTIAL_TRIAGE_VARIATION_POOLS.gobMissingPlaza,
      history
    );

    return {
      profile: 'partial_gob_missing_plaza',
      dependency,
      plazaType,
      isFullyResolved: false,
      triageQuestionReply: partialGobReply,
      siloedRoutingReply: partialGobReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: PARCIAL_GOBIERNO_ESTADO_FALTA_PLAZA\nREGLA_SILO_ESTRICTO: El usuario YA indicó que trabaja en Gobierno del Estado de Chihuahua. Responde su duda general SIN mencionar ninguna dirección física ni teléfono, y pregúntale ÚNICAMENTE cuál es su tipo de plaza (sindicalizado, jubilado/pensionado o de confianza).\n</triage_channel_silo>`,
    };
  }

  // Estado 5: Indicó Personal de Confianza, falta Dependencia
  if (dependency === 'unknown' && plazaType === 'confianza') {
    const partialConfianzaReply = selectVariationByTurn(
      PARTIAL_TRIAGE_VARIATION_POOLS.confianzaMissingDep,
      history
    );

    return {
      profile: 'partial_confianza_missing_dep',
      dependency,
      plazaType,
      isFullyResolved: false,
      triageQuestionReply: partialConfianzaReply,
      siloedRoutingReply: partialConfianzaReply,
      xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: PARCIAL_CONFIANZA_FALTA_DEPENDENCIA\nREGLA_SILO_ESTRICTO: El usuario YA indicó que es personal de confianza. Responde su duda general SIN mencionar ninguna dirección física ni teléfono, y pregúntale ÚNICAMENTE en qué dependencia o institución labora.\n</triage_channel_silo>`,
    };
  }

  // Estado 1: Sin identificar ni dependencia ni tipo de plaza -> Variación Rotativa de Seguimiento con Orientación de Valor (Cero Fuga de Sedes)
  return {
    profile: 'unidentified',
    dependency: 'unknown',
    plazaType: 'unknown',
    isFullyResolved: false,
    triageQuestionReply,
    siloedRoutingReply: triageQuestionReply,
    xmlTriageDirective: `<triage_channel_silo>\nPERFIL_IDENTIFICADO: NO_IDENTIFICADO\nREGLA_SILO_ESTRICTO: El usuario AÚN NO ha indicado su dependencia ni su tipo de plaza. Bríndale orientación general cálida y variada sobre nuestros productos (Crédito Normal de $10,000 a $500,000 MXN y Crédito Express de $1,000 a $20,000 MXN, sin aval, 0% comisión por apertura, plazos quincenales/mensuales, tope legal 30% Art. 110 LFT) y pídele con redacción natural que te confirme en qué dependencia trabaja y su tipo de plaza (sindicalizado, de confianza o jubilado/pensionado). Está TERMINANTEMENTE PROHIBIDO mencionar direcciones físicas (Vía Citadela, Pinos Altos, Laguna de Bustillos), teléfonos o el Departamento de Prestaciones mientras no se identifique, y PROHIBIDO repetir el saludo inicial "¡Bienvenido a Microfinanciera Cruse!".\n</triage_channel_silo>`,
  };
}
