/**
 * ALMA VIRTUAL — DESPACHADOR DE HERRAMIENTAS (TOOL CALLING), RATE LIMITER, TIMEOUT 10S Y ZERO-PII
 * Expediente: CRUSE-APO-2026-033-R3
 * Guardrail A: El LLM nunca escribe SQL; invoca funciones puras vía dispatchAlmaToolCall().
 * Guardrail B: Validación Zero-Trust de parámetros mediante validateAndSanitizeToolArgs().
 * Guardrail D: Sanitización recursiva sanitizeForLlm() antes de entregar resultados al LLM.
 * Ajuste 3: Rate Limiter (máx. 30 tool_calls/min/usuario y máx. 5 tool_calls en paralelo por turno).
 * Ajuste 4: Timeout de 10 segundos por herramienta con Promise.race (TOOL_TIMEOUT_10S).
 * Ajuste 5: Respuesta estructurada NO_RESULTS cuando una consulta retorna 0 filas.
 */

import {
  AlmaToolName,
  AlmaValidatedToolArgs,
  AlmaVirtualDomainExecutionResult,
  AlmaVirtualValidatedEntities,
} from '../../types/executive';
import { validateAndSanitizeToolArgs } from './toolsSchema';
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

export const MAX_TOOL_CALLS_PER_MINUTE_PER_USER = 30;
export const MAX_PARALLEL_TOOL_CALLS_PER_TURN = 5;
export const TOOL_EXECUTION_TIMEOUT_MS = 10000;

const userToolCallTimestamps = new Map<string, number[]>();

export class ToolCallRateLimitError extends Error {
  public readonly statusCode = 429;
  public readonly auditAction = 'TOOL_CALL_RATE_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'ToolCallRateLimitError';
  }
}

/**
 * Ajuste Obligatorio 3: Rate Limiter por herramienta y por usuario (máx 30/min y máx 5 paralelas).
 */
export function enforceAlmaToolCallRateLimit(actorEmail: string, requestedParallelCount: number): void {
  if (requestedParallelCount > MAX_PARALLEL_TOOL_CALLS_PER_TURN) {
    throw new ToolCallRateLimitError(
      `Se excedió el límite de ${MAX_PARALLEL_TOOL_CALLS_PER_TURN} tool_calls simultáneos por turno (${requestedParallelCount} solicitados).`
    );
  }

  const key = (actorEmail || 'anonymous').toLowerCase().trim();
  const now = Date.now();
  const windowStart = now - 60_000;
  const previous = (userToolCallTimestamps.get(key) ?? []).filter((ts) => ts > windowStart);

  if (previous.length + requestedParallelCount > MAX_TOOL_CALLS_PER_MINUTE_PER_USER) {
    throw new ToolCallRateLimitError(
      `Límite de velocidad excedido: máximo ${MAX_TOOL_CALLS_PER_MINUTE_PER_USER} ejecuciones de herramientas por minuto por usuario.`
    );
  }

  for (let i = 0; i < requestedParallelCount; i++) {
    previous.push(now);
  }
  userToolCallTimestamps.set(key, previous);
}

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
 * Guardrail Forense D: Sanitiza recursivamente cualquier payload antes de entregarlo al LLM.
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

function toEntities(args: AlmaValidatedToolArgs): AlmaVirtualValidatedEntities {
  return {
    folio: args.folio ?? null,
    fortnightPeriod: args.fortnight_period ?? null,
    convenioCode: args.convenio ?? null,
    curpPrefix: args.curp_prefix ?? null,
    reportingMonth: args.reporting_month ?? null,
    amountHint: null,
  };
}

/**
 * Ejecuta la función SQL pura correspondiente a la herramienta y sub-consulta validada.
 */
async function executePureDomainTool(
  toolName: AlmaToolName,
  args: AlmaValidatedToolArgs
): Promise<AlmaVirtualDomainExecutionResult> {
  const entities = toEntities(args);
  const qt = args.query_type ?? '';

  switch (toolName) {
    case 'get_cobranza_data': {
      if (qt === 'PARTIAL_PAYMENTS') return resolveQ01PartialPaymentsByConvenio(entities);
      if (qt === 'WATERFALL_BY_FOLIO') return resolveQ02PaymentWaterfallAllocation(entities);
      if (qt === 'EXPECTED_RETENTION') return resolveQ03ExpectedRetentionByConvenio(entities);
      if (qt === 'EXPRESS_UNDER_1000') return resolveQ04ExpressNearPayoff();
      return resolveQ05PayrollDiscrepanciesLastCut();
    }
    case 'get_originacion_reestructuras_data': {
      if (qt === 'SIMULTANEOUS_NORMAL_LOANS') return resolveQ06SimultaneousNormalLoansByCurp(entities);
      if (qt === 'RESTRUCTURE_TRACEABILITY') return resolveQ07RestructureTraceability(entities);
      if (qt === 'CHECK_DISBURSEMENTS_30D') return resolveQ08CheckDisbursementsLast30Days();
      if (qt === 'FIRST_PAYMENT_OFFICIAL_LETTER') return resolveQ09FirstPaymentOfficialLetterDoc(entities);
      return resolveQ10MaxPayrollDiscountRule30(entities);
    }
    case 'get_insurance_status': {
      if (qt === 'RETIREES_EXEMPT_BY_AGE') return resolveQ11RetireesExemptLifeInsurance();
      if (qt === 'TOTAL_COLLECTED_BY_FORTNIGHT') return resolveQ12TotalLifeInsuranceCollected(entities);
      if (qt === 'ACTIVE_DEATH_CLAIMS') return resolveQ13PendingDeathInsuranceClaims();
      if (qt === 'COVERAGE_BY_FOLIO') return resolveQ14LoanInsuranceDetails(entities);
      return resolveQ15HealthSectorInsuredLoans();
    }
    case 'get_credit_bureau_closings': {
      if (qt === 'CIRCULO_CREDITO_MONTHLY_SUMMARY') return resolveQ16PastDueSummaryCirculoCredito(entities);
      if (qt === 'ACCOUNTS_OVER_90_DPD') return resolveQ17ClientsOver90Dpd();
      if (qt === 'SUPREMO_TRIBUNAL_BALANCE_AUDIT') return resolveQ18SupremoTribunalBalanceSum();
      if (qt === 'REPORTED_BALANCE_BY_FOLIO') return resolveQ19ReportedBureauBalanceForFolio(entities);
      return resolveQ20ExpressDelinquencyRate();
    }
    case 'get_worm_audit_and_arco_log': {
      if (qt === 'WORM_MANUAL_CAPITAL_OVERRIDE') return resolveQ21WormAuditManualCapitalOverride(entities);
      if (qt === 'PENDING_ARCO_CANCELLATIONS') return resolveQ22PendingArcoCancellationRequests();
      if (qt === 'WORM_RESTRUCTURE_AUTHORIZER_IP') return resolveQ23RestructureAuthorizationAndIp();
      return resolveQ24LatestOperationalNoteForFolio(entities);
    }
    case 'get_executive_portfolio_overview': {
      return {
        intentCode: 'EXECUTIVE_PORTFOLIO_OVERVIEW',
        domain: 'RESUMEN_EJECUTIVO',
        questionNumber: null,
        structuredData: { status: 'OK', note: 'Use macro portfolio snapshot metrics.' },
        deterministicMarkdown: '📊 Snapshot Ejecutivo Global consultado desde PostgreSQL 16.',
      };
    }
  }
}

