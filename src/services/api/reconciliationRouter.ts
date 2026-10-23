/**
 * ENRUTADOR DE CONCILIACIÓN QUINCENAL AUTOMATIZADA, EMISIÓN SINDICAL, INGESTA DRY-RUN Y DESGLOSE MANUAL
 *
 * @implements CRUSE-APO-2026-026 (Endpoints /convenios, /emission-layout, /ingest-preview, /process con RBAC + 2FA)
 * @implements RN-13 (Endpoint POST /api/reconciliation/manual-override con RBAC + 2FA)
 * @implements Guardrail Forense 1 (CRUSE-APO-2026-023: Sintaxis posicional nativa de PostgreSQL $1, $2... y tipado estricto)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/connectionPool';
import { extractClientIp } from '../audit/auditMask';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { processReconciliationBatch, BatchProcessingResult } from '../reconciliation/reconciliationEngine';
import {
  executePayrollFileIngestion,
  generatePayrollDiscountEmissionLayout,
  listActiveConveniosWithStats,
  previewPayrollFileIngestion,
} from '../reconciliation/payrollIngestionService';
import { validateAndPrepareRows } from '../reconciliation/reconciliationValidator';
import { RawPayrollRow } from '../reconciliation/payrollFileParser';
import { applyLoanPayment } from '../reconciliation/loanPaymentApplicationService';
import {
  generateSignedReconciliationActa,
  generateSifLogicSystemsCsv,
} from '../reconciliation/reconciliationReports';
import {
  PayrollRecordInput,
  ReconciliationBatch,
  ReconciliationItem,
  ReconciliationItemStatus,
} from '../../types';
import {
  SAMPLE_STSGECH_PAYROLL,
  SAMPLE_SUPREMO_TRIBUNAL_PAYROLL,
} from '../reconciliation/samplePayrollData';

export const reconciliationRouter = Router();

interface ReconciliationBatchDbRow {
  id: string;
  created_at: string;
  agreement_name: string;
  fortnight_period: string;
  total_records: number;
  total_amount_expected: number;
  total_amount_received: number;
  status: string;
  officer_email: string;
  batch_manifest_hash: string;
  notes: string | null;
}

interface ReconciliationItemDbRow {
  id: string;
  batch_id: string;
  expediente_id: string | null;
  blind_curp: string;
  curp_masked: string;
  employee_name: string;
  expected_payment: number;
  actual_payment: number;
  difference: number;
  status: string;
  audit_notes: string | null;
}

function mapItemRow(row: ReconciliationItemDbRow): ReconciliationItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    expedienteId: row.expediente_id ?? undefined,
    blindCurp: String(row.blind_curp ?? '').slice(0, 12),
    curpMasked: row.curp_masked,
    employeeName: row.employee_name,
    expectedPayment: Number(row.expected_payment),
    actualPayment: Number(row.actual_payment),
    difference: Number(row.difference),
    status: row.status as ReconciliationItemStatus,
    auditNotes: row.audit_notes ?? '',
  };
}

reconciliationRouter.get(
  '/sample-data',
  requireAuth('reconciliation:sample-data'),
  (_req: Request, res: Response) => {
    res.json({
      STSGECH: SAMPLE_STSGECH_PAYROLL,
      SUPREMO_TRIBUNAL: SAMPLE_SUPREMO_TRIBUNAL_PAYROLL,
    });
  }
);

reconciliationRouter.get(
  '/convenios',
  requireAuth('reconciliation:read'),
  async (_req: Request, res: Response) => {
    try {
      const convenios = await listActiveConveniosWithStats();
      return res.json({ ok: true, convenios });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'Error al consultar catálogo de convenios activos',
        details: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }
);

reconciliationRouter.get(
  '/emission-layout',
  requireAuth('reconciliation:read'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const agreementName = String(req.query.agreementName ?? 'STSGECH').trim();
      const fortnightPeriod = String(req.query.fortnightPeriod ?? '2026-10-1Q').trim();

      if (!agreementName || !fortnightPeriod) {
        return res.status(400).json({ error: 'Se requiere agreementName y fortnightPeriod.' });
      }

      const emission = await generatePayrollDiscountEmissionLayout({
        agreementName,
        fortnightPeriod,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
      });

      return res.json({ ok: true, ...emission });
    } catch (err: unknown) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Error generando layout de emisión sindical',
      });
    }
  }
);

reconciliationRouter.post(
  '/ingest-preview',
  requireAuth('reconciliation:process'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const { agreementName, fortnightPeriod, csvContent } = req.body;

      if (!agreementName || !fortnightPeriod || typeof csvContent !== 'string' || !csvContent.trim()) {
        return res.status(400).json({
          error: 'Se requiere agreementName, fortnightPeriod y csvContent no vacío para la previsualización Dry-Run.',
        });
      }

      const preview = await previewPayrollFileIngestion({
        agreementName: String(agreementName).trim(),
        fortnightPeriod: String(fortnightPeriod).trim(),
        csvContent,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
      });

      return res.json({ ok: true, preview });
    } catch (err: unknown) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Error en previsualización de archivo de nómina',
      });
    }
  }
);

reconciliationRouter.post(
  '/process',
  requireAuth('reconciliation:process'),
  async (req: Request, res: Response) => {
    try {
      const { agreementName, fortnightPeriod, csvContent, expectedSourceFileHash, records } = req.body;
      const { user } = getAuth(req);

      if (!agreementName || !fortnightPeriod) {
        return res.status(400).json({ error: 'Se requiere convenio (agreementName) y periodo (fortnightPeriod).' });
      }

      let result: BatchProcessingResult;

      if (typeof csvContent === 'string' && csvContent.trim().length > 0) {
        result = await executePayrollFileIngestion({
          agreementName: String(agreementName).trim(),
          fortnightPeriod: String(fortnightPeriod).trim(),
          csvContent,
          expectedSourceFileHash:
            typeof expectedSourceFileHash === 'string' ? expectedSourceFileHash : undefined,
          actorEmail: user.email,
          actorRole: user.role,
        });
      } else if (typeof expectedSourceFileHash === 'string' && expectedSourceFileHash.trim().length > 0) {
        result = await executePayrollFileIngestion({
          agreementName: String(agreementName).trim(),
          fortnightPeriod: String(fortnightPeriod).trim(),
          expectedSourceFileHash: expectedSourceFileHash.trim(),
          actorEmail: user.email,
          actorRole: user.role,
        });
      } else if (Array.isArray(records) && records.length > 0) {
        const rawRows: RawPayrollRow[] = (records as PayrollRecordInput[]).map((r, idx) => ({
          curp: String(r.curp ?? ''),
          name: String(r.employeeName ?? 'TRABAJADOR'),
          amount: String(r.actualPayment ?? 0),
          originalLine: idx + 1,
          contractNumber: r.contractNumber ? String(r.contractNumber) : undefined,
        }));
        const prepared = await validateAndPrepareRows(rawRows);
        const rawPayloadHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(records), 'utf8')
          .digest('hex');

        result = await processReconciliationBatch(
          String(agreementName).trim(),
          String(fortnightPeriod).trim(),
          user.email,
          user.role,
          prepared,
          rawPayloadHash
        );
      } else {
        return res.status(400).json({
          error: 'Se requiere csvContent, expectedSourceFileHash o arreglo records para procesar el lote.',
        });
      }

      const batchQuery = await db.query<ReconciliationBatchDbRow>(
        `SELECT * FROM reconciliation_batches WHERE id = $1`,
        [result.batchId]
      );
      const itemsQuery = await db.query<ReconciliationItemDbRow>(
        `SELECT * FROM reconciliation_items WHERE batch_id = $1`,
        [result.batchId]
      );

      const batchRow = batchQuery.rows[0];
      const rawStatus = batchRow?.status ?? 'procesado';
      const validBatchStatus: ReconciliationBatch['status'] =
        rawStatus === 'cerrado_con_discrepancias' || rawStatus === 'conciliado_total'
          ? rawStatus
          : 'procesado';

      const batch: ReconciliationBatch = {
        id: batchRow?.id ?? result.batchId,
        createdAt: batchRow?.created_at ?? new Date().toISOString(),
        agreementName: batchRow?.agreement_name ?? String(agreementName),
        fortnightPeriod: batchRow?.fortnight_period ?? String(fortnightPeriod),
        totalRecords: Number(batchRow?.total_records ?? result.totalProcessed),
        totalAmountExpected: Number(batchRow?.total_amount_expected ?? result.totalExpected),
        totalAmountReceived: Number(batchRow?.total_amount_received ?? result.totalReceived),
        status: validBatchStatus,
        officerEmail: batchRow?.officer_email ?? user.email,
        batchManifestHash: batchRow?.batch_manifest_hash ?? result.batchManifestHash,
        sourceFileHash: result.sourceFileHash,
        notes: batchRow?.notes ?? undefined,
      };

      const items = itemsQuery.rows.map(mapItemRow);
      const summary = {
        totalRecords: result.totalProcessed,
        matchExactCount: result.matchExact,
        underpaymentCount: result.underpayment,
        missingInPayrollCount: result.missingInPayroll,
        overpaymentCount: result.overpayment,
        suspendedInPayrollCount: result.suspendedInPayroll,
        notInPortfolioCount: result.notInPortfolio,
        totalExpected: batch.totalAmountExpected,
        totalReceived: batch.totalAmountReceived,
        netDifference: batch.totalAmountReceived - batch.totalAmountExpected,
      };

      return res.json({
        ok: true,
        batch,
        items,
        summary,
        sourceFileHash: result.sourceFileHash,
        signedActaText: generateSignedReconciliationActa(batch, summary, result.sourceFileHash),
        sifCsvText: generateSifLogicSystemsCsv(batch, items),
      });
    } catch (err: unknown) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Error interno en motor de conciliación quincenal',
      });
    }
  }
);

reconciliationRouter.post(
  '/manual-override',
  requireAuth('reconciliation:manual-override'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const {
        loanAccountId: rawLaId,
        expedienteId,
        batchId,
        reconciliationItemId,
        fortnightPeriod,
        amountReceived,
        manualBreakdown,
        overrideReason,
      } = req.body;

      let resolvedLoanAccountId = typeof rawLaId === 'string' ? rawLaId.trim() : '';
      if (!resolvedLoanAccountId && typeof expedienteId === 'string' && expedienteId.trim()) {
        const laRes = await db.query<{ id: string }>(
          `SELECT id FROM loan_accounts WHERE expediente_id = $1 ORDER BY activated_at DESC LIMIT 1`,
          [expedienteId.trim()]
        );
        resolvedLoanAccountId = laRes.rows[0]?.id ?? '';
      }

      if (
        !resolvedLoanAccountId ||
        !batchId ||
        !reconciliationItemId ||
        !fortnightPeriod ||
        !manualBreakdown
      ) {
        return res
          .status(400)
          .json({ error: 'Parámetros incompletos para aplicar MANUAL_OVERRIDE (RN-13).' });
      }

      const existingApp = await db.query<{ id: string }>(
        `SELECT id FROM loan_payment_applications WHERE reconciliation_item_id = $1 OR (loan_account_id = $2 AND fortnight_period = $3)`,
        [String(reconciliationItemId), resolvedLoanAccountId, String(fortnightPeriod)]
      );

      let targetItemId = String(reconciliationItemId);
      let targetPeriod = String(fortnightPeriod);

      if (existingApp.rowCount > 0) {
        const origItem = await db.query<ReconciliationItemDbRow>(
          `SELECT * FROM reconciliation_items WHERE id = $1`,
          [String(reconciliationItemId)]
        );
        const baseRow = origItem.rows[0];
        targetItemId = `ri_man_${crypto.randomBytes(5).toString('hex')}`;
        targetPeriod = `${String(fortnightPeriod)}-M${existingApp.rowCount}`;
        if (baseRow) {
          await db.execute(
            `INSERT INTO reconciliation_items (id, batch_id, expediente_id, blind_curp, curp_masked, employee_name, expected_payment, actual_payment, difference, status, audit_notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              targetItemId,
              baseRow.batch_id,
              baseRow.expediente_id,
              baseRow.blind_curp,
              baseRow.curp_masked,
              baseRow.employee_name,
              baseRow.expected_payment,
              Number(amountReceived),
              Number(amountReceived) - Number(baseRow.expected_payment),
              'DISCREPANCY_UNDERPAYMENT',
              `Ajuste MANUAL_OVERRIDE (${targetPeriod}) por ${user.email}`,
            ]
          );
        }
      }

      const record = await applyLoanPayment({
        loanAccountId: resolvedLoanAccountId,
        batchId: String(batchId),
        reconciliationItemId: targetItemId,
        fortnightPeriod: targetPeriod,
        amountReceived: Number(amountReceived),
        allocationMode: 'MANUAL_OVERRIDE',
        manualBreakdown: {
          appliedInsurance: Number(manualBreakdown.appliedInsurance ?? 0),
          appliedInterest: Number(manualBreakdown.appliedInterest ?? 0),
          appliedVat: Number(manualBreakdown.appliedVat ?? 0),
          appliedCapital: Number(manualBreakdown.appliedCapital ?? 0),
        },
        overrideReason: String(overrideReason ?? ''),
        authorizedBy: user.email,
        actorRole: user.role,
        sourceIp,
      });

      return res.json({ ok: true, application: record });
    } catch (err: unknown) {
      return res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Error aplicando desglose manual' });
    }
  }
);

reconciliationRouter.get(
  '/batches',
  requireAuth('reconciliation:read'),
  async (_req: Request, res: Response) => {
    try {
      const result = await db.query<ReconciliationBatchDbRow>(
        `SELECT * FROM reconciliation_batches ORDER BY created_at DESC LIMIT 50;`
      );
      const batches = result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        agreementName: row.agreement_name,
        fortnightPeriod: row.fortnight_period,
        totalRecords: Number(row.total_records),
        totalAmountExpected: Number(row.total_amount_expected),
        totalAmountReceived: Number(row.total_amount_received),
        status: row.status as 'procesado' | 'cerrado_con_discrepancias' | 'conciliado_total',
        officerEmail: row.officer_email,
        batchManifestHash: row.batch_manifest_hash,
        notes: row.notes ?? undefined,
      }));
      res.json({ batches });
    } catch {
      res.status(500).json({ error: 'Fallo al consultar lotes' });
    }
  }
);

reconciliationRouter.get(
  '/batches/:id',
  requireAuth('reconciliation:read'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const batchQuery = await db.query<ReconciliationBatchDbRow>(
        `SELECT * FROM reconciliation_batches WHERE id = $1;`,
        [id]
      );
      if (batchQuery.rowCount === 0) return res.status(404).json({ error: 'Lote no encontrado' });
      const itemsQuery = await db.query<ReconciliationItemDbRow>(
        `SELECT * FROM reconciliation_items WHERE batch_id = $1 ORDER BY employee_name ASC;`,
        [id]
      );
      return res.json({ batch: batchQuery.rows[0], items: itemsQuery.rows.map(mapItemRow) });
    } catch {
      return res.status(500).json({ error: 'Fallo al consultar detalle' });
    }
  }
);
