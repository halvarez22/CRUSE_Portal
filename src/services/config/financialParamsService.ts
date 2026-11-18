/**
 * SERVICIO DE PARÁMETROS FINANCIEROS DINÁMICOS CON RESPALDO TIPADO Y TRAZABILIDAD WORM
 * Expediente: CRUSE-APO-2026-067 (Guardrail Forense 7: Cero Hardcoding)
 *
 * Lee los parámetros vivos desde `system_financial_parameters` con fallback seguro a
 * `FINANCIAL_CONSTANTS`. Cada actualización sellada por `admin` registra `FINANCIAL_PARAMETER_UPDATED`
 * en la bitácora forense WORM con `beforeValue`, `afterValue`, `effectiveFrom` y `actorEmail`.
 */

import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';
import { UserRole } from '../../types';

export type EditableFinancialParamKey =
  | 'LIFE_INSURANCE_FORTNIGHTLY_MXN'
  | 'LIFE_INSURANCE_MONTHLY_MXN'
  | 'LIFE_INSURANCE_COVERAGE_MXN'
  | 'SPECIAL_CREDIT_MIN_MONTHLY_RATE'
  | 'SPECIAL_CREDIT_MAX_MONTHLY_RATE'
  | 'ISR_FINANCIAL_SYSTEM_RATE_2025'
  | 'ISR_FINANCIAL_SYSTEM_RATE_2026'
  | 'ISR_MUTUO_PF_INTEREST_RATE'
  | 'SUSTAINED_PAYMENTS_REQUIRED_COUNT'
  | 'PLD_RETENTION_YEARS_MINIMUM';

export interface FinancialParameterRecord {
  paramKey: EditableFinancialParamKey;
  numericValue: string;
  textValue: string;
  description: string;
  updatedBy: string;
  updatedAt: string;
}

export interface LiveFinancialParametersSnapshot {
  lifeInsuranceFortnightlyMxn: string;
  lifeInsuranceMonthlyMxn: string;
  lifeInsuranceCoverageMxn: string;
  specialCreditMinMonthlyRate: string;
  specialCreditMaxMonthlyRate: string;
  isrFinancialSystemRate2025: string;
  isrFinancialSystemRate2026: string;
  isrMutuoPfInterestRate: string;
  sustainedPaymentsRequiredCount: number;
  pldRetentionYearsMinimum: number;
  source: 'DATABASE' | 'FALLBACK_CONSTANTS';
}

const FALLBACK_DEFAULTS: Readonly<Record<EditableFinancialParamKey, { value: string; description: string }>> = {
  LIFE_INSURANCE_FORTNIGHTLY_MXN: {
    value: String(FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN),
    description: 'Prima quincenal de Seguro de Vida institucional (MXN)',
  },
  LIFE_INSURANCE_MONTHLY_MXN: {
    value: String(FINANCIAL_CONSTANTS.LIFE_INSURANCE_MONTHLY_MXN),
    description: 'Prima mensual de Seguro de Vida institucional (MXN)',
  },
  LIFE_INSURANCE_COVERAGE_MXN: {
    value: String(FINANCIAL_CONSTANTS.LIFE_INSURANCE_COVERAGE_MXN),
    description: 'Suma asegurada de póliza institucional de Seguro de Vida (MXN)',
  },
  SPECIAL_CREDIT_MIN_MONTHLY_RATE: {
    value: '0.0300',
    description: 'Tasa mensual mínima autorizada para Crédito Especial',
  },
  SPECIAL_CREDIT_MAX_MONTHLY_RATE: {
    value: '0.0500',
    description: 'Tasa mensual máxima autorizada para Crédito Especial',
  },
  ISR_FINANCIAL_SYSTEM_RATE_2025: {
    value: String(FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_05),
    description: 'Tasa anual LIF 2025 retención ISR sobre capital (Art. 54 LISR)',
  },
  ISR_FINANCIAL_SYSTEM_RATE_2026: {
    value: String(FINANCIAL_CONSTANTS.INVESTOR_ISR_RETENTION_RATE_09),
    description: 'Tasa anual LIF 2026 retención ISR sobre capital (Art. 54 LISR)',
  },
  ISR_MUTUO_PF_INTEREST_RATE: {
    value: '0.2000',
    description: 'Tasa provisional ISR sobre interés en mutuos PF (Art. 135/160 LISR)',
  },
  SUSTAINED_PAYMENTS_REQUIRED_COUNT: {
    value: '3',
    description: 'Amortizaciones consecutivas requeridas para Pago Sostenido CNBV',
  },
  PLD_RETENTION_YEARS_MINIMUM: {
    value: '10',
    description: 'Años mínimos de retención documental PLD/FT (DCG Art. 95 Bis LGOAAC)',
  },
};

