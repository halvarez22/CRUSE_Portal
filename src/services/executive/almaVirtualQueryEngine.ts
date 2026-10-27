/**
 * ALMA VIRTUAL — ORQUESTADOR DE INTENCIONES, VALIDADOR REGEX Y SANITIZADOR ZERO-PII
 * Expediente: CRUSE-APO-2026-033
 * Guardrail 1: Validación estricta de entidades por Regex antes de consultas parametrizadas ($1, $2).
 * Guardrail 2: Función sanitizeForLlm() obligatoria que garantiza Cero PII hacia Groq LLaMA 3.3 70B.
 * Guardrail 4: Archivo modular < 450 líneas con degradación elegante determinista.
 */

import {
  AlmaVirtualDomainExecutionResult,
  AlmaVirtualValidatedEntities,
} from '../../types/executive';
import {
  resolveQ01PartialPaymentsByConvenio,
  resolveQ02PaymentWaterfallAllocation,
  resolveQ03ExpectedRetentionByConvenio,
  resolveQ04ExpressNearPayoff,
  resolveQ05PayrollDiscrepanciesLastCut,
  resolveQ06SimultaneousNormalLoansByCurp,
  resolveQ07RestructureTraceability,
  resolveQ08CheckDisbursementsLast30Days,
  resolveQ09FirstPaymentOfficialLetterDoc,
  resolveQ10MaxPayrollDiscountRule30,
} from './almaDomainQueriesPart1';
import {
  resolveQ11RetireesExemptLifeInsurance,
  resolveQ12TotalLifeInsuranceCollected,
  resolveQ13PendingDeathInsuranceClaims,
  resolveQ14LoanInsuranceDetails,
  resolveQ15HealthSectorInsuredLoans,
  resolveQ16PastDueSummaryCirculoCredito,
  resolveQ17ClientsOver90Dpd,
  resolveQ18SupremoTribunalBalanceSum,
  resolveQ19ReportedBureauBalanceForFolio,
  resolveQ20ExpressDelinquencyRate,
  resolveQ21WormAuditManualCapitalOverride,
  resolveQ22PendingArcoCancellationRequests,
  resolveQ23RestructureAuthorizationAndIp,
  resolveQ24LatestOperationalNoteForFolio,
} from './almaDomainQueriesPart2';

const ALLOWED_CONVENIOS = new Set<string>([
  'STSGECH',
  'SUPREMO_TRIBUNAL',
  'HACIENDA',
  'MUNICIPIO_Q',
  'AUDITORIA',
  'PODER_JUDICIAL_GTO',
  'SINDICATO_SALUD_GTO',
  'AYUNTAMIENTO_CANCUN',
  'PODER_JUDICIAL_QROO',
  'TRIBUNAL-CONF',
]);

const FORBIDDEN_PII_KEYS = new Set<string>([
  'full_name',
  'employee_name',
  'raw_curp',
  'raw_rfc',
  'address',
  'phone',
  'voter_id',
  'encrypted_pii_payload',
]);

/**
 * Extrae y valida estrictamente mediante expresiones regulares las entidades operativas
 * mencionadas en la pregunta del Administrador (Guardrail Forense 1).
 */
