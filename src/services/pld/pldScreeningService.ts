/**
 * MOTOR AUTOMATIZADO DE CRUCE CON LISTAS DE RIESGO PLD/FT (69-B SAT / UIF / OFAC / PEPs)
 *
 * @implements CRUSE-APO-2026-027 (Directrices 1, 2, 3 y 4)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import {
  PldAlertStatus,
  PldComplianceOverview,
  PldHitAlertItem,
  PldIdentifierType,
  PldListType,
  PldRiskEntryItem,
  PldRiskLevel,
  PldScreeningBatchSummary,
  UserRole,
} from '../../types';
import {
  generatePldScreeningCertificateActa,
  parseAndValidatePldCsvZeroPii,
} from './pldListParserAndValidator';

interface RiskEntryDbRow {
  id: string; list_type: PldListType; identifier_type: PldIdentifierType; blind_index: string;
  identifier_masked: string; subject_masked_name: string; risk_level: PldRiskLevel;
  official_reference: string; publication_date: string; source_file_hash: string;
  recorded_by: string; created_at: string;
}

interface ProjectedAlertDbRow {
  id: string; screening_batch_id: string | null; risk_entry_id: string;
  entity_type: 'EXPEDIENTE' | 'INVESTOR'; entity_id: string; blind_index_prefix: string;
  entity_masked_id: string; entity_masked_name: string; list_type: PldListType;
  risk_level: PldRiskLevel; official_reference: string; exposure_amount: string | number;
  detection_channel: 'BATCH_SCREENING' | 'REALTIME_ORIGINATION'; projected_status: PldAlertStatus;
  latest_resolution_notes: string | null; latest_resolved_by: string | null;
  latest_resolved_at: string | null; created_at: string;
}

interface BatchDbRow {
  id: string; created_at: string; officer_email: string; total_expedientes_screened: number;
  total_investors_screened: number; total_risk_entries_evaluated: number;
  hits_detected_count: number; new_alerts_created_count: number;
  batch_manifest_hash: string; certificate_acta: string;
}

interface CandidateHitDbRow {
  risk_entry_id: string; entity_type: 'EXPEDIENTE' | 'INVESTOR'; entity_id: string;
  blind_index_prefix: string; entity_masked_id: string; entity_masked_name: string;
  list_type: PldListType; risk_level: PldRiskLevel; official_reference: string;
  exposure_amount: string | number; has_pending_alert: number;
}

/**
 * Directriz 2: Obtiene el resumen de cumplimiento PLD/FT, catálogo de listas de riesgo y alertas
 * proyectadas mediante ROW_NUMBER() OVER (PARTITION BY hit_alert_id ORDER BY created_at DESC, id DESC)
 * bajo aislamiento REPEATABLE READ READ ONLY.
 */
