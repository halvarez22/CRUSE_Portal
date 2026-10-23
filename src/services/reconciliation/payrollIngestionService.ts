/**
 * SERVICIO DE AUTOMATIZACIÓN DEL CORTE QUINCENAL DE NÓMINA E INGESTA DETERMINISTA
 * Expediente: CRUSE-APO-2026-026 (RN-05, RN-07, RN-08, RN-10, RN-13)
 *
 * - Directriz 1: Proyección de cartera por convenio mediante Single-Pass CTE indexada (`REPEATABLE READ READ ONLY`).
 * - Directriz 2: Distribución determinista Multi-Crédito 1:N (`activated_at ASC, id ASC`) con `Decimal.js`.
 * - Directriz 3: Cálculo inmediato de `sourceFileHash` SHA-256 y caché determinista entre Dry-Run y Sellado WORM.
 * - Directriz 4: Zero-PII absoluto en previsualizaciones, emisiones y errores.
 */

import Decimal from 'decimal.js';
import { db, TxHandle } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { parsePayrollCsvWithManifest } from './payrollFileParser';
import {
  PreparedPayrollRow,
  maskPayrollEmployeeName,
  validateAndPrepareRows,
} from './reconciliationValidator';
import {
  BatchProcessingResult,
  buildDeterministicReconciliationPlan,
  processReconciliationBatch,
} from './reconciliationEngine';
import { generateUnionDiscountEmissionCsv } from './reconciliationReports';
import {
  ConvenioCatalogItem,
  InsuranceEnrollmentStatus,
  PayrollEmissionRow,
  PayrollIngestionPreviewResult,
  ProjectedLoanOperationalStatus,
  SuspensionOrFreezeReason,
  UserRole,
} from '../../types';

export interface ProjectedConvenioLoanRow {
  loan_account_id: string;
  contract_number: string;
  expediente_id: string;
  convenio: string;
  blind_curp: string;
  curp_masked: string;
  full_name: string;
  product_type: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL';
  principal_original: string | number;
  fortnightly_payment: string | number;
  insurance_required: number;
  charges_life_insurance: number;
  union_official_letter_no: string | null;
  activated_at: string | Date;
  last_balance_after: string | number | null;
  last_arrears_insurance: string | number | null;
  last_arrears_interest: string | number | null;
  last_arrears_vat: string | number | null;
  last_credit_balance: string | number | null;
  total_applied_capital: string | number | null;
  active_suspension_reason: SuspensionOrFreezeReason | null;
  restructured_into_loan_id: string | null;
  insurance_status: InsuranceEnrollmentStatus | null;
  projected_status: ProjectedLoanOperationalStatus;
}

interface CachedPreviewSnapshot {
  sourceFileHash: string;
  agreementName: string;
  fortnightPeriod: string;
  preparedRows: PreparedPayrollRow[];
  createdAtMs: number;
}

// Directriz 3: Caché en memoria con TTL de 30 minutos para garantizar que el Sellado WORM
// reutilice exactamente las filas validadas durante el Dry-Run vinculadas al sourceFileHash.
const PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const validatedPreviewCache = new Map<string, CachedPreviewSnapshot>();

function makeCacheKey(agreementName: string, fortnightPeriod: string, sourceFileHash: string): string {
  return `${agreementName.trim().toUpperCase()}::${fortnightPeriod.trim().toUpperCase()}::${sourceFileHash}`;
}

function pruneExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of validatedPreviewCache.entries()) {
    if (now - entry.createdAtMs > PREVIEW_CACHE_TTL_MS) {
      validatedPreviewCache.delete(key);
    }
  }
}

/**
 * Directriz 1: Proyección en Una Sola Pasada (Single-Pass CTE) filtrada por índice
 * (`idx_expedientes_convenio_status`, `idx_loan_accounts_expediente_id`, `idx_lpa_loan_account_id`,
 * `idx_loan_suspensions_account_status`, `idx_loan_restructures_prev_loan`).
 * Cero Full Table Scans y Cero consultas N+1.
 */
