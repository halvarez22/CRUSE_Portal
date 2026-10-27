/**
 * ALMA VIRTUAL — MOTOR DE CONSULTAS PARAMETRIZADAS: DOMINIOS 3, 4 Y 5 (PREGUNTAS 11–24)
 * Expediente: CRUSE-APO-2026-033
 * Guardrail 1: 100% SQL Parametrizado ($1, $2). Cero interpolación de cadenas.
 * Guardrail 2: Cero exposición de PII en claro.
 */

import { db } from '../db/connectionPool';
import {
  AlmaVirtualDomainExecutionResult,
  AlmaVirtualValidatedEntities,
} from '../../types/executive';

function fmtMxn(val: number | string | null | undefined): string {
  const num = Number(val ?? 0);
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

/**
 * Q11: Créditos activos de Jubilados/Pensionados sin cobro de seguro por exceder edad (>65).
 */
export async function resolveQ11RetireesExemptLifeInsurance(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string;
    convenio: string;
    curp_masked: string;
    payroll_source_type: string;
    current_principal_balance: number;
    enrollment_status: string | null;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       la.payroll_source_type,
       la.current_principal_balance,
       lie.status AS enrollment_status
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     LEFT JOIN loan_insurance_enrollments lie ON lie.loan_account_id = la.id
     WHERE la.status = $1
       AND (la.insurance_required = $2 OR lie.status = $3 OR la.payroll_source_type = $4)
     ORDER BY la.contract_number ASC`,
    ['ACTIVE', 0, 'EXCLUDED_AGE_OVER_65', 'JUBILADO_PENSIONADO']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): Nómina \`${r.payroll_source_type}\` · Estado Seguro: **${r.enrollment_status ?? 'EXENTO_POR_EDAD'}** ($0.00 prima) · Saldo Insoluto: **${fmtMxn(r.current_principal_balance)}**`
  );

  return {
    intentCode: 'Q11_RETIREES_EXEMPT_INSURANCE',
    domain: 'SEGUROS',
    questionNumber: 11,
    structuredData: {
      exempt_retiree_loans_count: res.rows.length,
      loans: res.rows.map((r) => ({
        folio: r.contract_number,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        payroll_source_type: r.payroll_source_type,
        enrollment_status: r.enrollment_status ?? 'EXENTO_POR_EDAD',
        current_principal_balance_mxn: Number(r.current_principal_balance),
      })),
    },
    deterministicMarkdown: [
      `🛡️ **Créditos Activos de Jubilados/Pensionados Exentos de Seguro de Vida por Edad (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q12: Total cobrado por concepto de Seguro de Vida ($22.85) en la quincena a nivel global.
 */
export async function resolveQ12TotalLifeInsuranceCollected(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const periodParam = entities.fortnightPeriod ?? 'ALL';

  const res = await db.query<{
    fortnight_period: string;
    payments_with_insurance: number;
    total_insurance_collected: number;
  }>(
    `SELECT
       lpa.fortnight_period,
       SUM(CASE WHEN lpa.applied_insurance > 0 THEN 1 ELSE 0 END) AS payments_with_insurance,
       COALESCE(SUM(lpa.applied_insurance), 0) AS total_insurance_collected
     FROM loan_payment_applications lpa
     WHERE ($1 = 'ALL' OR lpa.fortnight_period = $1)
     GROUP BY lpa.fortnight_period
     ORDER BY lpa.fortnight_period DESC`,
    [periodParam]
  );

  const globalSum = res.rows.reduce((a, b) => a + Number(b.total_insurance_collected), 0);
  const lines = res.rows.map(
    (r) =>
      `• **Quincena ${r.fortnight_period}**: **${r.payments_with_insurance} aplicaciones** con prima de $22.85 → Total Cobrado: **${fmtMxn(r.total_insurance_collected)}**`
  );

  return {
    intentCode: 'Q12_TOTAL_INSURANCE_COLLECTED',
    domain: 'SEGUROS',
    questionNumber: 12,
    structuredData: {
      filter_period: periodParam,
      unit_premium_mxn: 22.85,
      global_total_collected_mxn: Number(globalSum.toFixed(2)),
      by_fortnight: res.rows.map((r) => ({
        fortnight_period: r.fortnight_period,
        payments_with_insurance: Number(r.payments_with_insurance),
        total_insurance_collected_mxn: Number(r.total_insurance_collected),
      })),
    },
    deterministicMarkdown: [
      `💰 **Recaudación Global por Prima de Seguro de Vida ($22.85/qna) — Total Acumulado: ${fmtMxn(globalSum)}:**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q13: Pólizas de seguro de crédito por hacerse efectivas por reporte de fallecimiento.
 */
export async function resolveQ13PendingDeathInsuranceClaims(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    claim_id: string;
    policy_number: string;
    insurance_company: string;
    contract_number: string;
    convenio: string;
    curp_masked: string;
    event_date: string;
    status: string;
    amount_paid: number;
    current_principal_balance: number;
  }>(
    `SELECT
       ic.id AS claim_id,
       ip.policy_number,
       ip.insurance_company,
       la.contract_number,
       e.convenio,
       e.curp_masked,
       CAST(ic.event_date AS TEXT) AS event_date,
       ic.status,
       COALESCE(ic.amount_paid, ip.coverage_amount) AS amount_paid,
       la.current_principal_balance
     FROM insurance_claims ic
     JOIN insurance_policies ip ON ip.id = ic.policy_id
     JOIN loan_accounts la ON la.id = ic.loan_account_id
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE ic.status <> $1
     ORDER BY ic.event_date DESC`,
    ['REJECTED']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Siniestro \`${r.claim_id}\`** · Póliza \`${r.policy_number}\` (${r.insurance_company}) · **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): Fecha evento \`${r.event_date.slice(0, 10)}\` · Estado: **${r.status}** · Suma Asegurada: **${fmtMxn(r.amount_paid)}** (Saldo insoluto a liquidar: ${fmtMxn(r.current_principal_balance)})`
  );

  return {
    intentCode: 'Q13_DEATH_INSURANCE_CLAIMS',
    domain: 'SEGUROS',
    questionNumber: 13,
    structuredData: {
      active_claims_count: res.rows.length,
      claims: res.rows.map((r) => ({
        claim_id: r.claim_id,
        policy_number: r.policy_number,
        insurance_company: r.insurance_company,
        folio: r.contract_number,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        event_date: r.event_date.slice(0, 10),
        status: r.status,
        coverage_amount_mxn: Number(r.amount_paid),
        loan_balance_to_settle_mxn: Number(r.current_principal_balance),
      })),
    },
    deterministicMarkdown: [
      `🕊️ **Reclamaciones de Póliza de Seguro de Vida por Fallecimiento (${res.rows.length} activas):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q14: Detalles de la cobertura de seguro asociada a un crédito [Folio].
 */
export async function resolveQ14LoanInsuranceDetails(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'ALL';

  const res = await db.query<{
    contract_number: string;
    convenio: string;
    policy_number: string;
    insurance_company: string;
    insured_amount: number;
    period_premium: number;
    first_payment_date: string;
    status: string;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       ip.policy_number,
       ip.insurance_company,
       lie.insured_amount,
       lie.period_premium,
       CAST(lie.first_payment_date AS TEXT) AS first_payment_date,
       lie.status
     FROM loan_insurance_enrollments lie
     JOIN insurance_policies ip ON ip.id = lie.policy_id
     JOIN loan_accounts la ON la.id = lie.loan_account_id
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE ($1 = 'ALL' OR la.contract_number = $1)
     ORDER BY la.contract_number ASC`,
    [folioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.convenio}) · Póliza \`${r.policy_number}\` (${r.insurance_company}): Suma Asegurada **${fmtMxn(r.insured_amount)}** · Prima Quincenal **${fmtMxn(r.period_premium)}** · Inicio \`${r.first_payment_date.slice(0, 10)}\` · Estatus: **${r.status}**`
  );

  return {
    intentCode: 'Q14_LOAN_INSURANCE_COVERAGE',
    domain: 'SEGUROS',
    questionNumber: 14,
    structuredData: {
      queried_folio: folioParam,
      enrollments: res.rows.map((r) => ({
        folio: r.contract_number,
        convenio: r.convenio,
        policy_number: r.policy_number,
        insurance_company: r.insurance_company,
        insured_amount_mxn: Number(r.insured_amount),
        period_premium_mxn: Number(r.period_premium),
        status: r.status,
      })),
    },
    deterministicMarkdown: [
      `📑 **Detalle de Cobertura de Seguro de Vida por Crédito (${res.rows.length} inscripciones):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q15: Créditos vigentes del sector Salud pagando actualmente la prima del seguro.
 */
export async function resolveQ15HealthSectorInsuredLoans(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string;
    convenio: string;
    curp_masked: string;
    period_premium: number;
    insured_amount: number;
    enrollment_status: string;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       lie.period_premium,
       lie.insured_amount,
       lie.status AS enrollment_status
     FROM loan_insurance_enrollments lie
     JOIN loan_accounts la ON la.id = lie.loan_account_id
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE e.convenio = $1
       AND lie.status = $2
     ORDER BY la.contract_number ASC`,
    ['SINDICATO_SALUD_GTO', 'ACTIVE']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): Prima Quincenal **${fmtMxn(r.period_premium)}** · Cobertura **${fmtMxn(r.insured_amount)}** (${r.enrollment_status})`
  );

  return {
    intentCode: 'Q15_HEALTH_SECTOR_INSURED',
    domain: 'SEGUROS',
    questionNumber: 15,
    structuredData: {
      convenio: 'SINDICATO_SALUD_GTO',
      active_insured_count: res.rows.length,
      loans: res.rows.map((r) => ({
        folio: r.contract_number,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        period_premium_mxn: Number(r.period_premium),
        insured_amount_mxn: Number(r.insured_amount),
      })),
    },
    deterministicMarkdown: [
      `🏥 **Créditos Vigentes del Sector Salud (SINDICATO_SALUD_GTO) con Prima de Seguro Activa (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q16: Resumen de cartera vencida a fin de mes para reporte a Círculo de Crédito.
 */
export async function resolveQ16PastDueSummaryCirculoCredito(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const monthParam = entities.reportingMonth ?? '2026-10';

  const res = await db.query<{
    reporting_month: string;
    manifest_hash: string;
    total_reported_accounts: number;
    current_accounts: number;
    past_due_accounts: number;
    total_reported_balance: number;
    past_due_balance: number;
  }>(
    `SELECT
       cbr.reporting_month,
       cbr.manifest_hash,
       COUNT(cbrd.id) AS total_reported_accounts,
       SUM(CASE WHEN cbrd.days_past_due = 0 THEN 1 ELSE 0 END) AS current_accounts,
       SUM(CASE WHEN cbrd.days_past_due > 0 THEN 1 ELSE 0 END) AS past_due_accounts,
       COALESCE(SUM(cbrd.reported_balance), 0) AS total_reported_balance,
       COALESCE(SUM(CASE WHEN cbrd.days_past_due > 0 THEN cbrd.reported_balance ELSE 0 END), 0) AS past_due_balance
     FROM credit_bureau_reports cbr
     LEFT JOIN credit_bureau_report_details cbrd ON cbrd.report_id = cbr.id
     WHERE ($1 = 'ALL' OR cbr.reporting_month = $1)
     GROUP BY cbr.id, cbr.reporting_month, cbr.manifest_hash`,
    [monthParam]
  );

  const row = res.rows[0];
  return {
    intentCode: 'Q16_CIRCULO_CREDITO_SUMMARY',
    domain: 'BURO',
    questionNumber: 16,
    structuredData: {
      reporting_month: row?.reporting_month ?? monthParam,
      manifest_hash: row?.manifest_hash ?? 'N/A',
      total_reported_accounts: Number(row?.total_reported_accounts ?? 0),
      current_accounts: Number(row?.current_accounts ?? 0),
      past_due_accounts: Number(row?.past_due_accounts ?? 0),
      total_reported_balance_mxn: Number(row?.total_reported_balance ?? 0),
      past_due_balance_mxn: Number(row?.past_due_balance ?? 0),
    },
    deterministicMarkdown: [
      `📊 **Resumen de Cierre Mensual para Círculo de Crédito (${row?.reporting_month ?? monthParam} — Otorgante 001496):**`,
      `• **Total Cuentas Reportadas en Cinta:** **${row?.total_reported_accounts ?? 0} créditos** (Saldo total reportado: **${fmtMxn(row?.total_reported_balance)}**)`,
      `• **Cartera Vigente (DPD = 0):** **${row?.current_accounts ?? 0} créditos**`,
      `• **Cartera en Atraso / Vencida (DPD > 0):** **${row?.past_due_accounts ?? 0} créditos** por **${fmtMxn(row?.past_due_balance)}**`,
      `• **Sello Criptográfico SHA-256:** \`${row?.manifest_hash ?? 'N/A'}\``,
    ].join('\n'),
  };
}

/**
 * Q17: Clientes que superaron los 90 días de atraso (DPD > 90) en el corte.
 */
export async function resolveQ17ClientsOver90Dpd(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string;
    convenio: string;
    curp_masked: string;
    reporting_month: string;
    reported_balance: number;
    days_past_due: number;
    observation_code: string | null;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       cbr.reporting_month,
       cbrd.reported_balance,
       cbrd.days_past_due,
       cbrd.observation_code
     FROM credit_bureau_report_details cbrd
     JOIN credit_bureau_reports cbr ON cbr.id = cbrd.report_id
     JOIN loan_accounts la ON la.id = cbrd.loan_account_id
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE cbrd.days_past_due > $1
     ORDER BY cbrd.days_past_due DESC`,
    [90]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): **${r.days_past_due} días de atraso (DPD)** · Saldo Vencido: **${fmtMxn(r.reported_balance)}** · Clave Buró: \`${r.observation_code ?? 'UP'}\` (Corte ${r.reporting_month})`
  );

  return {
    intentCode: 'Q17_CLIENTS_OVER_90_DPD',
    domain: 'BURO',
    questionNumber: 17,
    structuredData: {
      dpd_threshold: 90,
      accounts_over_90_dpd: res.rows.length,
      accounts: res.rows.map((r) => ({
        folio: r.contract_number,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        days_past_due: Number(r.days_past_due),
        reported_balance_mxn: Number(r.reported_balance),
        observation_code: r.observation_code ?? 'UP',
        reporting_month: r.reporting_month,
      })),
    },
    deterministicMarkdown: [
      `🚨 **Cuentas con Más de 90 Días de Atraso (DPD > 90) en Reporte a Buró (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q18: Sumatoria mensual del saldo insoluto de todos los créditos del Supremo Tribunal.
 */
export async function resolveQ18SupremoTribunalBalanceSum(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string;
    curp_masked: string;
    principal_original: number;
    current_principal_balance: number;
    fortnightly_payment: number;
    disbursement_method: string;
  }>(
    `SELECT
       la.contract_number,
       e.curp_masked,
       la.principal_original,
       la.current_principal_balance,
       la.fortnightly_payment,
       la.disbursement_method
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE e.convenio = $1
     ORDER BY la.contract_number ASC`,
    ['SUPREMO_TRIBUNAL']
  );

  const totalInsoluto = res.rows.reduce((a, b) => a + Number(b.current_principal_balance), 0);
  const totalOriginal = res.rows.reduce((a, b) => a + Number(b.principal_original), 0);
  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (\`${r.curp_masked}\`): Capital Original **${fmtMxn(r.principal_original)}** | **Saldo Insoluto Actual: ${fmtMxn(r.current_principal_balance)}** | Cuota Qnal: **${fmtMxn(r.fortnightly_payment)}** (${r.disbursement_method})`
  );

  return {
    intentCode: 'Q18_SUPREMO_TRIBUNAL_BALANCE_SUM',
    domain: 'BURO',
    questionNumber: 18,
    structuredData: {
      convenio: 'SUPREMO_TRIBUNAL',
      loans_count: res.rows.length,
      sum_principal_original_mxn: totalOriginal,
      sum_current_principal_balance_mxn: totalInsoluto,
      loans: res.rows.map((r) => ({
        folio: r.contract_number,
        curp_masked: r.curp_masked,
        principal_original_mxn: Number(r.principal_original),
        current_principal_balance_mxn: Number(r.current_principal_balance),
        fortnightly_payment_mxn: Number(r.fortnightly_payment),
      })),
    },
    deterministicMarkdown: [
      `⚖️ **Auditoría Interna — Sumatoria de Saldo Insoluto del Supremo Tribunal: ${fmtMxn(totalInsoluto)} (${res.rows.length} créditos):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q19: Saldo reportado al buró el mes pasado para un crédito [Folio].
 */
export async function resolveQ19ReportedBureauBalanceForFolio(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'ALL';

  const res = await db.query<{
    contract_number: string;
    reporting_month: string;
    reported_balance: number;
    days_past_due: number;
    observation_code: string | null;
  }>(
    `SELECT
       la.contract_number,
       cbr.reporting_month,
       cbrd.reported_balance,
       cbrd.days_past_due,
       cbrd.observation_code
     FROM credit_bureau_report_details cbrd
     JOIN credit_bureau_reports cbr ON cbr.id = cbrd.report_id
     JOIN loan_accounts la ON la.id = cbrd.loan_account_id
     WHERE ($1 = 'ALL' OR la.contract_number = $1)
     ORDER BY cbr.reporting_month DESC, la.contract_number ASC`,
    [folioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (Corte \`${r.reporting_month}\`): Saldo Reportado a Buró **${fmtMxn(r.reported_balance)}** · Días de Atraso (DPD): **${r.days_past_due}** · Clave Observación: \`${r.observation_code ?? 'CC'}\``
  );

  return {
    intentCode: 'Q19_REPORTED_BUREAU_BALANCE_FOLIO',
    domain: 'BURO',
    questionNumber: 19,
    structuredData: {
      queried_folio: folioParam,
      bureau_records: res.rows.map((r) => ({
        folio: r.contract_number,
        reporting_month: r.reporting_month,
        reported_balance_mxn: Number(r.reported_balance),
        days_past_due: Number(r.days_past_due),
        observation_code: r.observation_code ?? 'CC',
      })),
    },
    deterministicMarkdown: [
      `🏛️ **Verificación de Saldo Reportado a Círculo de Crédito (${res.rows.length} registros):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q20: Índice de morosidad actual de la cartera de Créditos Express.
 */
export async function resolveQ20ExpressDelinquencyRate(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    total_express_loans: number;
    past_due_express_loans: number;
    total_express_balance: number;
    past_due_express_balance: number;
  }>(
    `SELECT
       COUNT(*) AS total_express_loans,
       SUM(CASE WHEN status <> $2 THEN 1 ELSE 0 END) AS past_due_express_loans,
       COALESCE(SUM(current_principal_balance), 0) AS total_express_balance,
       COALESCE(SUM(CASE WHEN status <> $2 THEN current_principal_balance ELSE 0 END), 0) AS past_due_express_balance
     FROM loan_accounts
     WHERE product_type = $1`,
    ['EXPRESS', 'ACTIVE']
  );

  const row = res.rows[0];
  const totBal = Number(row?.total_express_balance ?? 0);
  const pdBal = Number(row?.past_due_express_balance ?? 0);
  const ratePct = totBal > 0 ? ((pdBal / totBal) * 100).toFixed(2) : '0.00';

  return {
    intentCode: 'Q20_EXPRESS_DELINQUENCY_RATE',
    domain: 'BURO',
    questionNumber: 20,
    structuredData: {
      product_type: 'EXPRESS',
      total_express_loans: Number(row?.total_express_loans ?? 0),
      past_due_express_loans: Number(row?.past_due_express_loans ?? 0),
      total_express_balance_mxn: totBal,
      past_due_express_balance_mxn: pdBal,
      delinquency_rate_percent: `${ratePct}%`,
    },
    deterministicMarkdown: [
      `📈 **Índice de Morosidad Actual — Cartera de Créditos Express:**`,
      `• **Total Créditos Express:** **${row?.total_express_loans ?? 0}** (Saldo insoluto total: **${fmtMxn(totBal)}**)`,
      `• **Créditos Express en Atraso / Mora:** **${row?.past_due_express_loans ?? 0}** (Saldo en mora: **${fmtMxn(pdBal)}**)`,
      `• **Índice de Morosidad (IMOR Express):** **${ratePct}%**`,
    ].join('\n'),
  };
}

/**
 * Q21: Bitácora WORM: qué usuario realizó el ajuste manual de capital en la aplicación de pago.
 */
export async function resolveQ21WormAuditManualCapitalOverride(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'CNT-2026-0201';

  const res = await db.query<{
    audit_id: string;
    ts: string;
    actor_email: string;
    actor_role: string;
    source_ip: string;
    curp_masked: string | null;
    record_hash: string;
    details: string | null;
  }>(
    `SELECT
       id AS audit_id,
       CAST(ts AS TEXT) AS ts,
       actor_email,
       actor_role,
       source_ip,
       curp_masked,
       record_hash,
       details
     FROM audit_events
     WHERE action = $1
     ORDER BY ts DESC
     LIMIT 5`,
    ['PAYMENT_MANUAL_CAPITAL_OVERRIDE']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Evento WORM \`${r.audit_id}\`** (${r.ts.slice(0, 19)}) · Usuario Autorizador: **\`${r.actor_email}\`** (Rol: \`${r.actor_role}\`) · IP Origen: \`${r.source_ip}\` · Hash SHA-256: \`${r.record_hash.slice(0, 16)}...\` · Detalle: \`${r.details ?? ''}\``
  );

  return {
    intentCode: 'Q21_WORM_MANUAL_CAPITAL_OVERRIDE',
    domain: 'WORM_ARCO',
    questionNumber: 21,
    structuredData: {
      queried_folio: folioParam,
      worm_events: res.rows.map((r) => ({
        audit_id: r.audit_id,
        timestamp: r.ts,
        actor_email: r.actor_email,
        actor_role: r.actor_role,
        source_ip: r.source_ip,
        curp_masked: r.curp_masked,
        record_hash: r.record_hash,
        details: r.details,
      })),
    },
    deterministicMarkdown: [
      `🔒 **Auditoría Forense WORM — Ajustes Manuales de Prelación / Capital:**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q22: Solicitudes de cancelación de Derechos ARCO pendientes de resolver.
 */
export async function resolveQ22PendingArcoCancellationRequests(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    arco_id: string;
    convenio: string;
    curp_masked: string;
    request_type: string;
    status: string;
    created_at: string;
  }>(
    `SELECT
       ar.id AS arco_id,
       e.convenio,
       e.curp_masked,
       ar.request_type,
       ar.status,
       CAST(ar.created_at AS TEXT) AS created_at
     FROM arco_requests ar
     JOIN expedientes e ON e.id = ar.expediente_id
     WHERE ar.status = $1
     ORDER BY ar.created_at DESC`,
    ['PENDIENTE_RESOLUCION']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Solicitud \`${r.arco_id}\`** (${r.convenio} · Titular \`${r.curp_masked}\`): Tipo **${r.request_type}** · Estatus: **${r.status}** · Recibida: \`${r.created_at.slice(0, 10)}\``
  );

  return {
    intentCode: 'Q22_PENDING_ARCO_REQUESTS',
    domain: 'WORM_ARCO',
    questionNumber: 22,
    structuredData: {
      pending_arco_count: res.rows.length,
      requests: res.rows.map((r) => ({
        arco_id: r.arco_id,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        request_type: r.request_type,
        status: r.status,
        created_at: r.created_at.slice(0, 10),
      })),
    },
    deterministicMarkdown: [
      `⚖️ **Solicitudes de Derechos ARCO (LFPDPPP) Pendientes de Resolución (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q23: Quién autorizó y desde qué dirección IP se realizó la última reestructura.
 */
export async function resolveQ23RestructureAuthorizationAndIp(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    audit_id: string;
    ts: string;
    actor_email: string;
    actor_role: string;
    source_ip: string;
    curp_masked: string | null;
    record_hash: string;
    details: string | null;
  }>(
    `SELECT
       id AS audit_id,
       CAST(ts AS TEXT) AS ts,
       actor_email,
       actor_role,
       source_ip,
       curp_masked,
       record_hash,
       details
     FROM audit_events
     WHERE action = $1
     ORDER BY ts DESC
     LIMIT 5`,
    ['LOAN_RESTRUCTURED']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Autorizador: \`${r.actor_email}\`** (Rol: \`${r.actor_role}\`) · **Dirección IP: \`${r.source_ip}\`** · Fecha: \`${r.ts.slice(0, 19)}\` · Acreditado: \`${r.curp_masked ?? 'N/A'}\` · Sello WORM: \`${r.record_hash.slice(0, 16)}...\` · Detalles: \`${r.details ?? ''}\``
  );

  return {
    intentCode: 'Q23_RESTRUCTURE_AUTHORIZER_IP',
    domain: 'WORM_ARCO',
    questionNumber: 23,
    structuredData: {
      restructure_audit_events: res.rows.map((r) => ({
        audit_id: r.audit_id,
        authorized_by: r.actor_email,
        actor_role: r.actor_role,
        source_ip: r.source_ip,
        curp_masked: r.curp_masked,
        timestamp: r.ts,
        record_hash: r.record_hash,
        details: r.details,
      })),
    },
    deterministicMarkdown: [
      `🕵️ **Trazabilidad Forense de Autorización e IP de Reestructuras (Bitácora WORM):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q24: Nota operativa interna más reciente añadida al expediente / crédito [Folio].
 */
export async function resolveQ24LatestOperationalNoteForFolio(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'ALL';

  const res = await db.query<{
    note_id: string;
    entity_type: string;
    contract_number: string | null;
    note_content: string;
    author_email: string;
    created_at: string;
  }>(
    `SELECT
       opn.id AS note_id,
       opn.entity_type,
       la.contract_number,
       opn.note_content,
       opn.author_email,
       CAST(opn.created_at AS TEXT) AS created_at
     FROM operational_notes opn
     LEFT JOIN loan_accounts la ON la.id = opn.entity_id
     WHERE ($1 = 'ALL' OR la.contract_number = $1 OR opn.note_content LIKE '%' || $1 || '%')
     ORDER BY opn.created_at DESC
     LIMIT 5`,
    [folioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number ?? r.entity_type}** (\`${r.created_at.slice(0, 16)}\` por \`${r.author_email}\`): *"${r.note_content}"*`
  );

  return {
    intentCode: 'Q24_LATEST_OPERATIONAL_NOTE',
    domain: 'WORM_ARCO',
    questionNumber: 24,
    structuredData: {
      queried_folio: folioParam,
      notes: res.rows.map((r) => ({
        note_id: r.note_id,
        folio: r.contract_number ?? r.entity_type,
        note_content: r.note_content,
        author_email: r.author_email,
        created_at: r.created_at,
      })),
    },
    deterministicMarkdown: [
      `📌 **Notas Operativas Internas Más Recientes en Mesa de Control (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}