export async function getPldComplianceOverview(): Promise<PldComplianceOverview> {
  return db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    }

    const entriesRes = await tx.query<RiskEntryDbRow>(
      `SELECT id, list_type, identifier_type, blind_index, identifier_masked,
              subject_masked_name, risk_level, official_reference, publication_date,
              source_file_hash, recorded_by, created_at
       FROM pld_risk_entries ORDER BY created_at DESC, id DESC LIMIT 300`
    );

    const alertsRes = await tx.query<ProjectedAlertDbRow>(
      `WITH ranked_resolutions AS (
         SELECT par.hit_alert_id, par.resolution_status, par.justification_notes,
                par.officer_email, par.created_at,
                ROW_NUMBER() OVER (PARTITION BY par.hit_alert_id ORDER BY par.created_at DESC, par.id DESC) AS rn
         FROM pld_alert_resolutions par
       ),
       latest_resolution AS (
         SELECT hit_alert_id, resolution_status, justification_notes, officer_email, created_at
         FROM ranked_resolutions WHERE rn = 1
       )
       SELECT pha.id, pha.screening_batch_id, pha.risk_entry_id, pha.entity_type, pha.entity_id,
              pha.blind_index_prefix, pha.entity_masked_id, pha.entity_masked_name, pha.list_type,
              pha.risk_level, pha.official_reference, pha.exposure_amount, pha.detection_channel,
              COALESCE(lr.resolution_status, pha.status) AS projected_status,
              lr.justification_notes AS latest_resolution_notes,
              lr.officer_email AS latest_resolved_by, lr.created_at AS latest_resolved_at, pha.created_at
       FROM pld_hit_alerts pha
       LEFT JOIN latest_resolution lr ON lr.hit_alert_id = pha.id
       ORDER BY pha.created_at DESC, pha.id DESC`
    );

    const batchRes = await tx.query<BatchDbRow>(
      `SELECT id, created_at, officer_email, total_expedientes_screened, total_investors_screened,
              total_risk_entries_evaluated, hits_detected_count, new_alerts_created_count,
              batch_manifest_hash, certificate_acta
       FROM pld_screening_batches ORDER BY created_at DESC, id DESC LIMIT 1`
    );

    const riskEntries: PldRiskEntryItem[] = entriesRes.rows.map((r) => ({
      id: r.id, listType: r.list_type, identifierType: r.identifier_type,
      blindIndexPrefix: String(r.blind_index ?? '').trim().slice(0, 12),
      identifierMasked: r.identifier_masked, subjectMaskedName: r.subject_masked_name,
      riskLevel: r.risk_level, officialReference: r.official_reference,
      publicationDate: r.publication_date, sourceFileHash: String(r.source_file_hash ?? '').trim(),
      recordedBy: r.recorded_by, createdAt: String(r.created_at),
    }));

    let sat69bCount = 0; let uifOfacCount = 0; let pepCount = 0;
    for (const entry of riskEntries) {
      if (entry.listType === 'SAT_69B_DEFINITIVO' || entry.listType === 'SAT_69B_PRESUNTO') sat69bCount++;
      else if (entry.listType === 'UIF_PERSONAS_BLOQUEADAS' || entry.listType === 'OFAC_SDN') uifOfacCount++;
      else if (entry.listType === 'PEP_NACIONAL') pepCount++;
    }

    let pendingAlertsCount = 0; let confirmedBlockedCount = 0; let clearedOrFalsePositiveCount = 0;
    let totalExposureBlockedOrPending = new Decimal(0);

    const alerts: PldHitAlertItem[] = alertsRes.rows.map((a) => {
      const expDec = new Decimal(a.exposure_amount || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (a.projected_status === 'PENDING_REVIEW') {
        pendingAlertsCount++;
        totalExposureBlockedOrPending = totalExposureBlockedOrPending.plus(expDec);
      } else if (a.projected_status === 'CONFIRMED_BLOCKED') {
        confirmedBlockedCount++;
        totalExposureBlockedOrPending = totalExposureBlockedOrPending.plus(expDec);
      } else {
        clearedOrFalsePositiveCount++;
      }

      return {
        id: a.id, screeningBatchId: a.screening_batch_id, riskEntryId: a.risk_entry_id,
        entityType: a.entity_type, entityId: a.entity_id,
        blindIndexPrefix: String(a.blind_index_prefix ?? '').trim().slice(0, 12),
        entityMaskedId: a.entity_masked_id, entityMaskedName: a.entity_masked_name,
        listType: a.list_type, riskLevel: a.risk_level, officialReference: a.official_reference,
        exposureAmount: expDec.toFixed(2), detectionChannel: a.detection_channel,
        projectedStatus: a.projected_status, latestResolutionNotes: a.latest_resolution_notes,
        latestResolvedBy: a.latest_resolved_by,
        latestResolvedAt: a.latest_resolved_at ? String(a.latest_resolved_at) : null,
        createdAt: String(a.created_at),
      };
    });

    const b = batchRes.rows[0];
    const latestBatch: PldScreeningBatchSummary | null = b
      ? {
          id: b.id, createdAt: String(b.created_at), officerEmail: b.officer_email,
          totalExpedientesScreened: Number(b.total_expedientes_screened),
          totalInvestorsScreened: Number(b.total_investors_screened),
          totalRiskEntriesEvaluated: Number(b.total_risk_entries_evaluated),
          hitsDetectedCount: Number(b.hits_detected_count),
          newAlertsCreatedCount: Number(b.new_alerts_created_count),
          batchManifestHash: String(b.batch_manifest_hash).trim(),
          certificateActa: b.certificate_acta,
        }
      : null;

    return {
      kpis: {
        totalRiskEntries: riskEntries.length, sat69bCount, uifOfacCount, pepCount,
        pendingAlertsCount, confirmedBlockedCount, clearedOrFalsePositiveCount,
        totalExposureBlockedOrPending: totalExposureBlockedOrPending.toFixed(2),
      },
      riskEntries, alerts, latestBatch,
    };
  });
}