export async function queryConvenioPortfolioCte(
  tx: TxHandle,
  agreementName: string
): Promise<ProjectedConvenioLoanRow[]> {
  const res = await tx.query<ProjectedConvenioLoanRow>(
    `WITH target_loans AS (
       SELECT
         la.id AS loan_account_id,
         la.contract_number,
         la.expediente_id,
         e.convenio,
         TRIM(e.blind_curp) AS blind_curp,
         e.curp_masked,
         e.full_name,
         la.product_type,
         la.principal_original,
         la.fortnightly_payment,
         la.insurance_required,
         COALESCE(c.charges_life_insurance, 1) AS charges_life_insurance,
         la.union_official_letter_no,
         la.activated_at,
         la.status
       FROM expedientes e
       INNER JOIN convenios c ON c.code = e.convenio
       INNER JOIN loan_accounts la ON la.expediente_id = e.id
       WHERE e.convenio = $1 AND la.status = 'ACTIVE'
     ),
     lpa_totals AS (
       SELECT lpa.loan_account_id, SUM(lpa.applied_capital) AS total_applied_capital
       FROM loan_payment_applications lpa
       INNER JOIN target_loans tl ON tl.loan_account_id = lpa.loan_account_id
       GROUP BY lpa.loan_account_id
     ),
     lpa_latest AS (
       SELECT l1.loan_account_id,
         l1.balance_after AS last_balance_after,
         l1.arrears_insurance_after AS last_arrears_insurance,
         l1.arrears_interest_after AS last_arrears_interest,
         l1.arrears_vat_after AS last_arrears_vat,
         l1.credit_balance_after AS last_credit_balance
       FROM loan_payment_applications l1
       INNER JOIN (
         SELECT lpa.loan_account_id, MAX(lpa.created_at) AS max_ts
         FROM loan_payment_applications lpa
         INNER JOIN target_loans tl ON tl.loan_account_id = lpa.loan_account_id
         GROUP BY lpa.loan_account_id
       ) l2 ON l1.loan_account_id = l2.loan_account_id AND l1.created_at = l2.max_ts
     ),
     active_suspensions AS (
       SELECT s1.loan_account_id, s1.reason AS active_suspension_reason
       FROM loan_suspension_periods s1
       INNER JOIN (
         SELECT lsp.loan_account_id, MAX(lsp.created_at) AS max_ts
         FROM loan_suspension_periods lsp
         INNER JOIN target_loans tl ON tl.loan_account_id = lsp.loan_account_id
         WHERE lsp.status = 'ACTIVE_SUSPENSION'
         GROUP BY lsp.loan_account_id
       ) s2 ON s1.loan_account_id = s2.loan_account_id AND s1.created_at = s2.max_ts
       WHERE s1.status = 'ACTIVE_SUSPENSION'
     ),
     restructured_loans AS (
       SELECT lr.previous_loan_id AS loan_account_id, MAX(lr.new_loan_id) AS restructured_into_loan_id
       FROM loan_restructures lr
       INNER JOIN target_loans tl ON tl.loan_account_id = lr.previous_loan_id
       GROUP BY lr.previous_loan_id
     ),
     latest_insurance AS (
       SELECT i1.loan_account_id, i1.status AS insurance_status
       FROM loan_insurance_enrollments i1
       INNER JOIN (
         SELECT lie.loan_account_id, MAX(lie.created_at) AS max_ts
         FROM loan_insurance_enrollments lie
         INNER JOIN target_loans tl ON tl.loan_account_id = lie.loan_account_id
         GROUP BY lie.loan_account_id
       ) i2 ON i1.loan_account_id = i2.loan_account_id AND i1.created_at = i2.max_ts
     )
     SELECT
       tl.loan_account_id,
       tl.contract_number,
       tl.expediente_id,
       tl.convenio,
       tl.blind_curp,
       tl.curp_masked,
       tl.full_name,
       tl.product_type,
       tl.principal_original,
       tl.fortnightly_payment,
       tl.insurance_required,
       tl.charges_life_insurance,
       tl.union_official_letter_no,
       tl.activated_at,
       ll.last_balance_after,
       ll.last_arrears_insurance,
       ll.last_arrears_interest,
       ll.last_arrears_vat,
       ll.last_credit_balance,
       lt.total_applied_capital,
       asusp.active_suspension_reason,
       rl.restructured_into_loan_id,
       li.insurance_status,
       CASE
         WHEN rl.restructured_into_loan_id IS NOT NULL THEN 'RESTRUCTURED'
         WHEN asusp.active_suspension_reason IN ('BAJA_LABORAL', 'COBRANZA_EXTRAJUDICIAL', 'DEMANDA_JUDICIAL', 'CONVENIO_EXTRAJUDICIAL') THEN 'FROZEN_EXTRAJUDICIAL'
         WHEN asusp.active_suspension_reason = 'LICENCIA_SIN_GOCE' THEN 'SUSPENDED_LEAVE'
         WHEN (tl.principal_original - COALESCE(lt.total_applied_capital, 0)) <= 0 THEN 'PAID_OFF'
         ELSE 'ACTIVE'
       END AS projected_status
     FROM target_loans tl
     LEFT JOIN lpa_totals lt ON lt.loan_account_id = tl.loan_account_id
     LEFT JOIN lpa_latest ll ON ll.loan_account_id = tl.loan_account_id
     LEFT JOIN active_suspensions asusp ON asusp.loan_account_id = tl.loan_account_id
     LEFT JOIN restructured_loans rl ON rl.loan_account_id = tl.loan_account_id
     LEFT JOIN latest_insurance li ON li.loan_account_id = tl.loan_account_id
     ORDER BY tl.activated_at ASC, tl.loan_account_id ASC`,
    [agreementName]
  );

  return res.rows;
}