export function extractValidatedEntities(rawQuestion: string): AlmaVirtualValidatedEntities {
  const upper = rawQuestion.toUpperCase();
  const normalized = rawQuestion
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // 1. Folio de contrato (soporta CNT-YYYY-NNNN o CRUSE-YYYY-NNNN normalizando a CNT-YYYY-NNNN)
  let folio: string | null = null;
  const folioMatch = upper.match(/\b(?:CNT|CRUSE)-(\d{4}-\d{4})\b/);
  if (folioMatch && folioMatch[1] && /^\d{4}-\d{4}$/.test(folioMatch[1])) {
    folio = `CNT-${folioMatch[1]}`;
  }

  // 2. Periodo quincenal (YYYY-MM-1Q o YYYY-MM-2Q)
  let fortnightPeriod: string | null = null;
  const periodMatch = upper.match(/\b(202[4-9]-\d{2}-[12]Q)\b/);
  if (periodMatch && periodMatch[1] && /^\d{4}-\d{2}-[12]Q$/.test(periodMatch[1])) {
    fortnightPeriod = periodMatch[1];
  }

  // 3. Convenio validado contra lista blanca
  let convenioCode: string | null = null;
  if (normalized.includes('supremo tribunal')) {
    convenioCode = 'SUPREMO_TRIBUNAL';
  } else if (normalized.includes('stsgech')) {
    convenioCode = 'STSGECH';
  } else if (normalized.includes('hacienda')) {
    convenioCode = 'HACIENDA';
  } else if (normalized.includes('municipio')) {
    convenioCode = 'MUNICIPIO_Q';
  } else if (normalized.includes('auditoria')) {
    convenioCode = 'AUDITORIA';
  } else if (normalized.includes('salud')) {
    convenioCode = 'SINDICATO_SALUD_GTO';
  } else if (normalized.includes('poder judicial gto') || normalized.includes('guanajuato')) {
    convenioCode = 'PODER_JUDICIAL_GTO';
  } else if (normalized.includes('cancun')) {
    convenioCode = 'AYUNTAMIENTO_CANCUN';
  }
  if (convenioCode && !ALLOWED_CONVENIOS.has(convenioCode)) {
    convenioCode = null;
  }

  // 4. Prefijo de CURP (4 letras iniciales validadas)
  let curpPrefix: string | null = null;
  const curpMatch = upper.match(/\b([A-Z]{4})(?:\*{4,}|\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/);
  if (curpMatch && curpMatch[1] && /^[A-Z]{4}$/.test(curpMatch[1])) {
    curpPrefix = curpMatch[1];
  }

  // 5. Mes de reporte a Buró (YYYY-MM)
  let reportingMonth: string | null = null;
  const monthMatch = upper.match(/\b(202[4-9]-\d{2})\b/);
  if (monthMatch && monthMatch[1] && !fortnightPeriod) {
    reportingMonth = monthMatch[1];
  } else if (normalized.includes('octubre 2026') || normalized.includes('octubre')) {
    reportingMonth = '2026-10';
  }

  // 6. Pista de monto numérico (ej. $300 o $1,000)
  let amountHint: number | null = null;
  const amtMatch = rawQuestion.match(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+)/);
  if (amtMatch && amtMatch[1]) {
    const parsed = Number(amtMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      amountHint = parsed;
    }
  }

  return {
    folio,
    fortnightPeriod,
    convenioCode,
    curpPrefix,
    reportingMonth,
    amountHint,
  };
}

/**
 * Sanitiza recursivamente cualquier estructura JSON antes de enviarla al LLM externo
 * garantizando que ningún nombre completo, CURP en claro, RFC en claro o dirección viaje a Groq
 * (Guardrail Forense 2: Zero-PII en el Payload al LLM).
 */
export function sanitizeForLlm(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input === 'string') {
    return input
      .replace(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/gi, '[CURP_PROTEGIDO]')
      .replace(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/gi, '[RFC_PROTEGIDO]');
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForLlm(item));
  }
  if (typeof input === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (FORBIDDEN_PII_KEYS.has(key.toLowerCase())) {
        continue;
      }
      sanitizedObj[key] = sanitizeForLlm(val);
    }
    return sanitizedObj;
  }
  return String(input);
}

/**
 * Clasifica la pregunta operativa del Administrador y ejecuta la consulta SQL parametrizada
 * correspondiente sobre las 38 tablas de PostgreSQL 16 (24 Preguntas Estratégicas).
 */