/**
 * Directriz 3: Ingesta idempotente de listas oficiales PLD/FT usando ON CONFLICT (blind_index, list_type) DO NOTHING
 * para respetar la inmutabilidad WORM de pld_risk_entries sin generar excepciones ni duplicados.
 */
export async function ingestPldRiskListEntries(input: {
  csvContent: string; defaultListType: PldListType; defaultOfficialReference: string;
  actorEmail: string; actorRole: UserRole; sourceIp: string;
}): Promise<{
  sourceFileHash: string; parsedCount: number; insertedCount: number; skippedDuplicatesCount: number;
}> {
  const manifest = await parseAndValidatePldCsvZeroPii(
    input.csvContent, input.defaultListType, input.defaultOfficialReference
  );

  return db.transaction(async (tx) => {
    let insertedCount = 0; let skippedDuplicatesCount = 0;

    for (const row of manifest.entries) {
      const entryId = `pld_re_${crypto.randomBytes(8).toString('hex')}`;
      const res = await tx.execute(
        `INSERT INTO pld_risk_entries (
           id, list_type, identifier_type, blind_index, identifier_masked,
           subject_masked_name, risk_level, official_reference, publication_date,
           source_file_hash, recorded_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (blind_index, list_type) DO NOTHING`,
        [
          entryId, row.listType, row.identifierType, row.blindIndex, row.identifierMasked,
          row.subjectMaskedName, row.riskLevel, row.officialReference, row.publicationDate,
          row.sourceFileHash, input.actorEmail,
        ]
      );
      if (res.changes > 0) insertedCount++;
      else skippedDuplicatesCount++;
    }

    await auditEventStore.appendInTx(tx, {
      action: 'PLD_LIST_INGESTED', actorEmail: input.actorEmail, actorRole: input.actorRole,
      outcome: 'success', sourceIp: input.sourceIp, sourceSummary: 'pldScreeningService',
      details: `Lista PLD/FT (${input.defaultListType}) ingerida. SourceSHA256: ${manifest.sourceFileHash.slice(0, 16)}. Nuevos: ${insertedCount}, Omitidos idempotentes: ${skippedDuplicatesCount}.`,
    });

    return {
      sourceFileHash: manifest.sourceFileHash, parsedCount: manifest.entries.length,
      insertedCount, skippedDuplicatesCount,
    };
  });
}

/**
 * Directriz 2, Directriz 3 y Directriz 4:
 * Ejecuta en Una Sola Pasada CTE el barrido de cartera activa (expedientes) e inversionistas (investors)
 * contra pld_risk_entries usando INNER JOIN sobre idx_pld_risk_blind_index y TRIM(), previene duplicados
 * con NOT EXISTS sobre latest_resolution y sella atómicamente pld_screening_batches + Acta CNBV/UIF + audit_events.
 */
