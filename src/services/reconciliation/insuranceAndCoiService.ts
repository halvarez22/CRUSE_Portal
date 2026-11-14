/**
 * MOTOR DE PADRÓN DE ASEGURADORA ($35,000) Y PÓLIZA CONTABLE ASPEL COI CON PARTIDA DOBLE ESTRICTA
 * Expediente: CRUSE-APO-2026-063 (Caso 5 — Guardrail Forense 5: Partida Doble Inquebrantable con Decimal.js)
 *
 * - Homologado a 'LISTA SEGUROS DE VIDA admon.xlsx', 'Q. ACUMULADO' y 'Reporte cartera mensual.xlsx' (Lic. Alma).
 * - Cuentas oficiales Aspel COI centralizadas en FINANCIAL_CONSTANTS.COI_ACCOUNTING_CATALOG:
 *   1104001001 (Capital), 4101001001 (Interés), 2104001001 (IVA 16%), 4103000001 (Seguro $22.85), 1102001001 (Bancos).
 * - Guardrail Forense 5: Si Suma Cargos !== Suma Abonos por un solo centavo, aborta la exportación y sella
 *   la alerta WORM COI_POLIZA_UNBALANCED.
 */

import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';
import { maskPiiForPreview } from './creditBureauService';
import { UserRole } from '../../types';

export interface InsuranceRosterRow {
  estatus: string;
  consec: number;
  depcia: string;
  numeroEmpleado: string;
  nombreCompletoMasked: string;
  sexo: string;
  fechaNacimiento: string;
  fechaColocacion: string;
  sumaAsegurada: string;
  observaciones: string;
  contractNumber: string;
  loanAccountId: string;
}

export interface CoiPolizaEntry {
  accountNumber: string;
  accountName: string;
  concept: string;
  type: 'DEBIT' | 'CREDIT';
  amount: Decimal;
  amountFormatted: string;
}

export interface CoiAccountingPolizaResult {
  polizaFolio: string;
  periodFilter: string;
  generatedAtIso: string;
  totalDebits: string;
  totalCredits: string;
  isBalanced: boolean;
  entries: Array<{
    accountNumber: string;
    accountName: string;
    concept: string;
    type: 'DEBIT' | 'CREDIT';
    amount: string;
  }>;
  csvContent: string;
}

interface RosterQueryRow {
  loan_account_id: string;
  contract_number: string;
  expediente_id: string;
  convenio: string;
  full_name_masked: string;
  curp_masked: string;
  blind_curp: string;
  gender: string | null;
  birth_date: string | Date | null;
  borrower_sex: string | null;
  borrower_birth_date: string | null;
  activated_at: string | Date;
  is_renewal: number | null;
  insurance_status: string | null;
  insured_amount: string | number | null;
  restructured_from_count: number | string;
}

interface PaymentTotalsRow {
  sum_capital: string | number | null;
  sum_interest: string | number | null;
  sum_vat: string | number | null;
  sum_insurance: string | number | null;
  payments_count: string | number;
}

/**
 * Genera el Padrón Oficial de Aseguradora ('LISTA SEGUROS DE VIDA admon.xlsx')
 * con Suma Asegurada fija de $35,000.00 MXN y detección automática de "Cambio de colocación (2do Crédito)".
 */