interface ConvenioStatsDbRow {
  code: string;
  display_name: string;
  default_frequency: string;
  charges_life_insurance: number;
  sends_union_letter: number;
  active_loans_count: string | number;
  suspended_leave_count: string | number;
  expected_fortnightly_total: string | number;
}

/**
 * Directriz 1: Lista todos los convenios activos en PostgreSQL 16 calculando en una sola pasada CTE
 * sus créditos proyectados en estado ACTIVE y SUSPENDED_LEAVE.
 */
export async function listActiveConveniosWithStats(): Promise<ConvenioCatalogItem[]> {
  return db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    }

    const res = await tx.query<ConvenioStatsDbRow>(
      `WITH lpa_totals AS (
         SELECT loan_account_id, SUM(applied_capital) AS total_applied_capital
         FROM loan_payment_applications
         GROUP BY loan_account_id
       ),
       active_suspensions AS (
         SELECT s1.loan_account_id, s1.reason AS active_suspension_reason
         FROM loan_suspension_periods s1
         INNER JOIN (
           SELECT loan_account_id, MAX(created_at) AS max_ts
           FROM loan_suspension_periods
           WHERE status = 'ACTIVE_SUSPENSION'
           GROUP BY loan_account_id
         ) s2 ON s1.loan_account_id = s2.loan_account_id AND s1.created_at = s2.max_ts
         WHERE s1.status = 'ACTIVE_SUSPENSION'
       ),
       restructured_loans AS (
         SELECT DISTINCT previous_loan_id AS loan_account_id
         FROM loan_restructures
       ),
       projected_loans AS (
         SELECT
           e.convenio,
           la.fortnightly_payment,
           CASE
             WHEN rl.loan_account_id IS NOT NULL THEN 'RESTRUCTURED'
             WHEN asusp.active_suspension_reason IN ('BAJA_LABORAL', 'COBRANZA_EXTRAJUDICIAL', 'DEMANDA_JUDICIAL', 'CONVENIO_EXTRAJUDICIAL') THEN 'FROZEN_EXTRAJUDICIAL'
             WHEN asusp.active_suspension_reason = 'LICENCIA_SIN_GOCE' THEN 'SUSPENDED_LEAVE'
             WHEN (la.principal_original - COALESCE(lt.total_applied_capital, 0)) <= 0 THEN 'PAID_OFF'
             ELSE 'ACTIVE'
           END AS projected_status
         FROM expedientes e
         INNER JOIN loan_accounts la ON la.expediente_id = e.id
         LEFT JOIN lpa_totals lt ON lt.loan_account_id = la.id
         LEFT JOIN active_suspensions asusp ON asusp.loan_account_id = la.id
         LEFT JOIN restructured_loans rl ON rl.loan_account_id = la.id
         WHERE la.status = 'ACTIVE'
       )
       SELECT
         c.code,
         c.display_name,
         c.default_frequency,
         c.charges_life_insurance,
         c.sends_union_letter,
         COUNT(CASE WHEN pl.projected_status = 'ACTIVE' THEN 1 END) AS active_loans_count,
         COUNT(CASE WHEN pl.projected_status = 'SUSPENDED_LEAVE' THEN 1 END) AS suspended_leave_count,
         COALESCE(SUM(CASE WHEN pl.projected_status = 'ACTIVE' THEN pl.fortnightly_payment ELSE 0 END), 0) AS expected_fortnightly_total
       FROM convenios c
       LEFT JOIN projected_loans pl ON pl.convenio = c.code
       WHERE c.active = 1
       GROUP BY c.code, c.display_name, c.default_frequency, c.charges_life_insurance, c.sends_union_letter
       ORDER BY c.code ASC`
    );

    return res.rows.map((r) => ({
      code: r.code,
      displayName: r.display_name,
      defaultFrequency: r.default_frequency,
      chargesLifeInsurance: Number(r.charges_life_insurance) === 1,
      sendsUnionLetter: Number(r.sends_union_letter) === 1,
      activeLoansCount: Number(r.active_loans_count ?? 0),
      suspendedLeaveCount: Number(r.suspended_leave_count ?? 0),
      expectedFortnightlyTotal: new Decimal(r.expected_fortnightly_total ?? 0).toFixed(2),
    }));
  });
}