export async function runFullPortfolioPldScreening(input: {
  actorEmail: string; actorRole: UserRole; sourceIp: string;
}): Promise<PldScreeningBatchSummary> {
  return db.transaction(async (tx) => {
    const countsRes = await tx.query<{ exp_count: number; inv_count: number; risk_count: number }>(
      `SELECT (SELECT COUNT(*) FROM expedientes) AS exp_count,
              (SELECT COUNT(*) FROM investors) AS inv_count,
              (SELECT COUNT(*) FROM pld_risk_entries) AS risk_count`
    );

    const totalExpedientesScreened = Number(countsRes.rows[0]?.exp_count ?? 0);
    const totalInvestorsScreened = Number(countsRes.rows[0]?.inv_count ?? 0);
    const totalRiskEntriesEvaluated = Number(countsRes.rows[0]?.risk_count ?? 0);

    const hitsRes = await tx.query<CandidateHitDbRow>(
      `WITH lpa_totals AS (
         SELECT loan_account_id, SUM(applied_capital) AS total_applied_capital
         FROM loan_payment_applications GROUP BY loan_account_id
       ),
       expediente_exposure AS (
         SELECT e.id AS entity_id, TRIM(e.blind_curp) AS clean_blind_index,
                e.curp_masked AS entity_masked_id, e.full_name AS entity_masked_name,
                COALESCE(SUM(CASE
                  WHEN la.id IS NOT NULL AND la.status = 'ACTIVE'
                  THEN CASE WHEN (la.principal_original - COALESCE(lt.total_applied_capital, 0)) > 0
                            THEN (la.principal_original - COALESCE(lt.total_applied_capital, 0)) ELSE 0 END
                  ELSE 0 END), e.requested_amount) AS exposure_amount
         FROM expedientes e
         LEFT JOIN loan_accounts la ON la.expediente_id = e.id
         LEFT JOIN lpa_totals lt ON lt.loan_account_id = la.id
         GROUP BY e.id, e.blind_curp, e.curp_masked, e.full_name, e.requested_amount
       ),
       investor_exposure AS (
         SELECT i.id AS entity_id, TRIM(i.blind_name) AS clean_blind_index,
                SUBSTR(TRIM(i.blind_name), 1, 12) AS entity_masked_id,
                'INVERSIONISTA PROTEGIDO' AS entity_masked_name,
                COALESCE(SUM(CASE WHEN inv.status = 'ACTIVE' THEN inv.current_capital ELSE 0 END), 0) AS exposure_amount
         FROM investors i LEFT JOIN investments inv ON inv.investor_id = i.id
         GROUP BY i.id, i.blind_name
       ),
       ranked_resolutions AS (
         SELECT par.hit_alert_id, par.resolution_status,
                ROW_NUMBER() OVER (PARTITION BY par.hit_alert_id ORDER BY par.created_at DESC, par.id DESC) AS rn
         FROM pld_alert_resolutions par
       ),
       latest_resolution AS (
         SELECT hit_alert_id, resolution_status FROM ranked_resolutions WHERE rn = 1
       ),
       matched_subjects AS (
         SELECT r.id AS risk_entry_id, 'EXPEDIENTE' AS entity_type, ee.entity_id,
                SUBSTR(r.blind_index, 1, 12) AS blind_index_prefix,
                ee.entity_masked_id, ee.entity_masked_name,
                r.list_type, r.risk_level, r.official_reference, ee.exposure_amount
         FROM expediente_exposure ee INNER JOIN pld_risk_entries r ON r.blind_index = ee.clean_blind_index
         UNION ALL
         SELECT r.id AS risk_entry_id, 'INVESTOR' AS entity_type, ie.entity_id,
                SUBSTR(r.blind_index, 1, 12) AS blind_index_prefix,
                ie.entity_masked_id, r.subject_masked_name AS entity_masked_name,
                r.list_type, r.risk_level, r.official_reference, ie.exposure_amount
         FROM investor_exposure ie INNER JOIN pld_risk_entries r ON r.blind_index = ie.clean_blind_index
       )
       SELECT ms.risk_entry_id, ms.entity_type, ms.entity_id, ms.blind_index_prefix,
              ms.entity_masked_id, ms.entity_masked_name, ms.list_type,
              ms.risk_level, ms.official_reference, ms.exposure_amount,
              CASE WHEN EXISTS (
                SELECT 1 FROM pld_hit_alerts pha
                LEFT JOIN latest_resolution lr ON lr.hit_alert_id = pha.id
                WHERE pha.entity_id = ms.entity_id AND pha.list_type = ms.list_type
                  AND COALESCE(lr.resolution_status, pha.status) = 'PENDING_REVIEW'
              ) THEN 1 ELSE 0 END AS has_pending_alert
       FROM matched_subjects ms
       ORDER BY ms.entity_id ASC, ms.list_type ASC`
    );

    const batchId = `pld_sb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestampIso = new Date().toISOString();

    const hitsFormatted = hitsRes.rows.map((h) => ({
      riskEntryId: h.risk_entry_id, entityType: h.entity_type, entityId: h.entity_id,
      blindIndexPrefix: String(h.blind_index_prefix ?? '').trim().slice(0, 12),
      entityMaskedId: h.entity_masked_id, entityMaskedName: h.entity_masked_name,
      listType: h.list_type, riskLevel: h.risk_level, officialReference: h.official_reference,
      exposureAmount: new Decimal(h.exposure_amount || 0).toFixed(2),
      hasPendingAlert: Number(h.has_pending_alert) === 1,
    }));

    const newHitsToInsert = hitsFormatted.filter((h) => !h.hasPendingAlert);

    const { batchManifestHash, certificateActa } = generatePldScreeningCertificateActa({
      batchId, timestampIso, officerEmail: input.actorEmail,
      totalExpedientesScreened, totalInvestorsScreened, totalRiskEntriesEvaluated,
      hitsDetected: hitsFormatted, newAlertsCreatedCount: newHitsToInsert.length,
    });

    await tx.execute(
      `INSERT INTO pld_screening_batches (
         id, created_at, officer_email, total_expedientes_screened,
         total_investors_screened, total_risk_entries_evaluated,
         hits_detected_count, new_alerts_created_count, batch_manifest_hash, certificate_acta
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        batchId, timestampIso, input.actorEmail,
        totalExpedientesScreened, totalInvestorsScreened, totalRiskEntriesEvaluated,
        hitsFormatted.length, newHitsToInsert.length, batchManifestHash, certificateActa,
      ]
    );

    for (const hit of newHitsToInsert) {
      const alertId = `pld_ha_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO pld_hit_alerts (
           id, screening_batch_id, risk_entry_id, entity_type, entity_id,
           blind_index_prefix, entity_masked_id, entity_masked_name,
           list_type, risk_level, official_reference, exposure_amount,
           detection_channel, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'BATCH_SCREENING', 'PENDING_REVIEW', $13)`,
        [
          alertId, batchId, hit.riskEntryId, hit.entityType, hit.entityId,
          hit.blindIndexPrefix, hit.entityMaskedId, hit.entityMaskedName,
          hit.listType, hit.riskLevel, hit.officialReference,
          Number(hit.exposureAmount), timestampIso,
        ]
      );

      if (hit.entityType === 'EXPEDIENTE') {
        const reviewExpStatus = tx.isPostgres ? 'revision_pld' : 'capturado';
        await tx.execute(
          `UPDATE expedientes
           SET status = CASE WHEN status IN ('capturado', 'conciliado', 'aprobado') THEN $1 ELSE status END,
               updated_at = $2 WHERE id = $3`,
          [reviewExpStatus, timestampIso, hit.entityId]
        );
      }
    }

    await auditEventStore.appendInTx(tx, {
      action: 'PLD_PORTFOLIO_SCREENED', actorEmail: input.actorEmail, actorRole: input.actorRole,
      outcome: 'success', sourceIp: input.sourceIp, sourceSummary: 'pldScreeningService',
      details: `Barrido WORM ${batchId} sellado. ManifestSHA256: ${batchManifestHash.slice(0, 16)}. Hits: ${hitsFormatted.length}, Nuevas alertas: ${newHitsToInsert.length}.`,
    });

    return {
      id: batchId, createdAt: timestampIso, officerEmail: input.actorEmail,
      totalExpedientesScreened, totalInvestorsScreened, totalRiskEntriesEvaluated,
      hitsDetectedCount: hitsFormatted.length, newAlertsCreatedCount: newHitsToInsert.length,
      batchManifestHash, certificateActa,
    };
  });
}

