/**
 * ENRUTADOR DE MIGRACIÓN HISTÓRICA EXCEL -> NUBE Y ROLLBACK CRIPTOGRÁFICO (FASE 3.3)
 *
 * Protegido por RBAC (`migration:read`, `migration:execute`, `migration:rollback`).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import {
  executeInstantBatchRollback,
  getCloudMigrationOverview,
  ingestAndReconcileLegacyExcelBatch,
  MigrationRollbackBlockedError,
  SAMPLE_LEGACY_EXCEL_ROWS,
  toggleCloudMigrationCutoverMode,
} from '../migration/cloudMigrationService';
import { auditEventStore } from '../audit/auditEventStore';
import { buildSourceSummary, extractClientIp } from '../audit/auditMask';
import { CloudMigrationCutoverMode, LegacyExcelRawRowInput } from '../../types';

export const cloudMigrationRouter = Router();

// GET /api/cloud-migration/overview
cloudMigrationRouter.get('/overview', requireAuth('migration:read'), async (_req: Request, res: Response) => {
  try {
    const overview = await getCloudMigrationOverview();
    return res.json(overview);
  } catch (err) {
    console.error('[CloudMigration overview] Error:', err);
    return res.status(500).json({ error: 'Error al consultar el estado de migración en la nube.' });
  }
});

// POST /api/cloud-migration/ingest
cloudMigrationRouter.post('/ingest', requireAuth('migration:execute'), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const ip = extractClientIp(req.headers);
    const ua = String(req.headers['user-agent'] || '');

    const useSample = req.body?.useSample !== false;
    const rows: readonly LegacyExcelRawRowInput[] =
      !useSample && Array.isArray(req.body?.rows) ? req.body.rows : SAMPLE_LEGACY_EXCEL_ROWS;

    const declaredExcelTotalPrincipalMxn = String(req.body?.declaredExcelTotalPrincipalMxn ?? '70400.50');
    const declaredExcelTotalLiveBalanceMxn = String(req.body?.declaredExcelTotalLiveBalanceMxn ?? '55000.50');
    const sourceFilename = String(req.body?.sourceFilename ?? 'Sabana_Historica_Cruse_2024_2026.xlsx');

    const result = await ingestAndReconcileLegacyExcelBatch({
      sourceFilename,
      rows,
      declaredExcelTotalPrincipalMxn,
      declaredExcelTotalLiveBalanceMxn,
      actorEmail: auth.user.email,
    });

    await auditEventStore.append({
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'CLOUD_MIGRATION_BATCH_EXECUTED',
      outcome: result.ok ? 'success' : 'failure',
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, ua),
      details: result.ok
        ? `Lote ${result.batch.batchCode} verificado centavo a centavo ($0.00 varianza, ${result.batch.totalRows} contratos, ${result.batch.idempotentUpserts} upserts idempotentes).`
        : `Lote ${result.batch.batchCode} abortado por discrepancia contable ($${result.batch.discrepancyMxn} MXN).`,
    });

    if (!result.ok) {
      return res.status(422).json({ error: result.error, batch: result.batch });
    }

    const overview = await getCloudMigrationOverview();
    return res.json({ ok: true, batch: result.batch, overview });
  } catch (err) {
    console.error('[CloudMigration ingest] Error:', err);
    return res.status(500).json({ error: 'Error interno al procesar la sábana histórica.' });
  }
});

// POST /api/cloud-migration/rollback
cloudMigrationRouter.post('/rollback', requireAuth('migration:rollback'), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const ip = extractClientIp(req.headers);
    const ua = String(req.headers['user-agent'] || '');
    const batchId = String(req.body?.batchId || '').trim();

    if (!batchId) {
      return res.status(400).json({ error: 'Debes indicar el ID del lote a revertir.' });
    }

    const rollbackResult = await executeInstantBatchRollback({
      batchId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, ua),
    });

    await auditEventStore.append({
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'CLOUD_MIGRATION_ROLLBACK_VERIFIED',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, ua),
      details: `Rollback ejecutado sobre lote ${batchId}. Paridad SHA-256 Pre/Post: ${rollbackResult.cryptographicParityVerified ? 'VERIFICADA AL 100%' : 'DIFERENTE'} (${rollbackResult.postRollbackSnapshotSha256.slice(0, 16)}).`,
    });

    const overview = await getCloudMigrationOverview();
    return res.json({
      ...rollbackResult,
      overview,
    });
  } catch (err) {
    if (err instanceof MigrationRollbackBlockedError) {
      return res.status(409).json({
        error: err.message,
        blockingReason: err.blockingReason,
        dependentTransactions: err.dependentTransactions,
      });
    }
    console.error('[CloudMigration rollback] Error:', err);
    return res.status(500).json({ error: 'Error interno al ejecutar el Plan de Regreso (Rollback).' });
  }
});

// POST /api/cloud-migration/cutover-mode
cloudMigrationRouter.post('/cutover-mode', requireAuth('migration:execute'), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const targetMode: CloudMigrationCutoverMode =
      req.body?.targetMode === 'PRODUCTION_CUTOVER_ACTIVE' ? 'PRODUCTION_CUTOVER_ACTIVE' : 'STAGING_PARALLEL';

    await toggleCloudMigrationCutoverMode({
      targetMode,
      actorEmail: auth.user.email,
    });

    const overview = await getCloudMigrationOverview();
    return res.json({ ok: true, cutoverMode: targetMode, overview });
  } catch (err) {
    console.error('[CloudMigration cutover-mode] Error:', err);
    return res.status(500).json({ error: 'Error al cambiar el modo de corte de migración.' });
  }
});
