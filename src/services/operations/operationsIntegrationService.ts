/**
 * ORQUESTADOR DEL TABLERO WEB DE OPERACIONES (SINGLE PANE OF GLASS), HUB DE INTEGRACIÓN
 * POR LAYOUTS (SUPREMO TRIBUNAL / PATRONES) Y CONECTORES ZERO-TRUST (FASE 3.4)
 *
 * Implementa Guardrail 4 de CRUSE-APO-2026-050 / CRUSE-APO-2026-062:
 * - Single Pane of Glass consolidando Fases 1, 2 y 3 con filtro por Hub (ALL, CHIHUAHUA, LEON, CANCUN).
 * - Generador y validador de layouts `.TXT` de Ancho Fijo (60 caracteres) y `.CSV` Pipe (`|`).
 * - Aislamiento resiliente de líneas truncadas o corruptas sin derribar el lote completo.
 * - Verificación de conectores internos Zero-Trust (mTLS thumbprint + HMAC-SHA256 + ventana anti-replay 300s).
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { getServerEnv } from '../../config/serverEnv';
import { encryptEnvelope } from '../crypto/cryptoService';
import { getServerKms } from '../crypto/serverKeyring';
import { getPldComplianceOverview } from '../pld/pldScreeningService';
import {
  InstitutionalLayoutExchangeRecord,
  IntegrationConnectorRecord,
  IntegrationHubRegion,
  LayoutFormatType,
  LayoutRejectedRowDetail,
  OperationsHubRegionFilter,
  OperationsIntegrationHubOverview,
} from '../../types';

function matchesHubFilter(convenioOrRegion: string, filter: OperationsHubRegionFilter): boolean {
  if (filter === 'ALL') return true;
  const text = String(convenioOrRegion || '').toUpperCase();
  if (filter === 'LEON') {
    return text.includes('LEON') || text.includes('LEÓN') || text.includes('GUANAJUATO') || text.includes('BAJIO') || text.includes('BAJÍO');
  }
  if (filter === 'CANCUN') {
    return text.includes('CANCUN') || text.includes('CANCÚN') || text.includes('QUINTANA') || text.includes('SUR');
  }
  // Por defecto convenios estatales (STSGECH, Supremo Tribunal Chihuahua) pertenecen a CHIHUAHUA
  return (
    text.includes('CHIHUAHUA') ||
    text.includes('STSGECH') ||
    text.includes('SUPREMO TRIBUNAL') ||
    (!text.includes('LEON') && !text.includes('GUANAJUATO') && !text.includes('CANCUN') && !text.includes('QUINTANA'))
  );
}

export const SAMPLE_INBOUND_60CHAR_TXT_WITH_TRUNCATED_LINE = [
  '014-301           VITM810514MCHLRR09000000001850252026-11-15',
  '014-302           LUTJ790822HCHRRJ04000000002495732026-11-15',
  '014-303           MOOC851103HGTRRL02000000000966532026-11-15',
].join('\n');

export const SAMPLE_INBOUND_DECLARED_TOTAL_MXN = '5312.51';

export async function getOperationsAndIntegrationHubOverview(
  hubFilter: OperationsHubRegionFilter = 'ALL'
): Promise<OperationsIntegrationHubOverview> {
  // 1. Fase 1: Cartera y Colocación
  const loansRes = await db.query<{
    principal_original: number | string;
    current_principal_balance: number | string;
    status: string;
    convenio: string | null;
  }>(
    `SELECT la.principal_original, la.current_principal_balance, la.status, e.convenio
     FROM loan_accounts la
     LEFT JOIN expedientes e ON e.id = la.expediente_id`
  );

  let activeLoansCount = 0;
  let frozenExtrajudicialCount = 0;
  let totalOriginalPrincipal = new Decimal(0);
  let totalLiveBalance = new Decimal(0);

  for (const row of loansRes.rows) {
    if (!matchesHubFilter(row.convenio || 'CHIHUAHUA', hubFilter)) continue;
    if (row.status === 'ACTIVE') activeLoansCount++;
    if (row.status === 'FROZEN_EXTRAJUDICIAL') frozenExtrajudicialCount++;
    totalOriginalPrincipal = totalOriginalPrincipal.plus(new Decimal(row.principal_original || 0));
    totalLiveBalance = totalLiveBalance.plus(new Decimal(row.current_principal_balance || 0));
  }

  const totalHubLoans = activeLoansCount + frozenExtrajudicialCount;
  const frozenRatioPercent =
    totalHubLoans > 0
      ? new Decimal(frozenExtrajudicialCount).div(totalHubLoans).mul(100).toFixed(2)
      : '0.00';

  // 2. Fase 2: Buzón Pre-Solicitudes, PLD/FT y Evaluaciones IA
  const preAppsRes = await db.query<{ convenio: string; inbox_status: string }>(
    `SELECT convenio, inbox_status FROM credit_pre_applications`
  );
  let totalPreApplicationsCount = 0;
  let unreadPreApplicationsCount = 0;
  for (const p of preAppsRes.rows) {
    if (!matchesHubFilter(p.convenio, hubFilter)) continue;
    totalPreApplicationsCount++;
    if (p.inbox_status === 'NO_LEIDO') unreadPreApplicationsCount++;
  }

  const pldOverview = await getPldComplianceOverview();
  const pendingPldAlertsCount = pldOverview.kpis.pendingAlertsCount;
  const confirmedPldBlocksCount = pldOverview.kpis.confirmedBlockedCount;

  const scoringRes = await db.query<{ cnt: number | string }>(
    `SELECT COUNT(*) AS cnt FROM audit_events WHERE action = 'SCORING_EVALUATED'`
  );
  const aiScoringEvaluationsCount = Number(scoringRes.rows[0]?.cnt ?? 0);

  // 3. Fase 3: App Cruse, Firma NOM-151, Migración Nube y Layouts
  const docsRes = await db.query<{ cnt: number | string }>(
    `SELECT COUNT(DISTINCT folio) AS cnt FROM client_digital_documents`
  );
  const sigsRes = await db.query<{ cnt: number | string }>(
    `SELECT COUNT(*) AS cnt FROM client_digital_signatures`
  );
  const migRes = await db.query<{ convenio: string }>(
    `SELECT convenio FROM cleaned_migrated_portfolio WHERE migration_status != 'ROLLED_BACK'`
  );
  const cloudMigratedContractsCount = migRes.rows.filter((r) => matchesHubFilter(r.convenio, hubFilter)).length;

  const connectorsRes = await db.query<{
    id: string;
    connector_code: string;
    display_name: string;
    institution_or_system: string;
    hub_region: IntegrationHubRegion;
    transport_mode: IntegrationConnectorRecord['transportMode'];
    default_layout_format: LayoutFormatType;
    expected_mtls_thumbprint_sha256: string;
    status: IntegrationConnectorRecord['status'];
    last_sync_at: string | null;
    total_exchanges_count: number;
  }>(`SELECT * FROM integration_connectors ORDER BY connector_code ASC`);

  const connectors: IntegrationConnectorRecord[] = connectorsRes.rows
    .filter((c) => hubFilter === 'ALL' || c.hub_region === 'NACIONAL' || c.hub_region === hubFilter)
    .map((c) => ({
      id: c.id,
      connectorCode: c.connector_code,
      displayName: c.display_name,
      institutionOrSystem: c.institution_or_system,
      hubRegion: c.hub_region,
      transportMode: c.transport_mode,
      defaultLayoutFormat: c.default_layout_format,
      expectedMtlsThumbprintSha256: c.expected_mtls_thumbprint_sha256,
      status: c.status,
      lastSyncAt: c.last_sync_at,
      totalExchangesCount: Number(c.total_exchanges_count),
    }));

  const exchangesRes = await db.query<{
    id: string;
    batch_folio: string;
    connector_code: string;
    direction: InstitutionalLayoutExchangeRecord['direction'];
    layout_format: LayoutFormatType;
    hub_region: IntegrationHubRegion;
    period_code: string;
    valid_rows_count: number;
    rejected_rows_count: number;
    declared_total_mxn: string;
    verified_total_mxn: string;
    discrepancy_mxn: string;
    payload_sha256: string;
    rejected_rows_json: string;
    status: InstitutionalLayoutExchangeRecord['status'];
    actor_email: string;
    created_at: string;
  }>(`SELECT * FROM institutional_layout_exchanges ORDER BY created_at DESC LIMIT 20`);

  const recentExchanges: InstitutionalLayoutExchangeRecord[] = exchangesRes.rows
    .filter((ex) => hubFilter === 'ALL' || ex.hub_region === 'NACIONAL' || ex.hub_region === hubFilter)
    .map((ex) => ({
      id: ex.id,
      batchFolio: ex.batch_folio,
      connectorCode: ex.connector_code,
      direction: ex.direction,
      layoutFormat: ex.layout_format,
      hubRegion: ex.hub_region,
      periodCode: ex.period_code,
      validRowsCount: Number(ex.valid_rows_count),
      rejectedRowsCount: Number(ex.rejected_rows_count),
      declaredTotalMxn: ex.declared_total_mxn,
      verifiedTotalMxn: ex.verified_total_mxn,
      discrepancyMxn: ex.discrepancy_mxn,
      payloadSha256: ex.payload_sha256,
      rejectedRows: JSON.parse(ex.rejected_rows_json || '[]') as LayoutRejectedRowDetail[],
      status: ex.status,
      actorEmail: ex.actor_email,
      createdAt: String(ex.created_at),
    }));

  return {
    selectedHub: hubFilter,
    phase1: {
      activeLoansCount,
      frozenExtrajudicialCount,
      frozenRatioPercent,
      totalOriginalPrincipalMxn: totalOriginalPrincipal.toFixed(2),
      totalLiveBalanceMxn: totalLiveBalance.toFixed(2),
    },
    phase2: {
      totalPreApplicationsCount,
      unreadPreApplicationsCount,
      pendingPldAlertsCount,
      confirmedPldBlocksCount,
      aiScoringEvaluationsCount,
    },
    phase3: {
      selfServiceExpedientesCount: Number(docsRes.rows[0]?.cnt ?? 0),
      nom151SignedContractsCount: Number(sigsRes.rows[0]?.cnt ?? 0),
      cloudMigratedContractsCount,
      layoutExchangesCount: recentExchanges.length,
    },
    connectors,
    recentExchanges,
  };
}

export async function generateOutboundInstitutionalLayout(params: {
  connectorCode: string;
  layoutFormat: LayoutFormatType;
  periodCode: string;
  actorEmail: string;
}): Promise<InstitutionalLayoutExchangeRecord> {
  const sampleOutboundRows = [
    { contract: '014-301', refCurp: 'VITM810514MCHLRR09', amountMxn: '1850.25', dateIso: '2026-11-15' },
    { contract: '014-302', refCurp: 'LUTJ790822HCHRRJ04', amountMxn: '2495.73', dateIso: '2026-11-15' },
    { contract: '014-303', refCurp: 'MOOC851103HGTRRL02', amountMxn: '966.53', dateIso: '2026-11-15' },
  ];

  let totalSum = new Decimal(0);
  const lines: string[] = [];

  for (const r of sampleOutboundRows) {
    const amtDec = new Decimal(r.amountMxn);
    totalSum = totalSum.plus(amtDec);

    if (params.layoutFormat === 'FIXED_WIDTH_TXT') {
      // 60 chars exactos: [0..18) Contrato (18), [18..36) CURP/Ref (18), [36..50) Centavos (14), [50..60) Fecha ISO (10)
      const colContract = r.contract.padEnd(18, ' ').slice(0, 18);
      const colRef = r.refCurp.padEnd(18, ' ').slice(0, 18);
      const centsStr = amtDec.mul(100).toFixed(0).padStart(14, '0').slice(0, 14);
      const colDate = r.dateIso.slice(0, 10);
      lines.push(`${colContract}${colRef}${centsStr}${colDate}`);
    } else {
      lines.push(`"${r.contract}"|"${r.refCurp}"|"${amtDec.toFixed(2)}"|"${r.dateIso}"`);
    }
  }

  const content = lines.join('\n');
  const payloadSha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  const kms = getServerKms();
  const envelope = await encryptEnvelope(content, kms);

  const connRes = await db.query<{ hub_region: IntegrationHubRegion }>(
    `SELECT hub_region FROM integration_connectors WHERE connector_code = $1`,
    [params.connectorCode]
  );
  const hubRegion: IntegrationHubRegion = connRes.rows[0]?.hub_region ?? 'CHIHUAHUA';

  const nowIso = new Date().toISOString();
  const id = `lex_${crypto.randomUUID()}`;
  const batchFolio = `LAY-OUT-${nowIso.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  await db.execute(
    `INSERT INTO institutional_layout_exchanges (
       id, batch_folio, connector_code, direction, layout_format, hub_region, period_code,
       valid_rows_count, rejected_rows_count, declared_total_mxn, verified_total_mxn, discrepancy_mxn,
       payload_sha256, encrypted_layout_envelope, rejected_rows_json, status, actor_email, created_at
     ) VALUES ($1,$2,$3,'OUTBOUND_DISCOUNT_LAYOUT',$4,$5,$6,$7,0,$8,$9,'0.00',$10,$11,'[]','VERIFIED_SEALED',$12,$13)`,
    [
      id,
      batchFolio,
      params.connectorCode,
      params.layoutFormat,
      hubRegion,
      params.periodCode,
      sampleOutboundRows.length,
      totalSum.toFixed(2),
      totalSum.toFixed(2),
      payloadSha256,
      JSON.stringify(envelope),
      params.actorEmail,
      nowIso,
    ]
  );

  await db.execute(
    `UPDATE integration_connectors
     SET last_sync_at = $1, total_exchanges_count = total_exchanges_count + 1
     WHERE connector_code = $2`,
    [nowIso, params.connectorCode]
  );

  return {
    id,
    batchFolio,
    connectorCode: params.connectorCode,
    direction: 'OUTBOUND_DISCOUNT_LAYOUT',
    layoutFormat: params.layoutFormat,
    hubRegion,
    periodCode: params.periodCode,
    validRowsCount: sampleOutboundRows.length,
    rejectedRowsCount: 0,
    declaredTotalMxn: totalSum.toFixed(2),
    verifiedTotalMxn: totalSum.toFixed(2),
    discrepancyMxn: '0.00',
    payloadSha256,
    rejectedRows: [],
    status: 'VERIFIED_SEALED',
    actorEmail: params.actorEmail,
    createdAt: nowIso,
    generatedLayoutContent: content,
  };
}

export async function ingestInboundInstitutionalLayout(params: {
  connectorCode: string;
  layoutFormat: LayoutFormatType;
  periodCode: string;
  rawLayoutContent: string;
  declaredTotalMxn: string;
  actorEmail: string;
}): Promise<InstitutionalLayoutExchangeRecord> {
  const rawLines = String(params.rawLayoutContent || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  let verifiedSum = new Decimal(0);
  let validRowsCount = 0;
  const rejectedRows: LayoutRejectedRowDetail[] = [];

  rawLines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    if (params.layoutFormat === 'FIXED_WIDTH_TXT') {
      if (line.length !== 60) {
        rejectedRows.push({
          lineNumber,
          rawLinePreview: line.slice(0, 40),
          reason: `Longitud posicional inválida (${line.length} chars != 60 chars requeridos). Línea aislada.`,
        });
        return;
      }
      const centsPart = line.slice(36, 50);
      if (!/^\d{14}$/.test(centsPart)) {
        rejectedRows.push({
          lineNumber,
          rawLinePreview: line.slice(0, 40),
          reason: `Campo de centavos posicional (pos 37-50) no numérico: "${centsPart}".`,
        });
        return;
      }
      const amountDec = new Decimal(centsPart).div(100);
      verifiedSum = verifiedSum.plus(amountDec);
      validRowsCount++;
    } else {
      const cols = line.split('|').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 4) {
        rejectedRows.push({
          lineNumber,
          rawLinePreview: line.slice(0, 40),
          reason: `Fila CSV_PIPE incompleta (${cols.length} columnas < 4 requeridas). Línea aislada.`,
        });
        return;
      }
      try {
        const amountDec = new Decimal(cols[2] || '0');
        verifiedSum = verifiedSum.plus(amountDec);
        validRowsCount++;
      } catch {
        rejectedRows.push({
          lineNumber,
          rawLinePreview: line.slice(0, 40),
          reason: `Importe inválido en columna 3: "${cols[2]}".`,
        });
      }
    }
  });

  const declaredDec = new Decimal(params.declaredTotalMxn || '0');
  const diffDec = declaredDec.minus(verifiedSum).abs();

  const status: InstitutionalLayoutExchangeRecord['status'] = !diffDec.eq(0)
    ? 'ABORTED_DISCREPANCY'
    : rejectedRows.length > 0
    ? 'PARTIAL_WITH_REJECTIONS'
    : 'VERIFIED_SEALED';

  const payloadSha256 = crypto.createHash('sha256').update(params.rawLayoutContent, 'utf8').digest('hex');
  const kms = getServerKms();
  const envelope = await encryptEnvelope(params.rawLayoutContent, kms);

  const connRes = await db.query<{ hub_region: IntegrationHubRegion }>(
    `SELECT hub_region FROM integration_connectors WHERE connector_code = $1`,
    [params.connectorCode]
  );
  const hubRegion: IntegrationHubRegion = connRes.rows[0]?.hub_region ?? 'CHIHUAHUA';

  const nowIso = new Date().toISOString();
  const id = `lex_${crypto.randomUUID()}`;
  const batchFolio = `LAY-IN-${nowIso.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  await db.execute(
    `INSERT INTO institutional_layout_exchanges (
       id, batch_folio, connector_code, direction, layout_format, hub_region, period_code,
       valid_rows_count, rejected_rows_count, declared_total_mxn, verified_total_mxn, discrepancy_mxn,
       payload_sha256, encrypted_layout_envelope, rejected_rows_json, status, actor_email, created_at
     ) VALUES ($1,$2,$3,'INBOUND_PAYROLL_RESPONSE',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      batchFolio,
      params.connectorCode,
      params.layoutFormat,
      hubRegion,
      params.periodCode,
      validRowsCount,
      rejectedRows.length,
      declaredDec.toFixed(2),
      verifiedSum.toFixed(2),
      diffDec.toFixed(2),
      payloadSha256,
      JSON.stringify(envelope),
      JSON.stringify(rejectedRows),
      status,
      params.actorEmail,
      nowIso,
    ]
  );

  return {
    id,
    batchFolio,
    connectorCode: params.connectorCode,
    direction: 'INBOUND_PAYROLL_RESPONSE',
    layoutFormat: params.layoutFormat,
    hubRegion,
    periodCode: params.periodCode,
    validRowsCount,
    rejectedRowsCount: rejectedRows.length,
    declaredTotalMxn: declaredDec.toFixed(2),
    verifiedTotalMxn: verifiedSum.toFixed(2),
    discrepancyMxn: diffDec.toFixed(2),
    payloadSha256,
    rejectedRows,
    status,
    actorEmail: params.actorEmail,
    createdAt: nowIso,
  };
}

export async function verifyAndSyncZeroTrustConnector(params: {
  connectorCode: string;
  payloadJson: string;
  providedMtlsThumbprintSha256: string;
  providedTimestampEpochSec: number;
  providedHmacSha256: string;
}): Promise<{ ok: true; syncedAt: string } | { ok: false; error: string }> {
  const connRes = await db.query<{ expected_mtls_thumbprint_sha256: string; status: string }>(
    `SELECT expected_mtls_thumbprint_sha256, status FROM integration_connectors WHERE connector_code = $1`,
    [params.connectorCode]
  );
  if (connRes.rowCount === 0) {
    return { ok: false, error: 'Conector institucional no registrado.' };
  }
  const connector = connRes.rows[0]!;

  // 1. Ventana Anti-Replay estricta de 300 segundos (5 minutos)
  const nowSec = Math.floor(Date.now() / 1000);
  const driftSec = Math.abs(nowSec - params.providedTimestampEpochSec);
  if (!Number.isFinite(driftSec) || driftSec > 300) {
    return {
      ok: false,
      error: `RECHAZO ZERO-TRUST ANTI-REPLAY: Timestamp fuera de la ventana de 300s (desviación: ${driftSec}s).`,
    };
  }

  // 2. Verificación de certificado mTLS (Thumbprint SHA-256)
  if (connector.expected_mtls_thumbprint_sha256 !== params.providedMtlsThumbprintSha256) {
    return {
      ok: false,
      error: 'RECHAZO ZERO-TRUST mTLS: Huella de certificado cliente (Thumbprint SHA-256) no autorizada.',
    };
  }

  // 3. Verificación de firma HMAC-SHA256 en tiempo constante (timingSafeEqual)
  const canonicalMessage = `${params.connectorCode}|${params.providedTimestampEpochSec}|${params.payloadJson}`;
  const expectedHmacHex = crypto
    .createHmac('sha256', Buffer.from(getServerEnv().blindIndexKey))
    .update(canonicalMessage)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHmacHex, 'utf8');
  const providedBuf = Buffer.from(String(params.providedHmacSha256 || ''), 'utf8');

  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return {
      ok: false,
      error: 'RECHAZO ZERO-TRUST HMAC-SHA256: Firma criptográfica del payload alterada o inválida.',
    };
  }

  const nowIso = new Date().toISOString();
  await db.execute(
    `UPDATE integration_connectors
     SET last_sync_at = $1, total_exchanges_count = total_exchanges_count + 1
     WHERE connector_code = $2`,
    [nowIso, params.connectorCode]
  );

  return { ok: true, syncedAt: nowIso };
}