/**
 * Directriz 1 y Directriz 3: Guardia preventiva PLD/FT en tiempo real durante la originación de un expediente.
 * Jamás expone qué lista ni nivel de riesgo coincidió hacia el exterior: retorna únicamente { hitDetected: boolean }.
 */
export async function screenSingleSubjectInRealtime(input: {
  expedienteId: string; blindCurp: string; curpMasked: string; maskedName: string;
  requestedAmount: number; actorEmail: string; actorRole: UserRole; sourceIp: string;
}): Promise<{ hitDetected: boolean }> {
  const cleanBlind = input.blindCurp.trim();
  return db.transaction(async (tx) => {
    const matchesRes = await tx.query<{
      id: string; list_type: PldListType; risk_level: PldRiskLevel; official_reference: string;
    }>(
      `WITH ranked_resolutions AS (
         SELECT par.hit_alert_id, par.resolution_status,
                ROW_NUMBER() OVER (PARTITION BY par.hit_alert_id ORDER BY par.created_at DESC, par.id DESC) AS rn
         FROM pld_alert_resolutions par
       ),
       latest_resolution AS (
         SELECT hit_alert_id, resolution_status FROM ranked_resolutions WHERE rn = 1
       )
       SELECT r.id, r.list_type, r.risk_level, r.official_reference
       FROM pld_risk_entries r
       WHERE r.blind_index = $1
         AND NOT EXISTS (
           SELECT 1 FROM pld_hit_alerts pha
           LEFT JOIN latest_resolution lr ON lr.hit_alert_id = pha.id
           WHERE pha.entity_id = $2 AND pha.list_type = r.list_type
             AND COALESCE(lr.resolution_status, pha.status) = 'PENDING_REVIEW'
         )`,
      [cleanBlind, input.expedienteId]
    );

    if (matchesRes.rows.length === 0) return { hitDetected: false };

    const nowIso = new Date().toISOString();
    const blindPrefix = cleanBlind.slice(0, 12);

    for (const match of matchesRes.rows) {
      const alertId = `pld_ha_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO pld_hit_alerts (
           id, screening_batch_id, risk_entry_id, entity_type, entity_id,
           blind_index_prefix, entity_masked_id, entity_masked_name,
           list_type, risk_level, official_reference, exposure_amount,
           detection_channel, status, created_at
         ) VALUES ($1, NULL, $2, 'EXPEDIENTE', $3, $4, $5, $6, $7, $8, $9, $10, 'REALTIME_ORIGINATION', 'PENDING_REVIEW', $11)`,
        [
          alertId, match.id, input.expedienteId, blindPrefix,
          input.curpMasked, input.maskedName, match.list_type,
          match.risk_level, match.official_reference, input.requestedAmount, nowIso,
        ]
      );
    }

    const reviewExpStatus = tx.isPostgres ? 'revision_pld' : 'capturado';
    await tx.execute(
      `UPDATE expedientes SET status = $1, updated_at = $2 WHERE id = $3`,
      [reviewExpStatus, nowIso, input.expedienteId]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'PLD_HIT_DETECTED', actorEmail: input.actorEmail, actorRole: input.actorRole,
      outcome: 'success', sourceIp: input.sourceIp, sourceSummary: 'pldScreeningService',
      curpMasked: input.curpMasked, blindCurpPrefix: blindPrefix, expedienteId: input.expedienteId,
      details: `Hit PLD/FT en tiempo real sobre expediente ${input.expedienteId} (${matchesRes.rows.length} coincidencia(s)). Estatus cambiado a revision_pld.`,
    });

    return { hitDetected: true };
  });
}

