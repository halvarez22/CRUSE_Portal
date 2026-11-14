/**
 * HOMOLOGACIÓN FINA DEL FLUJO DE CUMPLIMIENTO CNBV / UIF (FASE 2 — CRUSE-APO-2026-065)
 *
 * Implementa los Guardrails Forenses 1, 2 y 3 (y re-exporta Guardrail 4 desde `semesterTransactionalReviewService`):
 * 1. Guardrail 1: Prórroga Extraordinaria CCC (+30 días = 90 días naturales) con WORM
 *    `CCC_EXTRAORDINARY_EXTENSION_GRANTED` (originalDeadline, newDeadline, expedienteSha256)
 *    y revocación compensatoria `CCC_EXTENSION_REVOKED`.
 * 2. Guardrail 2: Escalamiento Inmutable a "Reporte de 24 Horas" (`detected_at + 24h`,
 *    prefijo determinista `"Reporte de 24 Horas. "` en Columna 40, WORM `SITI_24H_REPORT_ESCALATED`,
 *    bypass CCC con notificación en próxima sesión, y anulación exclusiva por autoridad
 *    `SITI_24H_REPORT_CANCELLED_BY_AUTHORIY`).
 * 3. Guardrail 3: Catálogo Oficial GAFI (`GAFI_HIGH_RISK_JURISDICTIONS`) y SHCP ReFiPres
 *    (`SHCP_REFIPRES_TAX_HAVENS`) con `source_url`, `official_publication_date` y `jurisdiction_iso3166_alpha2`,
 *    validando no duplicidad estricta por `(jurisdiction_iso3166_alpha2, list_type, official_publication_date)`.
 *
 * @implements CRUSE-APO-2026-065 (Guardrails Forenses 1, 2, 3 y 4)
 * @implements Regla 2 HRU (Cero Hardcoding) y Regla 3 Anti-God-Object (< 580 líneas)
 */

import crypto from 'crypto';
import { addDays, addHours, parseISO } from 'date-fns';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { enforceCol40MandatoryPrefix, sanitizeSitiAlphanumericField } from './sitiLayoutGenerator';
import { computeBlindIndex } from '../crypto/cryptoService';
import { getServerEnv } from '../../config/serverEnv';
import { GafiRefipresJurisdictionItem, UserRole } from '../../types';

export {
  executeSemesterTransactionalReview,
  listSemesterTransactionalReviews,
} from './semesterTransactionalReviewService';

// ============================================================================
// GUARDRAIL 1: PRÓRROGA EXTRAORDINARIA CCC (+30 DÍAS NATURALES) Y REVOCACIÓN WORM
// ============================================================================

