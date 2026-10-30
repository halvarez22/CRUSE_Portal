/**
 * AGREGADOR DETERMINISTA DE KPIS Y DEDUPLICADOR 1:1 DEL DASHBOARD FINANCIERO
 *
 * Garantiza cuadre contable 1:1 entre las tarjetas de Hubs Nacionales
 * (Chihuahua, León, Cancún) y la Tabla Maestra de Cartera.
 *
 * @implements CRUSE-APO-2026-044 (Evidencia Forense #1)
 * @implements Regla 2 HRU (100% Decimal.js, Cero Punto Flotante)
 * @implements Regla 3 Anti-God-Object (< 600 líneas)
 */

import Decimal from 'decimal.js';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import { DelinquencySemaphore, HubRegion } from '../../types/executive';
import { DashboardKPIs, HubMetricsSummary } from '../../types/dashboard';

export interface RawDashboardKpiRow {
  exp_id: string;
  exp_status: string;
  hub_region: string | null;
  requested_amount: number | string | null;
  loan_id: string | null;
  loan_status: string | null;
  principal_original: number | string | null;
  current_balance: number | string | null;
  suspension_reason: string | null;
}

export interface RawLatestLoanDbRow {
  id: string;
  created_at: string;
  convenio: string | null;
  hub_region: string | null;
  raw_full_name: string | null;
  curp_masked: string;
  requested_amount: number | string | null;
  term_fortnights: number | string | null;
  product_type: string | null;
  status: string;
  encrypted_pii_payload: string | null;
  loan_status: string | null;
  principal_original: number | string | null;
  fortnightly_payment: number | string | null;
  suspension_reason: string | null;
}

interface DecimalHubAccumulator {
  loansCount: number;
  capitalColocadoDec: Decimal;
  capitalVigenteDec: Decimal;
  carteraVencidaDec: Decimal;
  semaphoreCounts: { VERDE: number; AMARILLO: number; ROJO: number };
}

export function decimalToJsonNumberStrict(dec: Decimal): number {
  const fixedStr = dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  return JSON.parse(fixedStr) as number;
}

export function rawToJsonDecimalStrict(
  rawValue: number | string | null | undefined,
  fallback = '0.00'
): number {
  const dec = sanitizeDecimalString(String(rawValue ?? fallback), fallback);
  return decimalToJsonNumberStrict(dec);
}

export function rawToJsonIntegerStrict(
  rawValue: number | string | null | undefined,
  fallback = '0'
): number {
  const dec = sanitizeDecimalString(String(rawValue ?? fallback), fallback);
  const fixedIntStr = dec.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
  return JSON.parse(fixedIntStr) as number;
}

export function normalizeHubFilter(raw: unknown): HubRegion | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'CHIHUAHUA' || upper === 'LEON' || upper === 'CANCUN') {
    return upper;
  }
  return null;
}

export function resolveHubRegion(rawHub: string | null | undefined): HubRegion {
  const upper = String(rawHub ?? '')
    .trim()
    .toUpperCase();
  if (upper === 'CHIHUAHUA' || upper === 'LEON' || upper === 'CANCUN') {
    return upper;
  }
  return 'CHIHUAHUA';
}

export function computeLoanSemaphore(
  expedienteStatus: string,
  loanStatus: string | null,
  suspensionReason: string | null
): DelinquencySemaphore {
  if (
    expedienteStatus === 'rechazado' ||
    expedienteStatus === 'rechazado_pld' ||
    loanStatus === 'FROZEN_EXTRAJUDICIAL' ||
    (suspensionReason && suspensionReason !== 'LICENCIA_SIN_GOCE')
  ) {
    return 'ROJO';
  }
  if (
    expedienteStatus === 'capturado' ||
    expedienteStatus === 'revision_pld' ||
    suspensionReason === 'LICENCIA_SIN_GOCE'
  ) {
    return 'AMARILLO';
  }
  return 'VERDE';
}

export function deduplicateLatestLoanRows(
  rows: ReadonlyArray<RawLatestLoanDbRow>,
  hubFilter: HubRegion | null
): RawLatestLoanDbRow[] {
  const seenIds = new Set<string>();
  const deduplicated: RawLatestLoanDbRow[] = [];

  for (const row of rows) {
    if (!row.id || seenIds.has(row.id)) {
      continue;
    }
    seenIds.add(row.id);

    const hub = resolveHubRegion(row.hub_region);
    if (hubFilter && hub !== hubFilter) {
      continue;
    }
    deduplicated.push(row);
  }

  return deduplicated;
}