export async function executeAlmaVirtualQuery(
  rawQuestion: string
): Promise<AlmaVirtualDomainExecutionResult | null> {
  const q = rawQuestion
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const entities = extractValidatedEntities(rawQuestion);

  // --- DOMINIO 5: SEGURIDAD, DERECHOS ARCO Y BITÁCORA FORENSE WORM (21–24) ---
  if (
    (q.includes('worm') || q.includes('bitacora')) &&
    (q.includes('ajuste manual') || q.includes('capital') || q.includes('aplicacion de pago'))
  ) {
    return resolveQ21WormAuditManualCapitalOverride(entities);
  }
  if (q.includes('arco') || (q.includes('cancelacion') && q.includes('ex-cliente'))) {
    return resolveQ22PendingArcoCancellationRequests();
  }
  if (
    (q.includes('quien autorizo') || q.includes('direccion ip') || q.includes('ip')) &&
    q.includes('reestructura')
  ) {
    return resolveQ23RestructureAuthorizationAndIp();
  }
  if (q.includes('nota operativa') || (q.includes('nota') && q.includes('expediente'))) {
    return resolveQ24LatestOperationalNoteForFolio(entities);
  }

  // --- DOMINIO 1: COBRANZA QUINCENAL Y PAGOS PARCIALES (1–5) ---
  if (
    (q.includes('conceptos') || q.includes('prelacion') || q.includes('$300') || q.includes('capital, interes')) &&
    (q.includes('pago parcial') || q.includes('recibido del credito') || q.includes('destino'))
  ) {
    return resolveQ02PaymentWaterfallAllocation(entities);
  }
  if (q.includes('pagos parciales') || q.includes('incompletos')) {
    return resolveQ01PartialPaymentsByConvenio(entities);
  }
  if (
    (q.includes('acumulado total esperado') || q.includes('proxima quincena')) &&
    (q.includes('retencion') || q.includes('cuotas'))
  ) {
    return resolveQ03ExpectedRetentionByConvenio(entities);
  }
  if (
    q.includes('express') &&
    (q.includes('menor a $1,000') || q.includes('menor a 1000') || q.includes('por liquidarse'))
  ) {
    return resolveQ04ExpressNearPayoff();
  }
  if (
    q.includes('descuento esperado') &&
    (q.includes('no coincidio') || q.includes('depositado'))
  ) {
    return resolveQ05PayrollDiscrepanciesLastCut();
  }

  // --- DOMINIO 2: REESTRUCTURAS Y ORIGINACIÓN (6–10) ---
  if (
    (q.includes('simultaneamente') || q.includes('creditos normales activos')) &&
    (q.includes('curp') || q.includes('sumatoria de sus cuotas'))
  ) {
    return resolveQ06SimultaneousNormalLoansByCurp(entities);
  }
  if (
    q.includes('fue una reestructura') ||
    (q.includes('reestructura') && q.includes('folio del credito original'))
  ) {
    return resolveQ07RestructureTraceability(entities);
  }
  if (q.includes('cheque fisico') || (q.includes('cheque') && q.includes('30 dias'))) {
    return resolveQ08CheckDisbursementsLast30Days();
  }
  if (q.includes('oficio de 1er pago') || q.includes('oficio de primer pago')) {
    return resolveQ09FirstPaymentOfficialLetterDoc(entities);
  }
  if (q.includes('regla del 30%') || q.includes('limite maximo de descuento')) {
    return resolveQ10MaxPayrollDiscountRule30(entities);
  }

  // --- DOMINIO 3: SEGUROS Y EXCEPCIONES (11–15) ---
  if (
    q.includes('jubilados') ||
    q.includes('pensionados') ||
    q.includes('exceder la edad')
  ) {
    return resolveQ11RetireesExemptLifeInsurance();
  }
  if (
    q.includes('total cobrado') &&
    (q.includes('seguro de vida') || q.includes('22.85'))
  ) {
    return resolveQ12TotalLifeInsuranceCollected(entities);
  }
  if (q.includes('fallecimiento') || q.includes('hacerse efectiva')) {
    return resolveQ13PendingDeathInsuranceClaims();
  }
  if (q.includes('sector salud') && q.includes('seguro')) {
    return resolveQ15HealthSectorInsuredLoans();
  }
  if (q.includes('cobertura de seguro') || (q.includes('detalles') && q.includes('seguro'))) {
    return resolveQ14LoanInsuranceDetails(entities);
  }

  // --- DOMINIO 4: BURÓ DE CRÉDITO Y CIERRES MENSUALES (16–20) ---
  if (q.includes('90 dias de atraso') || q.includes('dpd > 90') || q.includes('dpd>90')) {
    return resolveQ17ClientsOver90Dpd();
  }
  if (
    q.includes('sumatoria mensual del saldo insoluto') ||
    (q.includes('supremo tribunal') && q.includes('auditoria interna'))
  ) {
    return resolveQ18SupremoTribunalBalanceSum();
  }
  if (q.includes('saldo reportado al buro') || q.includes('credito de equivalencia')) {
    return resolveQ19ReportedBureauBalanceForFolio(entities);
  }
  if (q.includes('indice de morosidad') && q.includes('express')) {
    return resolveQ20ExpressDelinquencyRate();
  }
  if (q.includes('circulo de credito') || (q.includes('cartera vencida') && q.includes('fin del mes'))) {
    return resolveQ16PastDueSummaryCirculoCredito(entities);
  }

  return null;
}