export async function grantCccExtraordinaryExtension30Days(params: {
  reportId: string;
  justificationText: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  wormEventId: string;
  reportId: string;
  originalDeadline: string;
  newDeadline: string;
  expedienteSha256: string;
  recordSha256Hash: string;
}> {
  const cleanJustification = String(params.justificationText ?? '').trim();
  if (cleanJustification.length < 15) {
    throw new Error(
      'La Prórroga Extraordinaria CCC (+30 días naturales) requiere una justificación regulatoria mínima de 15 caracteres.'
    );
  }

  return db.transaction(async (tx) => {
    const repRes = await tx.query<{
      id: string;
      expediente_id: string | null;
      subject_curp_masked: string;
      detected_at: string;
      investigation_deadline_at: string;
      extraordinary_extension_granted: number;
    }>(
      `SELECT id, expediente_id, subject_curp_masked, detected_at, investigation_deadline_at,
              extraordinary_extension_granted
       FROM pld_cnbv_reports_and_whistleblowing WHERE id = $1`,
      [params.reportId]
    );

    const rep = repRes.rows[0];
    if (!rep) {
      throw new Error(`Reporte regulatorio ${params.reportId} no encontrado.`);
    }
    if (Number(rep.extraordinary_extension_granted) === 1) {
      throw new Error(
        `El reporte ${params.reportId} ya cuenta con una Prórroga Extraordinaria concedida. Por regla WORM no puede editarse.`
      );
    }

    const originalDeadlineIso = String(rep.investigation_deadline_at);
    const detectedDate = rep.detected_at.includes('T')
      ? parseISO(rep.detected_at)
      : new Date(rep.detected_at);
    const newDeadlineIso = addDays(detectedDate, 90).toISOString();

    let expSnapshotPayload = `REPORT:${rep.id}|CURP:${rep.subject_curp_masked}|DETECTED:${rep.detected_at}`;
    if (rep.expediente_id) {
      const expRes = await tx.query<{
        id: string;
        curp_masked: string;
        requested_amount: number | string;
        status: string;
        updated_at: string;
      }>(
        `SELECT id, curp_masked, requested_amount, status, updated_at FROM expedientes WHERE id = $1`,
        [rep.expediente_id]
      );
      const exp = expRes.rows[0];
      if (exp) {
        expSnapshotPayload = `EXP:${exp.id}|CURP:${exp.curp_masked}|AMT:${exp.requested_amount}|ST:${exp.status}|UPD:${exp.updated_at}`;
      }
    }

    const expedienteSha256 = crypto
      .createHash('sha256')
      .update(expSnapshotPayload, 'utf8')
      .digest('hex');

    const nowIso = new Date().toISOString();
    const wormEventId = `ccc_ext_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const recordSha256Hash = crypto
      .createHash('sha256')
      .update(
        `CCC_EXTRAORDINARY_EXTENSION_GRANTED|${wormEventId}|${rep.id}|${originalDeadlineIso}|${newDeadlineIso}|${expedienteSha256}|${cleanJustification}|${params.actorEmail}|${nowIso}`,
        'utf8'
      )
      .digest('hex');

    await tx.execute(
      `INSERT INTO pld_ccc_extension_worm_events (
         id, report_id, event_type, justification_text, actor_email, actor_role,
         source_ip, original_deadline, new_deadline, expediente_sha256, record_sha256_hash, created_at
       ) VALUES ($1, $2, 'CCC_EXTRAORDINARY_EXTENSION_GRANTED', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        wormEventId, rep.id, cleanJustification, params.actorEmail, params.actorRole,
        params.sourceIp, originalDeadlineIso, newDeadlineIso, expedienteSha256, recordSha256Hash, nowIso,
      ]
    );

    await tx.execute(
      `UPDATE pld_cnbv_reports_and_whistleblowing
       SET extraordinary_extension_granted = 1, original_investigation_deadline_at = $1,
           investigation_deadline_at = $2, extension_justification_notes = $3,
           extension_granted_by = $4, extension_granted_at = $5,
           extension_expediente_sha256 = $6, sla_clock_status = 'ON_TIME'
       WHERE id = $7`,
      [originalDeadlineIso, newDeadlineIso, cleanJustification, params.actorEmail, nowIso, expedienteSha256, rep.id]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'CCC_EXTRAORDINARY_EXTENSION_GRANTED',
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      outcome: 'success',
      sourceIp: params.sourceIp,
      sourceSummary: 'cnbvComplianceFineHomologationService',
      expedienteId: rep.expediente_id ?? rep.id,
      curpMasked: rep.subject_curp_masked,
      details: `Prórroga Extraordinaria CCC (+30d) concedida para ${rep.id} | Plazo original (60d): ${originalDeadlineIso.slice(0, 10)} -> Nuevo plazo (90d): ${newDeadlineIso.slice(0, 10)} | ExpSHA256: ${expedienteSha256.slice(0, 16)} | Sustento: ${cleanJustification}`,
    });

    return {
      wormEventId,
      reportId: rep.id,
      originalDeadline: originalDeadlineIso,
      newDeadline: newDeadlineIso,
      expedienteSha256,
      recordSha256Hash,
    };
  });
}