export function aggregateDashboardKpisDeterministic(
  rows: ReadonlyArray<RawDashboardKpiRow>,
  hubFilter: HubRegion | null
): DashboardKPIs & { totalColocado: number; totalExpedientesUnicos: number } {
  const hubAccumulators: Record<HubRegion, DecimalHubAccumulator> = {
    CHIHUAHUA: {
      loansCount: 0,
      capitalColocadoDec: new Decimal('0.00'),
      capitalVigenteDec: new Decimal('0.00'),
      carteraVencidaDec: new Decimal('0.00'),
      semaphoreCounts: { VERDE: 0, AMARILLO: 0, ROJO: 0 },
    },
    LEON: {
      loansCount: 0,
      capitalColocadoDec: new Decimal('0.00'),
      capitalVigenteDec: new Decimal('0.00'),
      carteraVencidaDec: new Decimal('0.00'),
      semaphoreCounts: { VERDE: 0, AMARILLO: 0, ROJO: 0 },
    },
    CANCUN: {
      loansCount: 0,
      capitalColocadoDec: new Decimal('0.00'),
      capitalVigenteDec: new Decimal('0.00'),
      carteraVencidaDec: new Decimal('0.00'),
      semaphoreCounts: { VERDE: 0, AMARILLO: 0, ROJO: 0 },
    },
  };

  let totalColocadoDec = new Decimal('0.00');
  let capitalVigenteDec = new Decimal('0.00');
  let carteraVencidaDec = new Decimal('0.00');
  let creditosActivos = 0;
  const semaphoreCounts = { VERDE: 0, AMARILLO: 0, ROJO: 0 };

  const seenExpedientesGlobal = new Set<string>();

  for (const r of rows) {
    if (!r.exp_id || seenExpedientesGlobal.has(r.exp_id)) {
      continue;
    }
    seenExpedientesGlobal.add(r.exp_id);

    const hub = resolveHubRegion(r.hub_region);
    const sem = computeLoanSemaphore(r.exp_status, r.loan_status, r.suspension_reason);

    const rawPlaced = r.principal_original ?? r.requested_amount ?? '0.00';
    const placedDec = sanitizeDecimalString(String(rawPlaced), '0.00').toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP
    );

    const isActiveOrCaptured = r.exp_status === 'activo' || r.exp_status === 'capturado';
    const rawCurrentBal = isActiveOrCaptured
      ? (r.current_balance ?? r.principal_original ?? r.requested_amount ?? '0.00')
      : '0.00';
    const currentBalDec = sanitizeDecimalString(String(rawCurrentBal), '0.00').toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP
    );

    const overdueBalDec =
      sem === 'ROJO'
        ? sanitizeDecimalString(String(r.current_balance ?? rawPlaced), '0.00').toDecimalPlaces(
            2,
            Decimal.ROUND_HALF_UP
          )
        : new Decimal('0.00');

    const hb = hubAccumulators[hub];
    hb.loansCount += 1;
    hb.capitalColocadoDec = hb.capitalColocadoDec.plus(placedDec);
    hb.capitalVigenteDec = hb.capitalVigenteDec.plus(currentBalDec);
    hb.carteraVencidaDec = hb.carteraVencidaDec.plus(overdueBalDec);
    hb.semaphoreCounts[sem] += 1;

    if (hubFilter && hub !== hubFilter) {
      continue;
    }

    totalColocadoDec = totalColocadoDec.plus(placedDec);
    capitalVigenteDec = capitalVigenteDec.plus(currentBalDec);
    carteraVencidaDec = carteraVencidaDec.plus(overdueBalDec);
    semaphoreCounts[sem] += 1;

    if (isActiveOrCaptured) {
      creditosActivos += 1;
    }
  }

  const hubBreakdown: Record<HubRegion, HubMetricsSummary> = {
    CHIHUAHUA: {
      hubRegion: 'CHIHUAHUA',
      loansCount: hubAccumulators.CHIHUAHUA.loansCount,
      capitalColocado: decimalToJsonNumberStrict(hubAccumulators.CHIHUAHUA.capitalColocadoDec),
      capitalVigente: decimalToJsonNumberStrict(hubAccumulators.CHIHUAHUA.capitalVigenteDec),
      carteraVencida: decimalToJsonNumberStrict(hubAccumulators.CHIHUAHUA.carteraVencidaDec),
      semaphoreCounts: hubAccumulators.CHIHUAHUA.semaphoreCounts,
    },
    LEON: {
      hubRegion: 'LEON',
      loansCount: hubAccumulators.LEON.loansCount,
      capitalColocado: decimalToJsonNumberStrict(hubAccumulators.LEON.capitalColocadoDec),
      capitalVigente: decimalToJsonNumberStrict(hubAccumulators.LEON.capitalVigenteDec),
      carteraVencida: decimalToJsonNumberStrict(hubAccumulators.LEON.carteraVencidaDec),
      semaphoreCounts: hubAccumulators.LEON.semaphoreCounts,
    },
    CANCUN: {
      hubRegion: 'CANCUN',
      loansCount: hubAccumulators.CANCUN.loansCount,
      capitalColocado: decimalToJsonNumberStrict(hubAccumulators.CANCUN.capitalColocadoDec),
      capitalVigente: decimalToJsonNumberStrict(hubAccumulators.CANCUN.capitalVigenteDec),
      carteraVencida: decimalToJsonNumberStrict(hubAccumulators.CANCUN.carteraVencidaDec),
      semaphoreCounts: hubAccumulators.CANCUN.semaphoreCounts,
    },
  };

  const totalColocadoFormatted = decimalToJsonNumberStrict(totalColocadoDec);
  return {
    capitalColocado: totalColocadoFormatted,
    totalColocado: totalColocadoFormatted,
    capitalVigente: decimalToJsonNumberStrict(capitalVigenteDec),
    creditosActivos,
    carteraVencida: decimalToJsonNumberStrict(carteraVencidaDec),
    semaphoreCounts,
    hubBreakdown,
    totalExpedientesUnicos: seenExpedientesGlobal.size,
  };
}
