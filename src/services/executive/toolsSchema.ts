/**
 * CATÁLOGO DECLARATIVO DE HERRAMIENTAS (TOOL CALLING) Y VALIDADOR ZERO-TRUST DE PARÁMETROS
 * Expediente: CRUSE-APO-2026-033-R3
 * Guardrail A: Prohibición absoluta de Text-to-SQL directo (6 herramientas declarativas).
 * Guardrail B: Validación estricta Zero-Trust de parámetros en backend.
 * Ajuste 1: Matriz condicional REQUIRED_PARAMS_BY_QUERY por query_type.
 * Ajuste 2: Límites de longitud máxima (maxLength) Anti-DoS en JSON Schema y backend.
 */

import type { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import {
  AlmaToolName,
  AlmaToolValidationOutcome,
  AlmaValidatedToolArgs,
} from '../../types/executive';

export const ALLOWED_CONVENIOS_LIST = [
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
  'ALL',
] as const;

const ALLOWED_CONVENIOS_SET = new Set<string>(ALLOWED_CONVENIOS_LIST);

const ALLOWED_TOOLS_SET = new Set<AlmaToolName>([
  'get_cobranza_data',
  'get_originacion_reestructuras_data',
  'get_insurance_status',
  'get_credit_bureau_closings',
  'get_worm_audit_and_arco_log',
  'get_executive_portfolio_overview',
  'query_phase2_cnbv_and_cib_status',
]);

const QUERY_TYPES_BY_TOOL: Record<AlmaToolName, ReadonlySet<string>> = {
  get_cobranza_data: new Set([
    'PARTIAL_PAYMENTS',
    'WATERFALL_BY_FOLIO',
    'EXPECTED_RETENTION',
    'EXPRESS_UNDER_1000',
    'PAYROLL_DISCREPANCIES',
  ]),
  get_originacion_reestructuras_data: new Set([
    'SIMULTANEOUS_NORMAL_LOANS',
    'RESTRUCTURE_TRACEABILITY',
    'CHECK_DISBURSEMENTS_30D',
    'FIRST_PAYMENT_OFFICIAL_LETTER',
    'MAX_DISCOUNT_RULE_30',
  ]),
  get_insurance_status: new Set([
    'RETIREES_EXEMPT_BY_AGE',
    'TOTAL_COLLECTED_BY_FORTNIGHT',
    'ACTIVE_DEATH_CLAIMS',
    'COVERAGE_BY_FOLIO',
    'HEALTH_SECTOR_ACTIVE_INSURED',
  ]),
  get_credit_bureau_closings: new Set([
    'CIRCULO_CREDITO_MONTHLY_SUMMARY',
    'ACCOUNTS_OVER_90_DPD',
    'SUPREMO_TRIBUNAL_BALANCE_AUDIT',
    'REPORTED_BALANCE_BY_FOLIO',
    'EXPRESS_DELINQUENCY_RATE',
  ]),
  get_worm_audit_and_arco_log: new Set([
    'WORM_MANUAL_CAPITAL_OVERRIDE',
    'PENDING_ARCO_CANCELLATIONS',
    'WORM_RESTRUCTURE_AUTHORIZER_IP',
    'LATEST_OPERATIONAL_NOTE_BY_FOLIO',
  ]),
  get_executive_portfolio_overview: new Set(),
  query_phase2_cnbv_and_cib_status: new Set([
    'GRAY_LIST_AND_OCR_EXCEPTIONS',
    'SITI_REPORTS_AND_SLA_CLOCK',
    'CIB_BATCHES_TRACEABILITY',
  ]),
};

/**
 * Ajuste Obligatorio 1: Matriz de dependencia condicional de parámetros obligatorios por query_type.
 */
export const REQUIRED_PARAMS_BY_QUERY: Record<string, readonly string[]> = {
  PARTIAL_PAYMENTS: [],
  WATERFALL_BY_FOLIO: ['folio'],
  EXPECTED_RETENTION: ['convenio'],
  EXPRESS_UNDER_1000: [],
  PAYROLL_DISCREPANCIES: [],
  SIMULTANEOUS_NORMAL_LOANS: ['curp_prefix'],
  RESTRUCTURE_TRACEABILITY: ['folio'],
  CHECK_DISBURSEMENTS_30D: [],
  FIRST_PAYMENT_OFFICIAL_LETTER: ['folio'],
  MAX_DISCOUNT_RULE_30: ['folio'],
  RETIREES_EXEMPT_BY_AGE: [],
  TOTAL_COLLECTED_BY_FORTNIGHT: ['fortnight_period'],
  ACTIVE_DEATH_CLAIMS: [],
  COVERAGE_BY_FOLIO: ['folio'],
  HEALTH_SECTOR_ACTIVE_INSURED: [],
  CIRCULO_CREDITO_MONTHLY_SUMMARY: ['reporting_month'],
  ACCOUNTS_OVER_90_DPD: [],
  SUPREMO_TRIBUNAL_BALANCE_AUDIT: [],
  REPORTED_BALANCE_BY_FOLIO: ['folio'],
  EXPRESS_DELINQUENCY_RATE: [],
  WORM_MANUAL_CAPITAL_OVERRIDE: ['folio'],
  PENDING_ARCO_CANCELLATIONS: [],
  WORM_RESTRUCTURE_AUTHORIZER_IP: [],
  LATEST_OPERATIONAL_NOTE_BY_FOLIO: ['folio'],
  GRAY_LIST_AND_OCR_EXCEPTIONS: [],
  SITI_REPORTS_AND_SLA_CLOCK: [],
  CIB_BATCHES_TRACEABILITY: [],
};

const ALLOWED_KEYS_SET = new Set([
  'query_type',
  'folio',
  'convenio',
  'fortnight_period',
  'curp_prefix',
  'reporting_month',
]);

/**
 * Esquema JSON de Herramientas compatible con OpenAI / Groq Function Calling (con maxLength Anti-DoS).
 */
export const ALMA_VIRTUAL_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_cobranza_data',
      description:
        'Consulta datos reales de cobranza quincenal en PostgreSQL 16: pagos parciales por convenio/quincena (PARTIAL_PAYMENTS), cascada de prelación WORM centavo a centavo de Seguro $22.85, Interés, IVA, Capital y saldo insoluto actual de un folio (WATERFALL_BY_FOLIO), retención esperada por dependencia (EXPECTED_RETENTION), créditos Express < $1,000 por liquidarse (EXPRESS_UNDER_1000) y discrepancias de nómina (PAYROLL_DISCREPANCIES).',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            maxLength: 40,
            enum: [
              'PARTIAL_PAYMENTS',
              'WATERFALL_BY_FOLIO',
              'EXPECTED_RETENTION',
              'EXPRESS_UNDER_1000',
              'PAYROLL_DISCREPANCIES',
            ],
            description: 'Sub-consulta específica del dominio de Cobranza Quincenal.',
          },
          folio: {
            type: 'string',
            maxLength: 20,
            description:
              'Folio del contrato en formato CNT-YYYY-NNNN o CRUSE-YYYY-NNNN (obligatorio para WATERFALL_BY_FOLIO, ej. CNT-2026-0201).',
          },
          convenio: {
            type: 'string',
            maxLength: 30,
            enum: [...ALLOWED_CONVENIOS_LIST],
            description:
              'Código oficial del convenio institucional (obligatorio para EXPECTED_RETENTION, ej. SUPREMO_TRIBUNAL, STSGECH).',
          },
          fortnight_period: {
            type: 'string',
            maxLength: 12,
            description: 'Periodo quincenal en formato YYYY-MM-1Q o YYYY-MM-2Q (ej. 2026-10-1Q).',
          },
        },
        required: ['query_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_originacion_reestructuras_data',
      description:
        'Consulta datos reales de originación y reestructuras N-a-1 en PostgreSQL 16: créditos Normales simultáneos por CURP bajo RN-01 máx. 4 (SIMULTANEOUS_NORMAL_LOANS), trazabilidad de reestructuras N-a-1 indicando qué folio original se liquidó (RESTRUCTURE_TRACEABILITY), desembolsos con cheque físico últimos 30 días (CHECK_DISBURSEMENTS_30D), verificación digital de Oficio de 1er Pago (FIRST_PAYMENT_OFFICIAL_LETTER) y límite máximo de descuento Regla 30%/35% (MAX_DISCOUNT_RULE_30).',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            maxLength: 40,
            enum: [
              'SIMULTANEOUS_NORMAL_LOANS',
              'RESTRUCTURE_TRACEABILITY',
              'CHECK_DISBURSEMENTS_30D',
              'FIRST_PAYMENT_OFFICIAL_LETTER',
              'MAX_DISCOUNT_RULE_30',
            ],
            description: 'Sub-consulta específica del dominio de Originación y Reestructuras.',
          },
          folio: {
            type: 'string',
            maxLength: 20,
            description:
              'Folio del contrato en formato CNT-YYYY-NNNN o CRUSE-YYYY-NNNN (obligatorio para RESTRUCTURE_TRACEABILITY, FIRST_PAYMENT_OFFICIAL_LETTER y MAX_DISCOUNT_RULE_30).',
          },
          curp_prefix: {
            type: 'string',
            maxLength: 18,
            description:
              'Prefijo de 4 letras iniciales de la CURP enmascarada (obligatorio para SIMULTANEOUS_NORMAL_LOANS, ej. MORA, GOMA, MAGR).',
          },
        },
        required: ['query_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_insurance_status',
      description:
        'Consulta el estado real de pólizas de Seguro de Vida Colectivo ($35,000.00 MXN suma asegurada, prima $22.85 quincenal) en PostgreSQL 16: jubilados/pensionados exentos por edad > 65 (RETIREES_EXEMPT_BY_AGE), total cobrado por prima de $22.85 en una quincena (TOTAL_COLLECTED_BY_FORTNIGHT), siniestros activos por fallecimiento (ACTIVE_DEATH_CLAIMS), detalles de cobertura de seguro de un folio (COVERAGE_BY_FOLIO) y asegurados vigentes del sector Salud (HEALTH_SECTOR_ACTIVE_INSURED).',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            maxLength: 40,
            enum: [
              'RETIREES_EXEMPT_BY_AGE',
              'TOTAL_COLLECTED_BY_FORTNIGHT',
              'ACTIVE_DEATH_CLAIMS',
              'COVERAGE_BY_FOLIO',
              'HEALTH_SECTOR_ACTIVE_INSURED',
            ],
            description: 'Sub-consulta específica del dominio de Seguros y Siniestros.',
          },
          folio: {
            type: 'string',
            maxLength: 20,
            description:
              'Folio del contrato en formato CNT-YYYY-NNNN o CRUSE-YYYY-NNNN (obligatorio para COVERAGE_BY_FOLIO, ej. CNT-2026-0201).',
          },
          fortnight_period: {
            type: 'string',
            maxLength: 12,
            description:
              'Periodo quincenal en formato YYYY-MM-1Q o YYYY-MM-2Q (obligatorio para TOTAL_COLLECTED_BY_FORTNIGHT, ej. 2026-10-1Q).',
          },
        },
        required: ['query_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_credit_bureau_closings',
      description:
        'Consulta datos reales de Buró de Crédito (Círculo de Crédito otorgante 001496) y cierres mensuales en PostgreSQL 16: resumen mensual de cartera vencida (CIRCULO_CREDITO_MONTHLY_SUMMARY), clientes con atraso DPD > 90 días (ACCOUNTS_OVER_90_DPD), sumatoria mensual de saldo insoluto del Supremo Tribunal (SUPREMO_TRIBUNAL_BALANCE_AUDIT), saldo reportado a buró de un folio (REPORTED_BALANCE_BY_FOLIO) e índice de morosidad Express (EXPRESS_DELINQUENCY_RATE).',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            maxLength: 40,
            enum: [
              'CIRCULO_CREDITO_MONTHLY_SUMMARY',
              'ACCOUNTS_OVER_90_DPD',
              'SUPREMO_TRIBUNAL_BALANCE_AUDIT',
              'REPORTED_BALANCE_BY_FOLIO',
              'EXPRESS_DELINQUENCY_RATE',
            ],
            description: 'Sub-consulta específica del dominio de Buró de Crédito y Cierres.',
          },
          folio: {
            type: 'string',
            maxLength: 20,
            description:
              'Folio del contrato en formato CNT-YYYY-NNNN o CRUSE-YYYY-NNNN (obligatorio para REPORTED_BALANCE_BY_FOLIO).',
          },
          reporting_month: {
            type: 'string',
            maxLength: 10,
            description:
              'Mes de cierre en formato YYYY-MM (obligatorio para CIRCULO_CREDITO_MONTHLY_SUMMARY, ej. 2026-10).',
          },
        },
        required: ['query_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_worm_audit_and_arco_log',
      description:
        'Consulta registros inmutables en la Bitácora Forense WORM (audit_events), Derechos ARCO y notas operativas en PostgreSQL 16: usuario autorizador, rol, dirección IP, hora exacta y hash SHA-256 de ajustes manuales MANUAL_OVERRIDE de un folio (WORM_MANUAL_CAPITAL_OVERRIDE), solicitudes de cancelación ARCO pendientes (PENDING_ARCO_CANCELLATIONS), autorizador e IP de la última reestructura (WORM_RESTRUCTURE_AUTHORIZER_IP) y nota operativa interna más reciente de un folio (LATEST_OPERATIONAL_NOTE_BY_FOLIO).',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            maxLength: 40,
            enum: [
              'WORM_MANUAL_CAPITAL_OVERRIDE',
              'PENDING_ARCO_CANCELLATIONS',
              'WORM_RESTRUCTURE_AUTHORIZER_IP',
              'LATEST_OPERATIONAL_NOTE_BY_FOLIO',
            ],
            description: 'Sub-consulta específica del dominio de Bitácora Forense WORM y ARCO.',
          },
          folio: {
            type: 'string',
            maxLength: 20,
            description:
              'Folio del contrato en formato CNT-YYYY-NNNN o CRUSE-YYYY-NNNN (obligatorio para WORM_MANUAL_CAPITAL_OVERRIDE y LATEST_OPERATIONAL_NOTE_BY_FOLIO, ej. CNT-2026-0201).',
          },
        },
        required: ['query_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_executive_portfolio_overview',
      description:
        'Obtiene el snapshot ejecutivo global de Microfinanciera Cruse: créditos otorgados este mes, capital colocado y vigente total, alertas PLD/FT pendientes, semáforo de morosidad por Hub Nacional (Chihuahua, León, Cancún) y líneas de fondeo.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_phase2_cnbv_and_cib_status',
      description:
        'Consulta en tiempo real el estado de Cumplimiento Asistido Fase 2 (CNBV/UIF y Carga CIB Logic Systems): expedientes en Lista Gris esperando autorización de Dirección y Matriz de Riesgo (GRAY_LIST_AND_OCR_EXCEPTIONS), reportes regulatorios SITI (ROR, ROI Fraccionadas, Tentativas 24h, Buzón ROIP y Reloj SLA 60+3 días hábiles) (SITI_REPORTS_AND_SLA_CLOCK), y lotes de carga semiautomática CIB de 3 pasos (CIB_BATCHES_TRACEABILITY).',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            maxLength: 40,
            enum: [
              'GRAY_LIST_AND_OCR_EXCEPTIONS',
              'SITI_REPORTS_AND_SLA_CLOCK',
              'CIB_BATCHES_TRACEABILITY',
            ],
            description: 'Sub-consulta de Fase 2 Cumplimiento Asistido CNBV y CIB.',
          },
        },
        required: ['query_type'],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Validador Zero-Trust en Backend para argumentos provistos por el LLM (Guardrail B + Ajustes 1 y 2).
 */