export async function revokeCccExtraordinaryExtensionWorm(params: {
  reportId: string;
  justificationText: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  wormEventId: string;
  reportId: string;
  restoredDeadline: string;
  recordSha256Hash: string;
}> {
  const cleanJustification = String(params.justificationText ?? '').trim();
  if (cleanJustification.length < 15) {
    throw new Error('La revocación compensatoria WORM de prórroga CCC requiere al menos 15 caracteres.');
  }

  return db.transaction(async (tx) => {
    const repRes = await tx.query<{
      id: string;
      expediente_id: string | null;
      subject_curp_masked: string;
      investigation_deadline_at: string;
      original_investigation_deadline_at: string | null;
      extraordinary_extension_granted: number;
      extension_expediente_sha256: string | null;
    }>(
      `SELECT id, expediente_id, subject_curp_masked, investigation_deadline_at,
              original_investigation_deadline_at, extraordinary_extension_granted, extension_expediente_sha256
       FROM pld_cnbv_reports_and_whistleblowing WHERE id = $1`,
      [params.reportId]
    );

    const rep = repRes.rows[0];
    if (!rep || Number(rep.extraordinary_extension_granted) !== 1) {
      throw new Error(`El reporte ${params.reportId} no tiene una prórroga activa para revocar.`);
    }

    const previousExtendedDeadline = String(rep.investigation_deadline_at);
    const restoredDeadline = String(rep.original_investigation_deadline_at ?? rep.investigation_deadline_at);
    const expedienteSha256 =
      rep.extension_expediente_sha256 ??
      crypto.createHash('sha256').update(`REVOKED:${rep.id}`, 'utf8').digest('hex');

    const nowIso = new Date().toISOString();
    const wormEventId = `ccc_rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const recordSha256Hash = crypto
      .createHash('sha256')
      .update(
        `CCC_EXTENSION_REVOKED|${wormEventId}|${rep.id}|${previousExtendedDeadline}|${restoredDeadline}|${expedienteSha256}|${cleanJustification}|${params.actorEmail}|${nowIso}`,
        'utf8'
      )
      .digest('hex');

    await tx.execute(
      `INSERT INTO pld_ccc_extension_worm_events (
         id, report_id, event_type, justification_text, actor_email, actor_role,
         source_ip, original_deadline, new_deadline, expediente_sha256, record_sha256_hash, created_at
       ) VALUES ($1, $2, 'CCC_EXTENSION_REVOKED', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        wormEventId, rep.id, cleanJustification, params.actorEmail, params.actorRole,
        params.sourceIp, previousExtendedDeadline, restoredDeadline, expedienteSha256, recordSha256Hash, nowIso,
      ]
    );

    await tx.execute(
      `UPDATE pld_cnbv_reports_and_whistleblowing
       SET extraordinary_extension_granted = 0,
           investigation_deadline_at = $1,
           extension_justification_notes = $2
       WHERE id = $3`,
      [restoredDeadline, `[REVOCADA WORM]: ${cleanJustification}`, rep.id]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'CCC_EXTENSION_REVOKED',
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      outcome: 'success',
      sourceIp: params.sourceIp,
      sourceSummary: 'cnbvComplianceFineHomologationService',
      expedienteId: rep.expediente_id ?? rep.id,
      curpMasked: rep.subject_curp_masked,
      details: `Prórroga CCC revocada mediante evento compensatorio WORM para ${rep.id} | Plazo restaurado a 60d: ${restoredDeadline.slice(0, 10)} | Sustento: ${cleanJustification}`,
    });

    return {
      wormEventId,
      reportId: rep.id,
      restoredDeadline,
      recordSha256Hash,
    };
  });
}

// ============================================================================
// GUARDRAIL 2: RELOJ INMUTABLE DE 24 HORAS Y PREFIJO DETERMINISTA EN COLUMNA 40
// ============================================================================