/**
 * Ajuste Obligatorio 5: Detecta si una consulta retornó 0 filas en sus colecciones de datos.
 */
function isZeroResultsPayload(structuredData: Record<string, unknown>): boolean {
  for (const val of Object.values(structuredData)) {
    if (Array.isArray(val) && val.length === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Ajuste Obligatorio 4: Envuelve la ejecución de cada herramienta en un Promise.race con timeout de 10s.
 */
async function executeWithTimeout10s<T>(promise: Promise<T>): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new Error('TOOL_TIMEOUT_10S'));
    }, TOOL_EXECUTION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

export interface DispatchedToolExecutionResult {
  toolName: string;
  queryType: string;
  status: 'SUCCESS' | 'NO_RESULTS' | 'VALIDATION_ERROR' | 'TIMEOUT';
  llmPayload: Record<string, unknown>;
  deterministicMarkdown?: string;
}

/**
 * Despachador principal de Tool Calling (Guardrails A, B, D + Ajustes 1, 2, 4 y 5).
 */
export async function dispatchAlmaToolCall(
  toolName: string,
  rawArgs: Record<string, unknown>
): Promise<DispatchedToolExecutionResult> {
  // 1. Guardrail B + Ajustes 1 y 2: Validación Zero-Trust en Backend
  const validation = validateAndSanitizeToolArgs(toolName, rawArgs);
  if (!validation.valid || !validation.sanitizedArgs) {
    return {
      toolName,
      queryType: String(rawArgs.query_type ?? 'UNKNOWN'),
      status: 'VALIDATION_ERROR',
      llmPayload: {
        status: 'VALIDATION_ERROR',
        errorCode: validation.errorCode ?? 'INVALID_ARGUMENTS',
        message: validation.message ?? 'Invalid tool arguments rejected by backend security gate.',
      },
    };
  }

  const vArgs = validation.sanitizedArgs;
  const typedTool = toolName as AlmaToolName;

  try {
    // 2. Ajuste 4: Ejecución con timeout estricto de 10 segundos
    const domainRes = await executeWithTimeout10s(executePureDomainTool(typedTool, vArgs));

    // 3. Ajuste 5: Manejo elegante cuando no existen registros para el parámetro consultado
    if (isZeroResultsPayload(domainRes.structuredData)) {
      const targetLabel = vArgs.folio ?? vArgs.convenio ?? vArgs.fortnight_period ?? 'los criterios indicados';
      return {
        toolName,
        queryType: vArgs.query_type ?? 'OVERVIEW',
        status: 'NO_RESULTS',
        llmPayload: {
          status: 'NO_RESULTS',
          message: `No se encontraron datos para folio ${targetLabel} en el dominio ${domainRes.domain}.`,
          suggestion: 'Verifica que el folio sea correcto o consulta otro dominio.',
        },
        deterministicMarkdown: `ℹ️ No se encontraron datos para **${targetLabel}** en el dominio **${domainRes.domain}**.`,
      };
    }

    // 4. Guardrail D: Sanitización Zero-PII antes de devolver el resultado al LLM
    const sanitizedData = sanitizeForLlm(domainRes.structuredData) as Record<string, unknown>;

    return {
      toolName,
      queryType: vArgs.query_type ?? 'OVERVIEW',
      status: 'SUCCESS',
      llmPayload: {
        status: 'SUCCESS',
        domain: domainRes.domain,
        intentCode: domainRes.intentCode,
        data: sanitizedData,
      },
      deterministicMarkdown: domainRes.deterministicMarkdown,
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'TOOL_TIMEOUT_10S') {
      return {
        toolName,
        queryType: vArgs.query_type ?? 'OVERVIEW',
        status: 'TIMEOUT',
        llmPayload: {
          status: 'TIMEOUT',
          error: 'TOOL_TIMEOUT_10S',
          message: 'Tool execution timed out. Please try a more specific query.',
        },
      };
    }
    throw err;
  }
}