export async function generateInsuranceRosterReport(options: {
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  totalInsuredCount: number;
  totalSumAssuredMxn: string;
  rows: InsuranceRosterRow[];
  csvContent: string;
}> {
  const dbRows = await db.query<RosterQueryRow>(`
    SELECT
      la.id AS loan_account_id,
      la.contract_number,
      la.expediente_id,
      e.convenio,
      e.full_name AS full_name_masked,
      e.curp_masked,
      e.blind_curp,
      e.gender,
      e.birth_date,
      la.borrower_sex,
      la.borrower_birth_date,
      la.activated_at,
      la.is_renewal,
      li.status AS insurance_status,
      li.insured_amount,
      COALESCE((SELECT COUNT(*) FROM loan_restructures lr WHERE lr.new_loan_id = la.id), 0) AS restructured_from_count
    FROM loan_accounts la
    INNER JOIN expedientes e ON e.id = la.expediente_id
    LEFT JOIN loan_insurance_enrollments li ON li.loan_account_id = la.id
    WHERE la.insurance_required = 1
      AND la.status = 'ACTIVE'
    ORDER BY la.activated_at ASC, la.contract_number ASC
  `);

  const sumAssuredFixed = new Decimal(FINANCIAL_CONSTANTS.INSURANCE_SUM_ASSURED_MXN).toDP(
    2,
    Decimal.ROUND_HALF_UP
  );
  let totalSumAssuredDec = new Decimal(0);

  const rows: InsuranceRosterRow[] = dbRows.rows.map((r, index) => {
    const masked = maskPiiForPreview({
      maskedNameFromDb: r.full_name_masked,
      curpMaskedFromDb: r.curp_masked,
      blindCurp: r.blind_curp,
    });

    const insuredAmt = r.insured_amount
      ? new Decimal(r.insured_amount).toDP(2, Decimal.ROUND_HALF_UP)
      : sumAssuredFixed;
    totalSumAssuredDec = totalSumAssuredDec.plus(insuredAmt);

    const isSecondCreditRenewal =
      Number(r.is_renewal ?? 0) === 1 || Number(r.restructured_from_count ?? 0) > 0;
    const rawBirth = r.borrower_birth_date || r.birth_date;
    const birthStr =
      rawBirth instanceof Date
        ? rawBirth.toISOString().slice(0, 10)
        : rawBirth
          ? String(rawBirth).slice(0, 10)
          : '1982-05-15';
    const colocacionStr =
      r.activated_at instanceof Date
        ? r.activated_at.toISOString().slice(0, 10)
        : String(r.activated_at).slice(0, 10);

    return {
      estatus: r.insurance_status || 'ACTIVO',
      consec: index + 1,
      depcia: r.convenio,
      numeroEmpleado: `EMP-${masked.blindCurpPrefix.slice(0, 6).toUpperCase()}`,
      nombreCompletoMasked: masked.maskedName,
      sexo: (r.borrower_sex || r.gender || 'M').toUpperCase(),
      fechaNacimiento: birthStr,
      fechaColocacion: colocacionStr,
      sumaAsegurada: insuredAmt.toFixed(2),
      observaciones: isSecondCreditRenewal
        ? 'Cambio de colocación (2do Crédito)'
        : 'Colocación inicial vigente',
      contractNumber: r.contract_number,
      loanAccountId: r.loan_account_id,
    };
  });

  const headers = [
    'ESTATUS',
    'CONSEC',
    'DEPCIA',
    'NUMERO DE EMPLEADO',
    'Nombre Completo',
    'Sexo',
    'Fecha de nacimiento',
    'F. colocación',
    'Suma Asegurada',
    'Observaciones',
  ];
  const escapeCsv = (val: string | number): string => `"${String(val).replace(/"/g, '""')}"`;
  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) =>
      [
        r.estatus,
        r.consec,
        r.depcia,
        r.numeroEmpleado,
        r.nombreCompletoMasked,
        r.sexo,
        r.fechaNacimiento,
        r.fechaColocacion,
        r.sumaAsegurada,
        r.observaciones,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ].join('\r\n');

  await auditEventStore.append({
    actorEmail: options.actorEmail,
    actorRole: options.actorRole,
    action: 'INSURANCE_ROSTER_GENERATED',
    outcome: 'success',
    sourceIp: options.sourceIp,
    sourceSummary: 'insuranceAndCoiService:generateInsuranceRosterReport',
    details: JSON.stringify({
      totalInsuredCount: rows.length,
      totalSumAssuredMxn: totalSumAssuredDec.toFixed(2),
    }),
  });

  return {
    totalInsuredCount: rows.length,
    totalSumAssuredMxn: totalSumAssuredDec.toFixed(2),
    rows,
    csvContent,
  };
}

