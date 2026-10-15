/**
 * ENRUTADOR DE CONCILIACIÓN QUINCENAL AUTOMATIZADA — SERVIDOR
 * Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 *
 * Cumplimiento:
 * - Regla 3: Modular < 450 líneas con responsabilidad única.
 * - Regla 5 (SSD): Integración sincrónica con WORM y persistencia relacional.
 * - Expediente: CRUSE-APO-2026-004
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { processReconciliationBatch } from '../reconciliation/reconciliationEngine';
import {
  generateSignedReconciliationActa,
  generateSifLogicSystemsCsv,
} from '../reconciliation/reconciliationReports';
import {
  ReconciliationBatch,
  ReconciliationItem,
  ReconciliationItemStatus,
} from '../../types';
import {
  SAMPLE_STSGECH_PAYROLL,
  SAMPLE_SUPREMO_TRIBUNAL_PAYROLL,
} from '../reconciliation/samplePayrollData';

export const reconciliationRouter = Router();

/**
 * Endpoint: Obtener nóminas de prueba institucionales pre-cargadas
 */
reconciliationRouter.get('/sample-data', requireAuth('reconciliation:sample-data'), (_req: Request, res: Response) => {
  res.json({
    STSGECH: SAMPLE_STSGECH_PAYROLL,
    SUPREMO_TRIBUNAL: SAMPLE_SUPREMO_TRIBUNAL_PAYROLL,
  });
});

/**
 * Endpoint: Procesar Lote de Conciliación Quincenal
 */
reconciliationRouter.post('/process', requireAuth('reconciliation:process'), async (req: Request, res: Response) => {
  try {
    // CRUSE-APO-2026-005 A.3: officerEmail del cuerpo se ignora; el oficial es el de la sesión validada.
    const { agreementName, fortnightPeriod, records } = req.body;

    if (!agreementName || !fortnightPeriod || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        error: 'Parámetros incompletos. Se requiere convenio, periodo y lista de registros de nómina.',
      });
    }

    const { user } = getAuth(req);
    const email = user.email;
    const ip = extractClientIp(req.headers);
    const ua = req.headers['user-agent'];
    const sourceSummary = buildSourceSummary(ip, ua);
    void sourceSummary;

    // 1. Ejecutar el motor de cruce dinámico (con decimal.js)
    const result = await processReconciliationBatch(
      agreementName,
      fortnightPeriod,
      email,
      user.role,
      records
    );

    const batchQuery = await db.query<Record<string, unknown>>(`SELECT * FROM reconciliation_batches WHERE id = ?`, [result.batchId]);
    const itemsQuery = await db.query<Record<string, unknown>>(`SELECT * FROM reconciliation_items WHERE batch_id = ?`, [result.batchId]);
    
    const batchRow = batchQuery.rows[0] ?? {};
    const rawBatchStatus = String(batchRow.status ?? 'procesado');
    const validBatchStatus: ReconciliationBatch['status'] =
      rawBatchStatus === 'cerrado_con_discrepancias' || rawBatchStatus === 'conciliado_total'
        ? rawBatchStatus
        : 'procesado';

    const batch: ReconciliationBatch = {
      id: String(batchRow.id ?? result.batchId),
      createdAt: String(batchRow.created_at ?? new Date().toISOString()),
      agreementName: String(batchRow.agreement_name ?? agreementName),
      fortnightPeriod: String(batchRow.fortnight_period ?? fortnightPeriod),
      totalRecords: Number(batchRow.total_records ?? 0),
      totalAmountExpected: Number(batchRow.total_amount_expected ?? 0),
      totalAmountReceived: Number(batchRow.total_amount_received ?? 0),
      status: validBatchStatus,
      officerEmail: String(batchRow.officer_email ?? email),
      batchManifestHash: String(batchRow.batch_manifest_hash ?? ''),
      notes: batchRow.notes ? String(batchRow.notes) : undefined,
    };
    
    const items: ReconciliationItem[] = itemsQuery.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      batchId: String(row.batch_id ?? result.batchId),
      expedienteId: row.expediente_id ? String(row.expediente_id) : undefined,
      blindCurp: String(row.blind_curp ?? ''),
      curpMasked: String(row.curp_masked ?? ''),
      employeeName: String(row.employee_name ?? ''),
      expectedPayment: Number(row.expected_payment ?? 0),
      actualPayment: Number(row.actual_payment ?? 0),
      difference: Number(row.difference ?? 0),
      status: String(row.status ?? 'MATCH_EXACT') as ReconciliationItemStatus,
      auditNotes: String(row.audit_notes ?? ''),
    }));

    const summary = {
      totalRecords: result.totalProcessed,
      matchExactCount: result.matchExact,
      underpaymentCount: result.underpayment,
      missingInPayrollCount: result.missingInPayroll,
      overpaymentCount: result.overpayment,
      totalExpected: batch.totalAmountExpected,
      totalReceived: batch.totalAmountReceived,
      netDifference: batch.totalAmountReceived - batch.totalAmountExpected,
    };

    // 5. Generar acta firmada y layout CSV listos para descarga
    const signedActaText = generateSignedReconciliationActa(batch, summary);
    const sifCsvText = generateSifLogicSystemsCsv(batch, items);

    return res.json({
      ok: true,
      batch,
      items,
      summary,
      signedActaText,
      sifCsvText,
    });
  } catch (err: unknown) {
    console.error('Error procesando conciliación quincenal:', err);
    return res.status(500).json({
      error: 'Error interno en motor de conciliación quincenal',
      details: err instanceof Error ? err.message : 'Error desconocido',
    });
  }
});

/**
 * Endpoint: Listar Historial de Lotes de Conciliación
 */
reconciliationRouter.get('/batches', requireAuth('reconciliation:read'), async (_req: Request, res: Response) => {
  try {
    const result = await db.query<{
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
    }>(
      `SELECT id, created_at, agreement_name, fortnight_period, total_records,
              total_amount_expected, total_amount_received, status, officer_email,
              batch_manifest_hash, notes
       FROM reconciliation_batches
       ORDER BY created_at DESC
       LIMIT 50;`
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
  } catch (err: unknown) {
    console.error('Error listando lotes de conciliación:', err);
    res.status(500).json({ error: 'Fallo al consultar lotes' });
  }
});

/**
 * Endpoint: Consultar Detalle de Lote con Partidas
 */
reconciliationRouter.get('/batches/:id', requireAuth('reconciliation:read'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const batchQuery = await db.query<any>(
      `SELECT * FROM reconciliation_batches WHERE id = ?;`,
      [id]
    );

    if (batchQuery.rowCount === 0) {
      return res.status(404).json({ error: 'Lote no encontrado' });
    }

    const itemsQuery = await db.query<any>(
      `SELECT * FROM reconciliation_items WHERE batch_id = ? ORDER BY employee_name ASC;`,
      [id]
    );

    const batch = batchQuery.rows[0];
    const items = itemsQuery.rows.map((row: any) => ({
      id: row.id,
      batchId: row.batch_id,
      expedienteId: row.expediente_id,
      blindCurp: row.blind_curp,
      curpMasked: row.curp_masked,
      employeeName: row.employee_name,
      expectedPayment: Number(row.expected_payment),
      actualPayment: Number(row.actual_payment),
      difference: Number(row.difference),
      status: row.status,
      auditNotes: row.audit_notes,
    }));

    res.json({ batch, items });
  } catch (err: unknown) {
    console.error('Error consultando detalle de lote:', err);
    res.status(500).json({ error: 'Fallo al consultar detalle' });
  }
});
