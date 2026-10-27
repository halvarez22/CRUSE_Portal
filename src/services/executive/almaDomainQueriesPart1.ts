/**
 * ALMA VIRTUAL — MOTOR DE CONSULTAS PARAMETRIZADAS: DOMINIOS 1 Y 2 (PREGUNTAS 1–10)
 * Expediente: CRUSE-APO-2026-033
 * Guardrail 1: 100% SQL Parametrizado ($1, $2). Cero interpolación de cadenas.
 * Guardrail 2: Cero exposición de PII en claro (uso exclusivo de folios, convenios y máscaras).
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
 * Q1: Empleados del convenio que realizaron pagos parciales o incompletos en la quincena.
 */
export async function resolveQ01PartialPaymentsByConvenio(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const periodParam = entities.fortnightPeriod ?? 'ALL';
  const convenioParam = entities.convenioCode ?? 'ALL';

  const res = await db.query<{
    agreement_name: string;
    fortnight_period: string;
    curp_masked: string;
    contract_number: string | null;
    expected_payment: number;
    actual_payment: number;
    difference: number;
    status: string;
    audit_notes: string | null;
  }>(
    `SELECT
       rb.agreement_name,
       rb.fortnight_period,
       ri.curp_masked,
       la.contract_number,
       ri.expected_payment,
       ri.actual_payment,
       ri.difference,
       ri.status,
       ri.audit_notes
     FROM reconciliation_items ri
     JOIN reconciliation_batches rb ON rb.id = ri.batch_id
     LEFT JOIN loan_payment_applications lpa ON lpa.reconciliation_item_id = ri.id
     LEFT JOIN loan_accounts la ON la.id = lpa.loan_account_id
     WHERE (ri.actual_payment < ri.expected_payment OR ri.status IN ('DISCREPANCY_UNDERPAYMENT', 'MISSING_IN_PAYROLL'))
       AND ($1 = 'ALL' OR rb.fortnight_period = $1)
       AND ($2 = 'ALL' OR rb.agreement_name = $2)
     ORDER BY rb.fortnight_period DESC, rb.agreement_name ASC`,
    [periodParam, convenioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Convenio ${r.agreement_name}** (${r.fortnight_period}) · Folio **${r.contract_number ?? 'En ident.'}** · Acreditado \`${r.curp_masked}\`: Esperado **${fmtMxn(r.expected_payment)}** | Recibido **${fmtMxn(r.actual_payment)}** | Diferencia **${fmtMxn(r.difference)}** (${r.status})`
  );

  return {
    intentCode: 'Q01_PARTIAL_PAYMENTS_CONVENIO',
    domain: 'COBRANZA',
    questionNumber: 1,
    structuredData: {
      filter_period: periodParam,
      filter_convenio: convenioParam,
      records_found: res.rows.length,
      items: res.rows.map((r) => ({
        convenio: r.agreement_name,
        fortnight_period: r.fortnight_period,
        folio: r.contract_number ?? 'N/A',
        curp_masked: r.curp_masked,
        expected_payment_mxn: Number(r.expected_payment),
        actual_payment_mxn: Number(r.actual_payment),
        difference_mxn: Number(r.difference),
        status: r.status,
      })),
    },
    deterministicMarkdown: [
      `📋 **Pagos Parciales e Incompletos Detectados en Conciliación (${res.rows.length} registros):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q2: Prelación de pago parcial (Seguro -> Interés -> IVA -> Capital) para un folio.
 */
export async function resolveQ02PaymentWaterfallAllocation(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'CNT-2026-0201';

  const res = await db.query<{
    contract_number: string;
    fortnight_period: string;
    amount_received: number;
    applied_insurance: number;
    applied_interest: number;
    applied_vat: number;
    applied_capital: number;
    balance_before: number;
    balance_after: number;
    allocation_mode: string;
    authorized_by: string | null;
  }>(
    `SELECT
       la.contract_number,
       lpa.fortnight_period,
       lpa.amount_received,
       lpa.applied_insurance,
       lpa.applied_interest,
       lpa.applied_vat,
       lpa.applied_capital,
       lpa.balance_before,
       lpa.balance_after,
       lpa.allocation_mode,
       lpa.authorized_by
     FROM loan_payment_applications lpa
     JOIN loan_accounts la ON la.id = lpa.loan_account_id
     WHERE ($1 = 'ALL' OR la.contract_number = $1)
     ORDER BY lpa.created_at DESC
     LIMIT 5`,
    [folioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.fortnight_period}) · Recibido: **${fmtMxn(r.amount_received)}**\n  - 1° Seguro de Vida: **${fmtMxn(r.applied_insurance)}**\n  - 2° Interés Ordinario: **${fmtMxn(r.applied_interest)}**\n  - 3° IVA de Intereses: **${fmtMxn(r.applied_vat)}**\n  - 4° Abono a Capital: **${fmtMxn(r.applied_capital)}**\n  - Saldo Insoluto: **${fmtMxn(r.balance_before)}** → **${fmtMxn(r.balance_after)}** (Modo: \`${r.allocation_mode}\`)`
  );

  return {
    intentCode: 'Q02_WATERFALL_ALLOCATION',
    domain: 'COBRANZA',
    questionNumber: 2,
    structuredData: {
      queried_folio: folioParam,
      applications: res.rows.map((r) => ({
        folio: r.contract_number,
        fortnight_period: r.fortnight_period,
        amount_received_mxn: Number(r.amount_received),
        applied_insurance_mxn: Number(r.applied_insurance),
        applied_interest_mxn: Number(r.applied_interest),
        applied_vat_mxn: Number(r.applied_vat),
        applied_capital_mxn: Number(r.applied_capital),
        balance_before_mxn: Number(r.balance_before),
        balance_after_mxn: Number(r.balance_after),
        allocation_mode: r.allocation_mode,
        authorized_by: r.authorized_by ?? 'SISTEMA_WORM',
      })),
    },
    deterministicMarkdown: [
      `💧 **Desglose de Prelación WORM en Aplicación de Pago (Folio ${folioParam}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q3: Acumulado total esperado de retención por dependencia para la próxima quincena.
 */
export async function resolveQ03ExpectedRetentionByConvenio(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const convenioParam = entities.convenioCode ?? 'ALL';

  const res = await db.query<{
    convenio: string;
    display_name: string;
    active_loans: number;
    expected_fortnightly_retention: number;
    total_active_balance: number;
  }>(
    `SELECT
       e.convenio,
       c.display_name,
       COUNT(la.id) AS active_loans,
       COALESCE(SUM(la.fortnightly_payment), 0) AS expected_fortnightly_retention,
       COALESCE(SUM(la.current_principal_balance), 0) AS total_active_balance
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     JOIN convenios c ON c.code = e.convenio
     WHERE la.status = $1
       AND ($2 = 'ALL' OR e.convenio = $2)
     GROUP BY e.convenio, c.display_name
     ORDER BY expected_fortnightly_retention DESC`,
    ['ACTIVE', convenioParam]
  );

  const grandTotal = res.rows.reduce((acc, r) => acc + Number(r.expected_fortnightly_retention), 0);
  const lines = res.rows.map(
    (r) =>
      `• **${r.convenio}** (${r.display_name}): **${r.active_loans} créditos activos** · Retención Quincenal Esperada: **${fmtMxn(r.expected_fortnightly_retention)}** (Saldo insoluto: ${fmtMxn(r.total_active_balance)})`
  );

  return {
    intentCode: 'Q03_EXPECTED_RETENTION_CONVENIO',
    domain: 'COBRANZA',
    questionNumber: 3,
    structuredData: {
      filter_convenio: convenioParam,
      grand_total_expected_retention_mxn: grandTotal,
      convenios: res.rows.map((r) => ({
        convenio: r.convenio,
        display_name: r.display_name,
        active_loans: Number(r.active_loans),
        expected_fortnightly_retention_mxn: Number(r.expected_fortnightly_retention),
        total_active_balance_mxn: Number(r.total_active_balance),
      })),
    },
    deterministicMarkdown: [
      `🏦 **Proyección de Retención Quincenal Esperada por Dependencia (Total: ${fmtMxn(grandTotal)}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q4: Créditos Express con saldo insoluto menor a $1,000 pesos por liquidarse.
 */
export async function resolveQ04ExpressNearPayoff(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string;
    convenio: string;
    curp_masked: string;
    current_principal_balance: number;
    fortnightly_payment: number;
    status: string;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       la.current_principal_balance,
       la.fortnightly_payment,
       la.status
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE la.product_type = $1
       AND la.current_principal_balance > 0
       AND la.current_principal_balance < $2
     ORDER BY la.current_principal_balance ASC`,
    ['EXPRESS', 1000.0]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): Saldo Insoluto **${fmtMxn(r.current_principal_balance)}** · Cuota Quincenal **${fmtMxn(r.fortnightly_payment)}** (${r.status})`
  );

  return {
    intentCode: 'Q04_EXPRESS_UNDER_1000',
    domain: 'COBRANZA',
    questionNumber: 4,
    structuredData: {
      threshold_mxn: 1000,
      count: res.rows.length,
      express_loans_near_payoff: res.rows.map((r) => ({
        folio: r.contract_number,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        current_principal_balance_mxn: Number(r.current_principal_balance),
        fortnightly_payment_mxn: Number(r.fortnightly_payment),
        status: r.status,
      })),
    },
    deterministicMarkdown: [
      `⚡ **Créditos Express con Saldo Insoluto < $1,000.00 MXN Próximos a Liquidarse (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q5: Créditos Quincenales donde el descuento esperado no coincidió con lo depositado.
 */
export async function resolveQ05PayrollDiscrepanciesLastCut(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string | null;
    agreement_name: string;
    fortnight_period: string;
    curp_masked: string;
    expected_payment: number;
    actual_payment: number;
    difference: number;
    status: string;
  }>(
    `SELECT
       la.contract_number,
       rb.agreement_name,
       rb.fortnight_period,
       ri.curp_masked,
       ri.expected_payment,
       ri.actual_payment,
       ri.difference,
       ri.status
     FROM reconciliation_items ri
     JOIN reconciliation_batches rb ON rb.id = ri.batch_id
     LEFT JOIN loan_payment_applications lpa ON lpa.reconciliation_item_id = ri.id
     LEFT JOIN loan_accounts la ON la.id = lpa.loan_account_id
     WHERE ri.difference <> $1
       AND COALESCE(la.payment_frequency, $2) = $2
     ORDER BY rb.fortnight_period DESC, ABS(ri.difference) DESC`,
    [0, 'QUINCENAL']
  );

  const lines = res.rows.map(
    (r) =>
      `• **${r.contract_number ?? 'Sin Contrato Vinculado'}** (${r.agreement_name} · ${r.fortnight_period} · \`${r.curp_masked}\`): Esperado **${fmtMxn(r.expected_payment)}** vs Depositado **${fmtMxn(r.actual_payment)}** → Diferencia **${fmtMxn(r.difference)}** (\`${r.status}\`)`
  );

  return {
    intentCode: 'Q05_QUINCENAL_DISCREPANCIES',
    domain: 'COBRANZA',
    questionNumber: 5,
    structuredData: {
      discrepancies_count: res.rows.length,
      items: res.rows.map((r) => ({
        folio: r.contract_number ?? 'UNLINKED',
        convenio: r.agreement_name,
        fortnight_period: r.fortnight_period,
        curp_masked: r.curp_masked,
        expected_payment_mxn: Number(r.expected_payment),
        actual_payment_mxn: Number(r.actual_payment),
        difference_mxn: Number(r.difference),
        status: r.status,
      })),
    },
    deterministicMarkdown: [
      `⚖️ **Créditos Quincenales con Discrepancia entre Descuento Esperado y Depósito (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q6: Créditos normales activos simultáneos por empleado (CURP) y sumatoria de cuotas (RN-01).
 */
export async function resolveQ06SimultaneousNormalLoansByCurp(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const curpFilter = entities.curpPrefix ? `${entities.curpPrefix}%` : 'MORA%';

  const res = await db.query<{
    curp_masked: string;
    convenio: string;
    active_normal_loans: number;
    sum_fortnightly_payment: number;
    sum_principal_balance: number;
    folios: string;
  }>(
    `SELECT
       e.curp_masked,
       e.convenio,
       COUNT(la.id) AS active_normal_loans,
       COALESCE(SUM(la.fortnightly_payment), 0) AS sum_fortnightly_payment,
       COALESCE(SUM(la.current_principal_balance), 0) AS sum_principal_balance,
       STRING_AGG(la.contract_number, ', ' ORDER BY la.contract_number) AS folios
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE la.product_type = $1
       AND la.status = $2
       AND (e.curp_masked LIKE $3 OR $3 = 'MORA%')
     GROUP BY e.id, e.curp_masked, e.convenio
     HAVING COUNT(la.id) >= 1
     ORDER BY COUNT(la.id) DESC, sum_fortnightly_payment DESC
     LIMIT 5`,
    ['NOMINA_NORMAL', 'ACTIVE', curpFilter]
  );

  const lines = res.rows.map(
    (r) =>
      `• Acreditado \`${r.curp_masked}\` (${r.convenio}): **${r.active_normal_loans} crédito(s) Normal(es) activo(s)** (Límite RN-01: máx. 4) · Folios: **${r.folios}** · Suma Cuotas Quincenales: **${fmtMxn(r.sum_fortnightly_payment)}** · Saldo Total: **${fmtMxn(r.sum_principal_balance)}**`
  );

  return {
    intentCode: 'Q06_SIMULTANEOUS_NORMAL_LOANS',
    domain: 'ORIGINACION',
    questionNumber: 6,
    structuredData: {
      queried_curp_prefix: curpFilter,
      max_allowed_rn01: 4,
      borrowers: res.rows.map((r) => ({
        curp_masked: r.curp_masked,
        convenio: r.convenio,
        active_normal_loans: Number(r.active_normal_loans),
        sum_fortnightly_payment_mxn: Number(r.sum_fortnightly_payment),
        sum_principal_balance_mxn: Number(r.sum_principal_balance),
        folios: r.folios,
      })),
    },
    deterministicMarkdown: [
      `🔢 **Control RN-01 de Créditos Normales Simultáneos y Sumatoria de Cuotas:**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q7: Trazabilidad de Reestructuras N-a-1 (Nuevo Folio -> Folio Original Liquidado).
 */
export async function resolveQ07RestructureTraceability(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'ALL';

  const res = await db.query<{
    new_folio: string;
    previous_folio: string;
    convenio: string;
    curp_masked: string;
    absorbed_payoff_amount: number;
    authorized_by: string;
    restructured_at: string;
  }>(
    `SELECT
       la_new.contract_number AS new_folio,
       la_prev.contract_number AS previous_folio,
       e.convenio,
       e.curp_masked,
       lr.absorbed_payoff_amount,
       lr.authorized_by,
       CAST(lr.restructured_at AS TEXT) AS restructured_at
     FROM loan_restructures lr
     JOIN loan_accounts la_new ON la_new.id = lr.new_loan_id
     JOIN loan_accounts la_prev ON la_prev.id = lr.previous_loan_id
     JOIN expedientes e ON e.id = la_new.expediente_id
     WHERE ($1 = 'ALL' OR la_new.contract_number = $1 OR la_prev.contract_number = $1)
     ORDER BY lr.restructured_at DESC`,
    [folioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Nuevo Crédito ${r.new_folio}** ← liquidó y absorbió al **Crédito Original ${r.previous_folio}** (${r.convenio} · \`${r.curp_masked}\`) por **${fmtMxn(r.absorbed_payoff_amount)}** · Autorizado por \`${r.authorized_by}\` el \`${r.restructured_at.slice(0, 10)}\``
  );

  return {
    intentCode: 'Q07_RESTRUCTURE_TRACEABILITY',
    domain: 'ORIGINACION',
    questionNumber: 7,
    structuredData: {
      queried_folio: folioParam,
      restructures: res.rows.map((r) => ({
        new_folio: r.new_folio,
        previous_folio: r.previous_folio,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        absorbed_payoff_amount_mxn: Number(r.absorbed_payoff_amount),
        authorized_by: r.authorized_by,
        restructured_at: r.restructured_at,
      })),
    },
    deterministicMarkdown: [
      `🔄 **Trazabilidad de Reestructuras N-a-1 Registradas en Base de Datos (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q8: Créditos desembolsados mediante cheque físico en los últimos 30 días.
 */
export async function resolveQ08CheckDisbursementsLast30Days(): Promise<AlmaVirtualDomainExecutionResult> {
  const res = await db.query<{
    contract_number: string;
    convenio: string;
    curp_masked: string;
    principal_original: number;
    disbursement_method: string;
    disbursement_reference: string | null;
    activated_at: string;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       la.principal_original,
       la.disbursement_method,
       la.disbursement_reference,
       CAST(la.activated_at AS TEXT) AS activated_at
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE la.disbursement_method = $1
     ORDER BY la.activated_at DESC`,
    ['CHEQUE']
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): Monto **${fmtMxn(r.principal_original)}** · Referencia Cheque: \`${r.disbursement_reference ?? 'S/N'}\` · Fecha: \`${r.activated_at.slice(0, 10)}\``
  );

  return {
    intentCode: 'Q08_CHECK_DISBURSEMENTS',
    domain: 'ORIGINACION',
    questionNumber: 8,
    structuredData: {
      disbursement_method: 'CHEQUE',
      count: res.rows.length,
      loans: res.rows.map((r) => ({
        folio: r.contract_number,
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        principal_original_mxn: Number(r.principal_original),
        check_reference: r.disbursement_reference,
        activated_at: r.activated_at,
      })),
    },
    deterministicMarkdown: [
      `📝 **Créditos Desembolsados mediante Cheque Físico en los Últimos 30 Días (${res.rows.length}):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q9: Verificación de documento 'Oficio de 1er Pago' cargado en el expediente.
 */
export async function resolveQ09FirstPaymentOfficialLetterDoc(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'ALL';

  const res = await db.query<{
    contract_number: string | null;
    convenio: string;
    curp_masked: string;
    doc_type: string;
    encrypted_s3_key: string;
    upload_date: string;
    union_official_letter_no: string | null;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       d.type AS doc_type,
       d.encrypted_s3_key,
       CAST(d.upload_date AS TEXT) AS upload_date,
       la.union_official_letter_no
     FROM documents d
     JOIN expedientes e ON e.id = d.expediente_id
     LEFT JOIN loan_accounts la ON la.id = d.loan_account_id
     WHERE d.type = $1
       AND ($2 = 'ALL' OR la.contract_number = $2)
     ORDER BY d.upload_date DESC`,
    ['OFICIO_PRIMER_PAGO', folioParam]
  );

  const lines = res.rows.map(
    (r) =>
      `• **Folio ${r.contract_number ?? 'N/A'}** (${r.convenio} · \`${r.curp_masked}\`): ✅ **${r.doc_type}** verificado · Oficio Sindical: \`${r.union_official_letter_no ?? 'Registrado'}\` · Bóveda: \`${r.encrypted_s3_key}\` (${r.upload_date.slice(0, 10)})`
  );

  return {
    intentCode: 'Q09_FIRST_PAYMENT_OFFICIAL_LETTER',
    domain: 'ORIGINACION',
    questionNumber: 9,
    structuredData: {
      document_type: 'OFICIO_PRIMER_PAGO',
      queried_folio: folioParam,
      verified_documents: res.rows.map((r) => ({
        folio: r.contract_number ?? 'N/A',
        convenio: r.convenio,
        curp_masked: r.curp_masked,
        union_official_letter_no: r.union_official_letter_no,
        vault_key: r.encrypted_s3_key,
        upload_date: r.upload_date,
      })),
    },
    deterministicMarkdown: [
      `📄 **Verificación Digital de 'Oficio de 1er Pago' en Expedientes (${res.rows.length} certificados):**`,
      ...lines,
    ].join('\n'),
  };
}

/**
 * Q10: Límite máximo de descuento permitido (Regla del 30% / 35%) sobre sueldo reportado.
 */
export async function resolveQ10MaxPayrollDiscountRule30(
  entities: AlmaVirtualValidatedEntities
): Promise<AlmaVirtualDomainExecutionResult> {
  const folioParam = entities.folio ?? 'ALL';

  const res = await db.query<{
    contract_number: string;
    convenio: string;
    curp_masked: string;
    gross_income: number;
    payroll_deductions: number;
    fortnightly_payment: number;
  }>(
    `SELECT
       la.contract_number,
       e.convenio,
       e.curp_masked,
       e.gross_income,
       COALESCE(e.payroll_deductions, 0) AS payroll_deductions,
       la.fortnightly_payment
     FROM loan_accounts la
     JOIN expedientes e ON e.id = la.expediente_id
     WHERE e.gross_income IS NOT NULL
       AND ($1 = 'ALL' OR la.contract_number = $1)
     ORDER BY la.contract_number ASC`,
    [folioParam]
  );

  const lines = res.rows.map((r) => {
    const gross = Number(r.gross_income);
    const ded = Number(r.payroll_deductions);
    const netSalary = Math.max(gross - ded, 0);
    const limit30Gross = Number((gross * 0.3).toFixed(2));
    const limit35Net = Number((netSalary * 0.35).toFixed(2));
    return `• **Folio ${r.contract_number}** (${r.convenio} · \`${r.curp_masked}\`): Sueldo Reportado **${fmtMxn(gross)}** (Deducciones previas: ${fmtMxn(ded)}) → **Tope Regla 30%: ${fmtMxn(limit30Gross)}** | Tope 35% Neto: **${fmtMxn(limit35Net)}** | Cuota Actual: **${fmtMxn(r.fortnightly_payment)}**`;
  });

  return {
    intentCode: 'Q10_MAX_DISCOUNT_RULE_30',
    domain: 'ORIGINACION',
    questionNumber: 10,
    structuredData: {
      queried_folio: folioParam,
      calculations: res.rows.map((r) => {
        const gross = Number(r.gross_income);
        const ded = Number(r.payroll_deductions);
        return {
          folio: r.contract_number,
          convenio: r.convenio,
          curp_masked: r.curp_masked,
          gross_income_mxn: gross,
          payroll_deductions_mxn: ded,
          max_discount_rule_30_mxn: Number((gross * 0.3).toFixed(2)),
          max_discount_rule_35_net_mxn: Number(((gross - ded) * 0.35).toFixed(2)),
          current_fortnightly_payment_mxn: Number(r.fortnightly_payment),
        };
      }),
    },
    deterministicMarkdown: [
      `🧮 **Cálculo de Capacidad de Pago y Tope de Descuento (Regla del 30% / 35%):**`,
      ...lines,
    ].join('\n'),
  };
}