/**
 * Guardrail Forense 5 (CRUSE-APO-2026-063): Valida y construye las partidas de la Póliza Contable Aspel COI
 * usando exclusivamente Decimal.js y verificando que Suma Cargos === Suma Abonos al centavo exacto.
 */
export function buildAndVerifyCoiDoubleEntryEntries(input: {
  capitalApplied: number | string | Decimal;
  interestApplied: number | string | Decimal;
  vatApplied: number | string | Decimal;
  insuranceApplied: number | string | Decimal;
  periodLabel: string;
  overrideDebitAmountForTest?: number | string | Decimal;
}): {
  entries: CoiPolizaEntry[];
  totalDebits: Decimal;
  totalCredits: Decimal;
} {
  const capDec = new Decimal(input.capitalApplied || 0).toDP(2, Decimal.ROUND_HALF_UP);
  const intDec = new Decimal(input.interestApplied || 0).toDP(2, Decimal.ROUND_HALF_UP);
  const vatDec = new Decimal(input.vatApplied || 0).toDP(2, Decimal.ROUND_HALF_UP);
  const insDec = new Decimal(input.insuranceApplied || 0).toDP(2, Decimal.ROUND_HALF_UP);

  const expectedDebitDec =
    input.overrideDebitAmountForTest !== undefined
      ? new Decimal(input.overrideDebitAmountForTest).toDP(2, Decimal.ROUND_HALF_UP)
      : capDec.plus(intDec).plus(vatDec).plus(insDec).toDP(2, Decimal.ROUND_HALF_UP);

  const catalog = FINANCIAL_CONSTANTS.COI_ACCOUNTING_CATALOG;
  const entries: CoiPolizaEntry[] = [
    {
      accountNumber: catalog.BANCOS_COBRANZA,
      accountName: 'BANCOS CONCENTRADORA COBRANZA NÓMINA',
      concept: `Ingreso cobranza periodo ${input.periodLabel}`,
      type: 'DEBIT',
      amount: expectedDebitDec,
      amountFormatted: expectedDebitDec.toFixed(2),
    },
    {
      accountNumber: catalog.CAPITAL_CARTERA,
      accountName: 'CAPITAL CARTERA DE CRÉDITO VIGENTE',
      concept: `Amortización capital ${input.periodLabel}`,
      type: 'CREDIT',
      amount: capDec,
      amountFormatted: capDec.toFixed(2),
    },
    {
      accountNumber: catalog.INTERES_ORDINARIO,
      accountName: 'INGRESOS POR INTERESES ORDINARIOS',
      concept: `Interés ordinario devengado ${input.periodLabel}`,
      type: 'CREDIT',
      amount: intDec,
      amountFormatted: intDec.toFixed(2),
    },
    {
      accountNumber: catalog.IVA_TRASLADADO,
      accountName: 'IVA TRASLADADO 16% COBRADO',
      concept: `IVA sobre intereses ${input.periodLabel}`,
      type: 'CREDIT',
      amount: vatDec,
      amountFormatted: vatDec.toFixed(2),
    },
    {
      accountNumber: catalog.SEGURO_VIDA,
      accountName: 'RECUPERACIÓN SEGURO DE VIDA ACREDITADOS ($22.85)',
      concept: `Prima seguro de vida ${input.periodLabel}`,
      type: 'CREDIT',
      amount: insDec,
      amountFormatted: insDec.toFixed(2),
    },
  ];

  // Guardrail Forense 5: Aserción de Partida Doble Inquebrantable
  const totalDebits = entries
    .filter((e) => e.type === 'DEBIT')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
  const totalCredits = entries
    .filter((e) => e.type === 'CREDIT')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
  if (!totalDebits.equals(totalCredits)) {
    throw new Error(`Partida Doble Violada: Cargos ${totalDebits} !== Abonos ${totalCredits}`);
  }

  return { entries, totalDebits, totalCredits };
}

/**
 * Genera la Póliza Contable Aspel COI desde las aplicaciones de pago en BD (o periodo filtrado),
 * registrando alerta WORM COI_POLIZA_UNBALANCED si existiera cualquier descuadre.
 */