/**
 * Genera el Layout de Emisión Sindical (M. EMISION MENSUAL / Q. CREDITOS ACTIVOS)
 * para un convenio y periodo, marcando como "SUSPENSION" los créditos con licencia sin goce (RN-07).
 */
export async function generatePayrollDiscountEmissionLayout(input: {
  agreementName: string;
  fortnightPeriod: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  agreementName: string;
  fortnightPeriod: string;
  rows: PayrollEmissionRow[];
  csvContent: string;
}> {
  return db.transaction(async (tx) => {
    const portfolio = await queryConvenioPortfolioCte(tx, input.agreementName);

    const eligibleRows: PayrollEmissionRow[] = [];
    for (const loan of portfolio) {
      if (loan.projected_status !== 'ACTIVE' && loan.projected_status !== 'SUSPENDED_LEAVE') {
        continue;
      }
      const liveBal =
        loan.last_balance_after !== null && loan.last_balance_after !== undefined
          ? new Decimal(loan.last_balance_after)
          : Decimal.max(
              0,
              new Decimal(loan.principal_original).minus(
                new Decimal(loan.total_applied_capital ?? 0)
              )
            );

      const expectedOrSuspension =
        loan.projected_status === 'SUSPENDED_LEAVE'
          ? 'SUSPENSION'
          : new Decimal(loan.fortnightly_payment).toFixed(2);

      eligibleRows.push({
        loanAccountId: loan.loan_account_id,
        expedienteId: loan.expediente_id,
        contractNumber: loan.contract_number,
        unionOfficialLetterNo: loan.union_official_letter_no || `OF-${input.agreementName}-2026`,
        blindCurpPrefix: loan.blind_curp.slice(0, 12),
        curpMasked: loan.curp_masked,
        maskedName: maskPayrollEmployeeName(loan.full_name),
        productType: loan.product_type,
        projectedStatus: loan.projected_status,
        expectedDeductionOrStatus: expectedOrSuspension,
        liveBalance: liveBal.toFixed(2),
      });
    }

    const csvContent = generateUnionDiscountEmissionCsv(
      input.agreementName,
      input.fortnightPeriod,
      eligibleRows
    );

    await auditEventStore.appendInTx(tx, {
      action: 'PAYROLL_EMISSION_GENERATED',
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: 'payrollIngestionService',
      details: `Layout de emisión sindical generado para ${input.agreementName} (${input.fortnightPeriod}) con ${eligibleRows.length} partidas.`,
    });

    return {
      agreementName: input.agreementName,
      fortnightPeriod: input.fortnightPeriod,
      rows: eligibleRows,
      csvContent,
    };
  });
}

/**
 * Directriz 3 y Directriz 4: Previsualización Determinista (Dry-Run) de un archivo CSV/TXT de retenciones.
 * Calcula inmediatamente el sourceFileHash SHA-256, valida Zero-PII, ejecuta el planificador multi-crédito
 * en una sola pasada CTE y guarda el snapshot validado en caché vinculado al sourceFileHash.
 */
export async function previewPayrollFileIngestion(input: {
  agreementName: string;
  fortnightPeriod: string;
  csvContent: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<PayrollIngestionPreviewResult> {
  pruneExpiredCache();

  const convenioRes = await db.query<{ payroll_layout: string }>(
    'SELECT payroll_layout FROM convenios WHERE code = $1 AND active = 1',
    [input.agreementName]
  );
  const layoutJson = convenioRes.rows[0]?.payroll_layout ?? '{}';

  // Directriz 3: Hash SHA-256 calculado de inmediato sobre el contenido crudo antes del parsing
  const manifest = parsePayrollCsvWithManifest(input.csvContent, layoutJson);
  const preparedRows = await validateAndPrepareRows(manifest.rows);

  const cacheKey = makeCacheKey(input.agreementName, input.fortnightPeriod, manifest.sourceFileHash);
  validatedPreviewCache.set(cacheKey, {
    sourceFileHash: manifest.sourceFileHash,
    agreementName: input.agreementName,
    fortnightPeriod: input.fortnightPeriod,
    preparedRows,
    createdAtMs: Date.now(),
  });

  return db.transaction(async (tx) => {
    const portfolioLoans = await queryConvenioPortfolioCte(tx, input.agreementName);
    const plan = buildDeterministicReconciliationPlan(
      'PREVIEW_DRY_RUN',
      portfolioLoans,
      preparedRows
    );

    const warnings: string[] = [];
    const consolidatedWorkers = preparedRows.filter((r) => (r.consolidatedLinesCount ?? 1) > 1);
    if (consolidatedWorkers.length > 0) {
      warnings.push(
        `Se consolidaron determinísticamente ${consolidatedWorkers.length} trabajador(es) con múltiples descuentos en el archivo (Directriz 2).`
      );
    }
    if (plan.suspendedInPayroll > 0) {
      warnings.push(
        `${plan.suspendedInPayroll} crédito(s) en Licencia sin Goce (RN-07) identificados como SUSPENDED_IN_PAYROLL sin mora.`
      );
    }
    if (plan.missingInPayroll > 0) {
      warnings.push(
        `ALERTA: ${plan.missingInPayroll} crédito(s) activo(s) no aparecen en el archivo de retención (MISSING_IN_PAYROLL).`
      );
    }

    await auditEventStore.appendInTx(tx, {
      action: 'PAYROLL_FILE_PREVIEWED',
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: 'payrollIngestionService',
      details: `Dry-Run de nómina ${input.agreementName} (${input.fortnightPeriod}). SourceSHA256: ${manifest.sourceFileHash.slice(0, 16)} (${plan.planned.length} partidas).`,
    });

    const totalExpectedNum = plan.totalExpected.toNumber();
    const totalReceivedNum = plan.totalReceived.toNumber();

    return {
      sourceFileHash: manifest.sourceFileHash,
      agreementName: input.agreementName,
      fortnightPeriod: input.fortnightPeriod,
      summary: {
        totalRecords: plan.planned.length,
        matchExactCount: plan.matchExact,
        underpaymentCount: plan.underpayment,
        missingInPayrollCount: plan.missingInPayroll,
        overpaymentCount: plan.overpayment,
        suspendedInPayrollCount: plan.suspendedInPayroll,
        notInPortfolioCount: plan.notInPortfolio,
        totalExpected: totalExpectedNum,
        totalReceived: totalReceivedNum,
        netDifference: plan.totalReceived.minus(plan.totalExpected).toNumber(),
      },
      items: plan.planned.map((p) => ({
        ...p.item,
        blindCurp: p.item.blindCurp.slice(0, 12),
      })),
      warnings,
    };
  });
}

/**
 * Directriz 3: Ejecuta y sella en WORM un lote de conciliación reutilizando el snapshot validado
 * del Dry-Run (identificado por sourceFileHash) o validando la integridad exacta del archivo.
 */
export async function executePayrollFileIngestion(input: {
  agreementName: string;
  fortnightPeriod: string;
  csvContent?: string;
  expectedSourceFileHash?: string;
  actorEmail: string;
  actorRole: UserRole;
}): Promise<BatchProcessingResult> {
  pruneExpiredCache();

  let preparedRows: PreparedPayrollRow[] | undefined;
  let resolvedSourceHash = input.expectedSourceFileHash?.trim() ?? '';

  if (resolvedSourceHash) {
    const cacheKey = makeCacheKey(input.agreementName, input.fortnightPeriod, resolvedSourceHash);
    const cached = validatedPreviewCache.get(cacheKey);
    if (cached) {
      preparedRows = cached.preparedRows;
    }
  }

  if (!preparedRows) {
    if (!input.csvContent) {
      throw new Error(
        'No se encontró previsualización en caché para el sourceFileHash indicado y no se adjuntó csvContent.'
      );
    }
    const convenioRes = await db.query<{ payroll_layout: string }>(
      'SELECT payroll_layout FROM convenios WHERE code = $1 AND active = 1',
      [input.agreementName]
    );
    const layoutJson = convenioRes.rows[0]?.payroll_layout ?? '{}';
    const manifest = parsePayrollCsvWithManifest(input.csvContent, layoutJson);

    if (resolvedSourceHash && manifest.sourceFileHash !== resolvedSourceHash) {
      throw new Error(
        `VIOLACIÓN DE INTEGRIDAD (Directriz 3): El hash SHA-256 del archivo (${manifest.sourceFileHash}) no coincide con el hash previsualizado (${resolvedSourceHash}).`
      );
    }
    resolvedSourceHash = manifest.sourceFileHash;
    preparedRows = await validateAndPrepareRows(manifest.rows);
  }

  const result = await processReconciliationBatch(
    input.agreementName,
    input.fortnightPeriod,
    input.actorEmail,
    input.actorRole,
    preparedRows,
    resolvedSourceHash
  );

  const cacheKey = makeCacheKey(input.agreementName, input.fortnightPeriod, resolvedSourceHash);
  validatedPreviewCache.delete(cacheKey);

  return result;
}