export function validateAndSanitizeToolArgs(
  toolName: string,
  rawArgs: Record<string, unknown>
): AlmaToolValidationOutcome {
  if (!ALLOWED_TOOLS_SET.has(toolName as AlmaToolName)) {
    return {
      valid: false,
      errorCode: 'UNKNOWN_TOOL',
      message: `Tool '${toolName}' is not registered in Alma Virtual's security catalog.`,
    };
  }

  const typedTool = toolName as AlmaToolName;
  if (typedTool === 'get_executive_portfolio_overview') {
    return { valid: true, sanitizedArgs: {} };
  }

  for (const key of Object.keys(rawArgs)) {
    if (!ALLOWED_KEYS_SET.has(key)) {
      return {
        valid: false,
        errorCode: 'UNEXPECTED_PROPERTY',
        message: `Property '${key}' is not allowed in tool '${toolName}'.`,
      };
    }
  }

  const rawQueryType = typeof rawArgs.query_type === 'string' ? rawArgs.query_type.trim() : '';
  if (!rawQueryType) {
    return {
      valid: false,
      errorCode: 'MISSING_QUERY_TYPE',
      message: `Missing required parameter 'query_type' for tool '${toolName}'.`,
    };
  }
  if (rawQueryType.length > 40) {
    return {
      valid: false,
      errorCode: 'QUERY_TYPE_TOO_LONG',
      message: `Parameter 'query_type' exceeds maxLength of 40 characters.`,
    };
  }
  if (!QUERY_TYPES_BY_TOOL[typedTool].has(rawQueryType)) {
    return {
      valid: false,
      errorCode: 'INVALID_QUERY_TYPE',
      message: `Invalid query_type '${rawQueryType}' for tool '${toolName}'.`,
    };
  }

  // Ajuste Obligatorio 1: Validación condicional de parámetros obligatorios según query_type
  const requiredForQuery = REQUIRED_PARAMS_BY_QUERY[rawQueryType] ?? [];
  for (const reqKey of requiredForQuery) {
    const val = rawArgs[reqKey];
    if (typeof val !== 'string' || val.trim().length === 0) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_PARAMETER',
        message: `Missing required parameter '${reqKey}' for query_type '${rawQueryType}'`,
      };
    }
  }

  const sanitizedArgs: AlmaValidatedToolArgs = {
    query_type: rawQueryType,
    folio: null,
    convenio: null,
    fortnight_period: null,
    curp_prefix: null,
    reporting_month: null,
  };

  // Ajuste Obligatorio 2 + Guardrail B: Validación de longitud máxima y Regex estricto por parámetro
  if (rawArgs.folio !== undefined && rawArgs.folio !== null && String(rawArgs.folio).trim() !== '') {
    const rawFolio = String(rawArgs.folio).trim().toUpperCase();
    if (rawFolio.length > 20) {
      return {
        valid: false,
        errorCode: 'FOLIO_TOO_LONG',
        message: `Parameter 'folio' exceeds maximum allowed length of 20 characters.`,
      };
    }
    const m = rawFolio.match(/^(?:CNT|CRUSE)-(\d{4}-\d{4})$/);
    if (!m || !m[1]) {
      return {
        valid: false,
        errorCode: 'INVALID_FOLIO_FORMAT',
        message: `Invalid 'folio' parameter '${rawFolio}'. Must strictly match ^(?:CNT|CRUSE)-\\d{4}-\\d{4}$.`,
      };
    }
    sanitizedArgs.folio = `CNT-${m[1]}`;
  }

  if (
    rawArgs.fortnight_period !== undefined &&
    rawArgs.fortnight_period !== null &&
    String(rawArgs.fortnight_period).trim() !== ''
  ) {
    const rawPeriod = String(rawArgs.fortnight_period).trim().toUpperCase();
    if (rawPeriod.length > 12) {
      return {
        valid: false,
        errorCode: 'FORTNIGHT_PERIOD_TOO_LONG',
        message: `Parameter 'fortnight_period' exceeds maximum length of 12 characters.`,
      };
    }
    if (rawPeriod !== 'ALL' && !/^\d{4}-\d{2}-[12]Q$/.test(rawPeriod)) {
      return {
        valid: false,
        errorCode: 'INVALID_FORTNIGHT_PERIOD',
        message: `Invalid 'fortnight_period' '${rawPeriod}'. Expected format YYYY-MM-1Q or YYYY-MM-2Q.`,
      };
    }
    sanitizedArgs.fortnight_period = rawPeriod;
  }

  if (
    rawArgs.convenio !== undefined &&
    rawArgs.convenio !== null &&
    String(rawArgs.convenio).trim() !== ''
  ) {
    const rawConv = String(rawArgs.convenio).trim().toUpperCase().replace(/\s+/g, '_');
    if (rawConv.length > 30) {
      return {
        valid: false,
        errorCode: 'CONVENIO_TOO_LONG',
        message: `Parameter 'convenio' exceeds maximum length of 30 characters.`,
      };
    }
    if (!ALLOWED_CONVENIOS_SET.has(rawConv)) {
      return {
        valid: false,
        errorCode: 'INVALID_CONVENIO',
        message: `Invalid 'convenio' '${rawConv}'. Not in official convenios whitelist.`,
      };
    }
    sanitizedArgs.convenio = rawConv;
  }

  if (
    rawArgs.curp_prefix !== undefined &&
    rawArgs.curp_prefix !== null &&
    String(rawArgs.curp_prefix).trim() !== ''
  ) {
    const rawCurp = String(rawArgs.curp_prefix).trim().toUpperCase();
    if (rawCurp.length > 18) {
      return {
        valid: false,
        errorCode: 'CURP_PREFIX_TOO_LONG',
        message: `Parameter 'curp_prefix' exceeds maximum length of 18 characters.`,
      };
    }
    const m = rawCurp.match(/^([A-Z]{4})(?:\*{0,14}[A-Z0-9]{0,2})?$/);
    if (!m || !m[1]) {
      return {
        valid: false,
        errorCode: 'INVALID_CURP_PREFIX',
        message: `Invalid 'curp_prefix'. Must begin with 4 uppercase letters.`,
      };
    }
    sanitizedArgs.curp_prefix = m[1];
  }

  if (
    rawArgs.reporting_month !== undefined &&
    rawArgs.reporting_month !== null &&
    String(rawArgs.reporting_month).trim() !== ''
  ) {
    const rawMonth = String(rawArgs.reporting_month).trim().toUpperCase();
    if (rawMonth.length > 10) {
      return {
        valid: false,
        errorCode: 'REPORTING_MONTH_TOO_LONG',
        message: `Parameter 'reporting_month' exceeds maximum length of 10 characters.`,
      };
    }
    if (rawMonth !== 'ALL' && !/^\d{4}-\d{2}$/.test(rawMonth)) {
      return {
        valid: false,
        errorCode: 'INVALID_REPORTING_MONTH',
        message: `Invalid 'reporting_month' '${rawMonth}'. Expected YYYY-MM (e.g. 2026-10).`,
      };
    }
    sanitizedArgs.reporting_month = rawMonth;
  }

  return {
    valid: true,
    sanitizedArgs,
  };
}