export async function escalateReportTo24HoursUrgent(params: {
  reportId: string;
  justificationNotes: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{
  reportId: string;
  submissionDeadline24hAt: string;
  col40Formatted: string;
  cccDecision: 'DIRECT_24H_BYPASS_CCC';
}> {
  const cleanNotes = String(params.justificationNotes ?? '').trim();
  if (cleanNotes.length < 10) {
    throw new Error('El escalamiento urgente a Reporte de 24 Horas requiere justificación mínima de 10 caracteres.');
  }

  return db.transaction(async (tx) => {
    const repRes = await tx.query<{
      id: string;
      report_category: string;
      siti_report_type_code: string;
      expediente_id: string | null;
      subject_curp_masked: string;
      detected_at: string;
      col40_operation_description: string;
      is_escalated_24h: number;
    }>(
      `SELECT id, report_category, siti_report_type_code, expediente_id, subject_curp_masked,
              detected_at, col40_operation_description, is_escalated_24h
       FROM pld_cnbv_reports_and_whistleblowing WHERE id = $1`,
      [params.reportId]
    );

    const rep = repRes.rows[0];
    if (!rep) {
      throw new Error(`Reporte ${params.reportId} no encontrado.`);
    }
    if (Number(rep.is_escalated_24h) === 1) {
      throw new Error(`El reporte ${params.reportId} ya está escalado inmutablemente como Reporte de 24 Horas.`);
    }

    const detectedDate = rep.detected_at.includes('T')
      ? parseISO(rep.detected_at)
      : new Date(rep.detected_at);
    const submissionDeadline24hAt = addHours(detectedDate, 24).toISOString();

    const col40Formatted = sanitizeSitiAlphanumericField(
      enforceCol40MandatoryPrefix('Reporte de 24 Horas', rep.col40_operation_description),
      3000
    );

    const updatedCategory =
      rep.siti_report_type_code === '3' ? 'ROIP_INTERNA_PREOCUPANTE' : 'ROI_24_HORAS';

    await tx.execute(
      `UPDATE pld_cnbv_reports_and_whistleblowing
       SET report_category = $1,
           mandatory_col40_prefix = 'Reporte de 24 Horas',
           col40_operation_description = $2,
           is_escalated_24h = 1,
           submission_deadline_24h_at = $3,
           uif_transmission_deadline_at = $3,
           ccc_decision = 'DIRECT_24H_BYPASS_CCC',
           ccc_justification_notes = $4,
           ccc_next_session_notified = 1,
           sla_clock_status = 'URGENT_24H'
       WHERE id = $5`,
      [
        updatedCategory,
        col40Formatted,
        submissionDeadline24hAt,
        `[ESCALADO URGENTE 24 HORAS — EXENTO DE DICTAMEN PREVIO CCC / AGENDADO PARA INFORMAR EN PROXIMA SESION ORDINARIA CCC]: ${cleanNotes}`,
        rep.id,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'SITI_24H_REPORT_ESCALATED',
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      outcome: 'success',
      sourceIp: params.sourceIp,
      sourceSummary: 'cnbvComplianceFineHomologationService',
      expedienteId: rep.expediente_id ?? rep.id,
      curpMasked: rep.subject_curp_masked,
      details: `Reporte ${rep.id} escalado a Reporte de 24 Horas | Deadline exacto (+24h): ${submissionDeadline24hAt} | Columna 40: "${col40Formatted.slice(0, 65)}..."`,
    });

    return {
      reportId: rep.id,
      submissionDeadline24hAt,
      col40Formatted,
      cccDecision: 'DIRECT_24H_BYPASS_CCC',
    };
  });
}

export async function cancel24HoursReportByAuthority(params: {
  reportId: string;
  justificationNotes: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<{ reportId: string; status: 'ARCHIVED_NO_REPORT' }> {
  if (params.actorRole !== 'admin' && params.actorRole !== 'oficial_cumplimiento') {
    throw new Error(
      'Guardrail 2: Solo un rol de autoridad (admin u oficial_cumplimiento) puede anular un Reporte de 24 Horas.'
    );
  }
  const cleanNotes = String(params.justificationNotes ?? '').trim();
  if (cleanNotes.length < 15) {
    throw new Error('La anulación por autoridad de un Reporte de 24 Horas requiere al menos 15 caracteres.');
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      `UPDATE pld_cnbv_reports_and_whistleblowing
       SET cancelled_24h_by_authority = 1,
           cancel_24h_justification_notes = $1,
           sla_clock_status = 'ARCHIVED_NO_REPORT'
       WHERE id = $2`,
      [cleanNotes, params.reportId]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'SITI_24H_REPORT_CANCELLED_BY_AUTHORIY',
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      outcome: 'success',
      sourceIp: params.sourceIp,
      sourceSummary: 'cnbvComplianceFineHomologationService',
      expedienteId: params.reportId,
      details: `Reporte de 24 Horas ${params.reportId} anulado por autoridad (${params.actorRole}) | Sustento: ${cleanNotes}`,
    });

    return { reportId: params.reportId, status: 'ARCHIVED_NO_REPORT' };
  });
}

// ============================================================================
// GUARDRAIL 3: CATÁLOGO GAFI Y SHCP REFIPRES CON TRAZABILIDAD DE FUENTE OFICIAL
// ============================================================================

export async function listGafiAndRefipresJurisdictions(): Promise<
  ReadonlyArray<GafiRefipresJurisdictionItem>
> {
  const res = await db.query<{
    id: string;
    list_type: 'GAFI_HIGH_RISK_JURISDICTIONS' | 'SHCP_REFIPRES_TAX_HAVENS';
    jurisdiction_iso3166_alpha2: string;
    jurisdiction_name: string;
    source_url: string;
    official_publication_date: string;
    risk_classification_note: string;
    recorded_by: string;
    record_sha256_hash: string;
    created_at: string;
  }>(
    `SELECT * FROM pld_gafi_refipres_jurisdictions ORDER BY official_publication_date DESC, jurisdiction_iso3166_alpha2 ASC`
  );

  return res.rows.map((r) => ({
    id: r.id,
    listType: r.list_type,
    jurisdictionIso3166Alpha2: r.jurisdiction_iso3166_alpha2,
    jurisdictionName: r.jurisdiction_name,
    sourceUrl: r.source_url,
    officialPublicationDate: r.official_publication_date,
    riskClassificationNote: r.risk_classification_note,
    recordedBy: r.recorded_by,
    recordSha256Hash: r.record_sha256_hash,
    createdAt: String(r.created_at),
  }));
}

export async function ingestGafiOrRefipresJurisdiction(params: {
  listType: 'GAFI_HIGH_RISK_JURISDICTIONS' | 'SHCP_REFIPRES_TAX_HAVENS';
  jurisdictionIso3166Alpha2: string;
  jurisdictionName: string;
  sourceUrl: string;
  officialPublicationDate: string;
  riskClassificationNote: string;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
}): Promise<GafiRefipresJurisdictionItem> {
  const iso2 = String(params.jurisdictionIso3166Alpha2 ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2)) {
    throw new Error('Guardrail 3: El código ISO país (jurisdiction_iso3166_alpha2) debe tener exactamente 2 letras (ISO 3166-1 alpha-2).');
  }
  const sourceUrl = String(params.sourceUrl ?? '').trim();
  if (!/^https?:\/\/.+/i.test(sourceUrl)) {
    throw new Error('Guardrail 3: Se requiere una URL oficial válida (source_url) de publicación GAFI/SHCP/DOF.');
  }
  const pubDate = String(params.officialPublicationDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate)) {
    throw new Error('Guardrail 3: La fecha de publicación oficial (official_publication_date) debe tener formato YYYY-MM-DD.');
  }
  const nameUpper = String(params.jurisdictionName ?? '').trim().toUpperCase();
  if (nameUpper.length < 3) {
    throw new Error('El nombre de la jurisdicción o territorio debe tener al menos 3 caracteres.');
  }

  return db.transaction(async (tx) => {
    const dupRes = await tx.query<{ id: string }>(
      `SELECT id FROM pld_gafi_refipres_jurisdictions
       WHERE jurisdiction_iso3166_alpha2 = $1 AND list_type = $2 AND official_publication_date = $3`,
      [iso2, params.listType, pubDate]
    );
    if (dupRes.rows.length > 0) {
      throw new Error(
        `Guardrail 3: La jurisdicción ${iso2} ya se encuentra registrada en el catálogo ${params.listType} con fecha de publicación ${pubDate}. Cero duplicados permitidos.`
      );
    }

    const id = `jur_${params.listType === 'GAFI_HIGH_RISK_JURISDICTIONS' ? 'gafi' : 'ref'}_${iso2.toLowerCase()}_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const noteClean =
      String(params.riskClassificationNote ?? '').trim() ||
      `Jurisdicción catalogada bajo ${params.listType} (Publicación Oficial: ${pubDate}).`;

    const recordSha256Hash = crypto
      .createHash('sha256')
      .update(`${id}|${params.listType}|${iso2}|${nameUpper}|${sourceUrl}|${pubDate}|${params.actorEmail}`, 'utf8')
      .digest('hex');

    await tx.execute(
      `INSERT INTO pld_gafi_refipres_jurisdictions (
         id, list_type, jurisdiction_iso3166_alpha2, jurisdiction_name,
         source_url, official_publication_date, risk_classification_note,
         recorded_by, record_sha256_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        params.listType,
        iso2,
        nameUpper,
        sourceUrl,
        pubDate,
        noteClean,
        params.actorEmail,
        recordSha256Hash,
        nowIso,
      ]
    );

    const env = getServerEnv();
    const blindIdx = await computeBlindIndex(`${iso2}::${nameUpper}`, env.blindIndexKey);
    const riskLevel =
      params.listType === 'GAFI_HIGH_RISK_JURISDICTIONS' ? 'CRITICAL_BLOCK' : 'HIGH_EDD_REQUIRED';

    await tx.execute(
      `INSERT INTO pld_risk_entries (
         id, list_type, identifier_type, blind_index, identifier_masked,
         subject_masked_name, risk_level, official_reference, publication_date,
         source_file_hash, recorded_by, created_at
       ) VALUES ($1, $2, 'ISO_PAIS', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (blind_index, list_type) DO NOTHING`,
      [
        `pld_re_${id}`,
        params.listType,
        blindIdx,
        `ISO-${iso2}`,
        `[${iso2}] ${nameUpper}`,
        riskLevel,
        sourceUrl.slice(0, 115),
        pubDate,
        recordSha256Hash,
        params.actorEmail,
        nowIso,
      ]
    );

    await auditEventStore.appendInTx(tx, {
      action: 'GAFI_REFIPRES_JURISDICTION_INGESTED',
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      outcome: 'success',
      sourceIp: params.sourceIp,
      sourceSummary: 'cnbvComplianceFineHomologationService',
      details: `Jurisdicción ${iso2} (${nameUpper}) ingerida en ${params.listType} | Fecha Pub: ${pubDate} | Fuente: ${sourceUrl} | SHA-256: ${recordSha256Hash.slice(0, 16)}`,
    });

    return {
      id,
      listType: params.listType,
      jurisdictionIso3166Alpha2: iso2,
      jurisdictionName: nameUpper,
      sourceUrl,
      officialPublicationDate: pubDate,
      riskClassificationNote: noteClean,
      recordedBy: params.actorEmail,
      recordSha256Hash,
      createdAt: nowIso,
    };
  });
}