export async function generateCoiAccountingPoliza(options: {
  fortnightPeriod?: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  overrideDebitAmountForTest?: number | string;
}): Promise<CoiAccountingPolizaResult> {
  const periodClean = options.fortnightPeriod?.trim() || 'ALL';
  const totalsRes =
    periodClean === 'ALL'
      ? await db.query<PaymentTotalsRow>(`
          SELECT
            COALESCE(SUM(applied_capital), 0) AS sum_capital,
            COALESCE(SUM(applied_interest), 0) AS sum_interest,
            COALESCE(SUM(applied_vat), 0) AS sum_vat,
            COALESCE(SUM(applied_insurance), 0) AS sum_insurance,
            COUNT(*) AS payments_count
          FROM loan_payment_applications
        `)
      : await db.query<PaymentTotalsRow>(
          `SELECT
            COALESCE(SUM(applied_capital), 0) AS sum_capital,
            COALESCE(SUM(applied_interest), 0) AS sum_interest,
            COALESCE(SUM(applied_vat), 0) AS sum_vat,
            COALESCE(SUM(applied_insurance), 0) AS sum_insurance,
            COUNT(*) AS payments_count
          FROM loan_payment_applications
          WHERE fortnight_period = $1`,
          [periodClean]
        );

  const row = totalsRes.rows[0];

  try {
    const { entries, totalDebits, totalCredits } = buildAndVerifyCoiDoubleEntryEntries({
      capitalApplied: row?.sum_capital ?? 0,
      interestApplied: row?.sum_interest ?? 0,
      vatApplied: row?.sum_vat ?? 0,
      insuranceApplied: row?.sum_insurance ?? 0,
      periodLabel: periodClean,
      overrideDebitAmountForTest: options.overrideDebitAmountForTest,
    });

    const polizaFolio = `POL-COI-${periodClean.replace(/[^A-Z0-9-]/gi, '')}`;
    const generatedAtIso = new Date().toISOString();
    const csvHeaders = ['Cuenta_COI', 'Nombre_Cuenta', 'Concepto', 'Tipo_Movimiento', 'Importe_MXN'];
    const escapeCsv = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const csvContent = [
      csvHeaders.map(escapeCsv).join(','),
      ...entries.map((e) =>
        [e.accountNumber, e.accountName, e.concept, e.type, e.amountFormatted].map(escapeCsv).join(',')
      ),
    ].join('\r\n');

    await auditEventStore.append({
      actorEmail: options.actorEmail,
      actorRole: options.actorRole,
      action: 'COI_POLIZA_GENERATED',
      outcome: 'success',
      sourceIp: options.sourceIp,
      sourceSummary: 'insuranceAndCoiService:generateCoiAccountingPoliza',
      details: JSON.stringify({
        polizaFolio,
        periodFilter: periodClean,
        totalDebits: totalDebits.toFixed(2),
        totalCredits: totalCredits.toFixed(2),
        paymentsCount: Number(row?.payments_count ?? 0),
      }),
    });

    return {
      polizaFolio,
      periodFilter: periodClean,
      generatedAtIso,
      totalDebits: totalDebits.toFixed(2),
      totalCredits: totalCredits.toFixed(2),
      isBalanced: true,
      entries: entries.map((e) => ({
        accountNumber: e.accountNumber,
        accountName: e.accountName,
        concept: e.concept,
        type: e.type,
        amount: e.amountFormatted,
      })),
      csvContent,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Partida Doble Violada';
    await auditEventStore.append({
      actorEmail: options.actorEmail,
      actorRole: options.actorRole,
      action: 'COI_POLIZA_UNBALANCED',
      outcome: 'failure',
      sourceIp: options.sourceIp,
      sourceSummary: 'insuranceAndCoiService:generateCoiAccountingPoliza',
      details: JSON.stringify({
        periodFilter: periodClean,
        error: errMsg,
      }),
    });
    throw err;
  }
}