export const ALLOWED_EDITABLE_PARAM_KEYS = Object.keys(FALLBACK_DEFAULTS) as EditableFinancialParamKey[];

export function isEditableFinancialParamKey(key: string): key is EditableFinancialParamKey {
  return Object.prototype.hasOwnProperty.call(FALLBACK_DEFAULTS, key);
}

export async function getLiveFinancialParameters(): Promise<LiveFinancialParametersSnapshot> {
  try {
    const res = await db.query<{ param_key: string; param_numeric_value: number | string | null; param_text_value: string | null }>(
      `SELECT param_key, param_numeric_value, param_text_value FROM system_financial_parameters`
    );
    const map = new Map<string, string>();
    for (const row of res.rows) {
      const raw = row.param_numeric_value ?? row.param_text_value;
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        map.set(row.param_key, String(raw));
      }
    }

    const pick = (k: EditableFinancialParamKey, dp = 2): string => {
      const raw = map.get(k) ?? FALLBACK_DEFAULTS[k].value;
      return new Decimal(raw).toDP(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
    };

    return {
      lifeInsuranceFortnightlyMxn: pick('LIFE_INSURANCE_FORTNIGHTLY_MXN', 2),
      lifeInsuranceMonthlyMxn: pick('LIFE_INSURANCE_MONTHLY_MXN', 2),
      lifeInsuranceCoverageMxn: pick('LIFE_INSURANCE_COVERAGE_MXN', 2),
      specialCreditMinMonthlyRate: pick('SPECIAL_CREDIT_MIN_MONTHLY_RATE', 4),
      specialCreditMaxMonthlyRate: pick('SPECIAL_CREDIT_MAX_MONTHLY_RATE', 4),
      isrFinancialSystemRate2025: pick('ISR_FINANCIAL_SYSTEM_RATE_2025', 4),
      isrFinancialSystemRate2026: pick('ISR_FINANCIAL_SYSTEM_RATE_2026', 4),
      isrMutuoPfInterestRate: pick('ISR_MUTUO_PF_INTEREST_RATE', 4),
      sustainedPaymentsRequiredCount: Number(pick('SUSTAINED_PAYMENTS_REQUIRED_COUNT', 0)),
      pldRetentionYearsMinimum: Math.max(10, Number(pick('PLD_RETENTION_YEARS_MINIMUM', 0))),
      source: map.size > 0 ? 'DATABASE' : 'FALLBACK_CONSTANTS',
    };
  } catch {
    return {
      lifeInsuranceFortnightlyMxn: new Decimal(FALLBACK_DEFAULTS.LIFE_INSURANCE_FORTNIGHTLY_MXN.value).toFixed(2),
      lifeInsuranceMonthlyMxn: new Decimal(FALLBACK_DEFAULTS.LIFE_INSURANCE_MONTHLY_MXN.value).toFixed(2),
      lifeInsuranceCoverageMxn: new Decimal(FALLBACK_DEFAULTS.LIFE_INSURANCE_COVERAGE_MXN.value).toFixed(2),
      specialCreditMinMonthlyRate: '0.0300',
      specialCreditMaxMonthlyRate: '0.0500',
      isrFinancialSystemRate2025: '0.0050',
      isrFinancialSystemRate2026: '0.0090',
      isrMutuoPfInterestRate: '0.2000',
      sustainedPaymentsRequiredCount: 3,
      pldRetentionYearsMinimum: 10,
      source: 'FALLBACK_CONSTANTS',
    };
  }
}