/**
 * Emite un dictamen inmutable WORM en pld_alert_resolutions sin alterar pld_hit_alerts (Event-Sourced Projection).
 */
export async function resolvePldHitAlert(input: {
  alertId: string; resolutionStatus: 'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE';
  justificationNotes: string; actorEmail: string; actorRole: UserRole; sourceIp: string;
}): Promise<{
  resolutionId: string; alertId: string; resolutionStatus: PldAlertStatus; resolutionHash: string;
}> {
  const cleanNotes = input.justificationNotes.trim();
  if (cleanNotes.length < 10) {
    throw new Error('La justificación regulatoria del dictamen PLD/FT debe tener al menos 10 caracteres.');
  }

  return db.transaction(async (tx) => {
    const alertRes = await tx.query<{
      id: string; entity_type: 'EXPEDIENTE' | 'INVESTOR'; entity_id: string;
      blind_index_prefix: string; entity_masked_id: string; list_type: PldListType;
    }>(
      `SELECT id, entity_type, entity_id, blind_index_prefix, entity_masked_id, list_type
       FROM pld_hit_alerts WHERE id = $1`,
      [input.alertId]
    );

    const alert = alertRes.rows[0];
    if (!alert) throw new Error(`Alerta PLD/FT ${input.alertId} no encontrada.`);

    const resolutionId = `pld_ar_${crypto.randomBytes(8).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const resolutionHash = crypto
      .createHash('sha256')
      .update(`${resolutionId}|${alert.id}|${input.resolutionStatus}|${cleanNotes}|${input.actorEmail}|${nowIso}`, 'utf8')
      .digest('hex');

    await tx.execute(
      `INSERT INTO pld_alert_resolutions (
         id, hit_alert_id, resolution_status, justification_notes, officer_email, resolution_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [resolutionId, alert.id, input.resolutionStatus, cleanNotes, input.actorEmail, resolutionHash, nowIso]
    );

    if (alert.entity_type === 'EXPEDIENTE') {
      const rejectedExpStatus = tx.isPostgres ? 'rechazado_pld' : 'rechazado';
      const nextExpStatus = input.resolutionStatus === 'CONFIRMED_BLOCKED' ? rejectedExpStatus : 'aprobado';
      await tx.execute(
        `UPDATE expedientes SET status = $1, updated_at = $2 WHERE id = $3 AND status IN ('revision_pld', 'capturado', 'aprobado')`,
        [nextExpStatus, nowIso, alert.entity_id]
      );
    }

    await tx.execute(
      `INSERT INTO operational_notes (id, entity_type, entity_id, note_content, is_pinned, author_email, created_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [
        `note_pld_${Date.now()}`, alert.entity_type, alert.entity_id,
        `[DICTAMEN PLD/FT ${input.resolutionStatus}] (${alert.list_type}): ${cleanNotes}`,
        input.actorEmail, nowIso,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'PLD_ALERT_RESOLVED', actorEmail: input.actorEmail, actorRole: input.actorRole,
      outcome: 'success', sourceIp: input.sourceIp, sourceSummary: 'pldScreeningService',
      curpMasked: alert.entity_masked_id, blindCurpPrefix: alert.blind_index_prefix,
      expedienteId: alert.entity_type === 'EXPEDIENTE' ? alert.entity_id : undefined,
      details: `Alerta PLD ${alert.id} dictaminada como ${input.resolutionStatus}. Sello: ${resolutionHash.slice(0, 16)}.`,
    });

    return {
      resolutionId, alertId: alert.id, resolutionStatus: input.resolutionStatus, resolutionHash,
    };
  });
}