export async function listEditableFinancialParameters(): Promise<FinancialParameterRecord[]> {
  const res = await db.query<{
    param_key: string;
    param_numeric_value: number | string | null;
    param_text_value: string | null;
    description: string | null;
    updated_by: string | null;
    updated_at: string | null;
  }>(
    `SELECT param_key, param_numeric_value, param_text_value, description, updated_by, updated_at
     FROM system_financial_parameters`
  );

  const byKey = new Map(res.rows.map((r) => [r.param_key, r]));
  return ALLOWED_EDITABLE_PARAM_KEYS.map((key) => {
    const row = byKey.get(key);
    const fallback = FALLBACK_DEFAULTS[key];
    const numStr = String(row?.param_numeric_value ?? row?.param_text_value ?? fallback.value);
    return {
      paramKey: key,
      numericValue: numStr,
      textValue: row?.param_text_value ?? numStr,
      description: row?.description ?? fallback.description,
      updatedBy: row?.updated_by ?? 'system_seed',
      updatedAt: row?.updated_at ?? new Date().toISOString(),
    };
  });
}

export async function updateFinancialParameterWithAudit(input: {
  paramKey: EditableFinancialParamKey;
  newValue: number | string;
  effectiveFrom?: string;
  reason?: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  sourceSummary: string;
}): Promise<FinancialParameterRecord> {
  const newDec = new Decimal(input.newValue);
  if (!newDec.isFinite() || newDec.lt(0)) {
    throw new Error(`Valor numérico inválido para el parámetro '${input.paramKey}'.`);
  }
  if (input.paramKey === 'PLD_RETENTION_YEARS_MINIMUM' && newDec.lt(10)) {
    throw new Error('GUARDRAIL REGULATORIO: La retención mínima PLD/FT no puede ser inferior a 10 años (DCG Art. 95 Bis LGOAAC / CNBV).');
  }
  if (input.paramKey === 'SUSTAINED_PAYMENTS_REQUIRED_COUNT' && newDec.lt(3)) {
    throw new Error('GUARDRAIL CNBV: El Pago Sostenido requiere al menos 3 amortizaciones consecutivas oportunas.');
  }

  const effectiveFrom = input.effectiveFrom?.trim() || new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  return db.transaction(async (tx) => {
    const prevRes = await tx.query<{ param_numeric_value: number | string | null; description: string | null }>(
      `SELECT param_numeric_value, description FROM system_financial_parameters WHERE param_key = $1`,
      [input.paramKey]
    );

    const beforeValue = String(
      prevRes.rows[0]?.param_numeric_value ?? FALLBACK_DEFAULTS[input.paramKey].value
    );
    const description = prevRes.rows[0]?.description ?? FALLBACK_DEFAULTS[input.paramKey].description;
    const afterValue = newDec.toFixed(4);

    if (prevRes.rowCount > 0) {
      await tx.execute(
        `UPDATE system_financial_parameters
         SET param_numeric_value = $1, param_text_value = $2, updated_by = $3, updated_at = $4
         WHERE param_key = $5`,
        [newDec.toNumber(), afterValue, input.actorEmail, nowIso, input.paramKey]
      );
    } else {
      await tx.execute(
        `INSERT INTO system_financial_parameters (param_key, param_numeric_value, param_text_value, description, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.paramKey, newDec.toNumber(), afterValue, description, input.actorEmail, nowIso]
      );
    }

    await auditEventStore.appendInTx(tx, {
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      action: 'FINANCIAL_PARAMETER_UPDATED',
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: input.sourceSummary,
      details: JSON.stringify({
        paramKey: input.paramKey,
        beforeValue,
        afterValue,
        effectiveFrom,
        reason: input.reason?.trim() || 'Actualización administrativa de parámetro financiero (sin efecto retroactivo en contratos firmados)',
        actorEmail: input.actorEmail,
      }),
    });

    return {
      paramKey: input.paramKey,
      numericValue: afterValue,
      textValue: afterValue,
      description,
      updatedBy: input.actorEmail,
      updatedAt: nowIso,
    };
  });
}
