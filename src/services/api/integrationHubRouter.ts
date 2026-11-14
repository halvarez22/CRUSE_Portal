/**
 * ENRUTADOR DEL TABLERO WEB DE OPERACIONES UNIFICADO (SINGLE PANE OF GLASS),
 * HUB DE LAYOUTS INSTITUCIONALES Y CONECTORES ZERO-TRUST (FASE 3.4)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { getServerEnv } from '../../config/serverEnv';
import {
  generateOutboundInstitutionalLayout,
  getOperationsAndIntegrationHubOverview,
  ingestInboundInstitutionalLayout,
  SAMPLE_INBOUND_60CHAR_TXT_WITH_TRUNCATED_LINE,
  SAMPLE_INBOUND_DECLARED_TOTAL_MXN,
  verifyAndSyncZeroTrustConnector,
} from '../operations/operationsIntegrationService';
import { auditEventStore } from '../audit/auditEventStore';
import { buildSourceSummary, extractClientIp } from '../audit/auditMask';
import { LayoutFormatType, OperationsHubRegionFilter } from '../../types';

export const integrationHubRouter = Router();

// GET /api/integration-hub/overview?hub=ALL|CHIHUAHUA|LEON|CANCUN
integrationHubRouter.get('/overview', requireAuth('operations_hub:read'), async (req: Request, res: Response) => {
  try {
    const rawHub = String(req.query.hub || 'ALL').toUpperCase();
    const hubFilter: OperationsHubRegionFilter =
      rawHub === 'CHIHUAHUA' || rawHub === 'LEON' || rawHub === 'CANCUN' ? rawHub : 'ALL';

    const overview = await getOperationsAndIntegrationHubOverview(hubFilter);
    return res.json({
      ...overview,
      sampleInbound60CharTxt: SAMPLE_INBOUND_60CHAR_TXT_WITH_TRUNCATED_LINE,
      sampleInboundDeclaredTotalMxn: SAMPLE_INBOUND_DECLARED_TOTAL_MXN,
    });
  } catch (err) {
    console.error('[IntegrationHub overview] Error:', err);
    return res.status(500).json({ error: 'Error al cargar el Tablero Web de Operaciones Unificado.' });
  }
});

// POST /api/integration-hub/generate-outbound
integrationHubRouter.post(
  '/generate-outbound',
  requireAuth('operations_hub:manage'),
  async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      const ip = extractClientIp(req.headers);
      const ua = String(req.headers['user-agent'] || '');

      const connectorCode = String(req.body?.connectorCode || 'CONN-STJ-CHIH');
      const layoutFormat: LayoutFormatType =
        req.body?.layoutFormat === 'CSV_PIPE' ? 'CSV_PIPE' : 'FIXED_WIDTH_TXT';
      const periodCode = String(req.body?.periodCode || '2026-Q22');

      const record = await generateOutboundInstitutionalLayout({
        connectorCode,
        layoutFormat,
        periodCode,
        actorEmail: auth.user.email,
      });

      await auditEventStore.append({
        actorEmail: auth.user.email,
        actorRole: auth.user.role,
        action: 'INSTITUTIONAL_LAYOUT_EXCHANGED',
        outcome: 'success',
        sourceIp: ip,
        sourceSummary: buildSourceSummary(ip, ua),
        details: `Layout saliente ${record.batchFolio} (${layoutFormat}) generado para ${connectorCode}. Total: $${record.verifiedTotalMxn} MXN (SHA-256: ${record.payloadSha256.slice(0, 16)}).`,
      });

      const overview = await getOperationsAndIntegrationHubOverview('ALL');
      return res.json({ ok: true, exchange: record, overview });
    } catch (err) {
      console.error('[IntegrationHub generate-outbound] Error:', err);
      return res.status(500).json({ error: 'Error al generar el layout institucional saliente.' });
    }
  }
);

// POST /api/integration-hub/ingest-inbound
integrationHubRouter.post(
  '/ingest-inbound',
  requireAuth('operations_hub:manage'),
  async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      const ip = extractClientIp(req.headers);
      const ua = String(req.headers['user-agent'] || '');

      const connectorCode = String(req.body?.connectorCode || 'CONN-STJ-CHIH');
      const layoutFormat: LayoutFormatType =
        req.body?.layoutFormat === 'CSV_PIPE' ? 'CSV_PIPE' : 'FIXED_WIDTH_TXT';
      const periodCode = String(req.body?.periodCode || '2026-Q22');
      const rawLayoutContent = String(
        req.body?.rawLayoutContent ?? SAMPLE_INBOUND_60CHAR_TXT_WITH_TRUNCATED_LINE
      );
      const declaredTotalMxn = String(req.body?.declaredTotalMxn ?? SAMPLE_INBOUND_DECLARED_TOTAL_MXN);

      const record = await ingestInboundInstitutionalLayout({
        connectorCode,
        layoutFormat,
        periodCode,
        rawLayoutContent,
        declaredTotalMxn,
        actorEmail: auth.user.email,
      });

      await auditEventStore.append({
        actorEmail: auth.user.email,
        actorRole: auth.user.role,
        action: 'INSTITUTIONAL_LAYOUT_EXCHANGED',
        outcome: record.status === 'ABORTED_DISCREPANCY' ? 'failure' : 'success',
        sourceIp: ip,
        sourceSummary: buildSourceSummary(ip, ua),
        details: `Layout entrante ${record.batchFolio} (${record.status}): ${record.validRowsCount} filas válidas ($${record.verifiedTotalMxn} MXN), ${record.rejectedRowsCount} líneas truncadas aisladas.`,
      });

      const overview = await getOperationsAndIntegrationHubOverview('ALL');
      return res.json({ ok: true, exchange: record, overview });
    } catch (err) {
      console.error('[IntegrationHub ingest-inbound] Error:', err);
      return res.status(500).json({ error: 'Error al ingestar y validar el layout institucional entrante.' });
    }
  }
);

// POST /api/integration-hub/test-connector
integrationHubRouter.post(
  '/test-connector',
  requireAuth('operations_hub:manage'),
  async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      const ip = extractClientIp(req.headers);
      const ua = String(req.headers['user-agent'] || '');

      const connectorCode = String(req.body?.connectorCode || 'CONN-ERP-SAP-CORE');
      const simulateTamperedHmac = Boolean(req.body?.simulateTamperedHmac);
      const simulateExpiredTimestamp = Boolean(req.body?.simulateExpiredTimestamp);

      const overviewBefore = await getOperationsAndIntegrationHubOverview('ALL');
      const conn = overviewBefore.connectors.find((c) => c.connectorCode === connectorCode);
      if (!conn) {
        return res.status(404).json({ error: 'Conector no encontrado.' });
      }

      const payloadJson = JSON.stringify({ ping: 'ZEROTRUST_SYNC', connectorCode, actor: auth.user.email });
      const nowSec = Math.floor(Date.now() / 1000);
      const providedTimestampEpochSec = simulateExpiredTimestamp ? nowSec - 600 : nowSec;

      const canonicalMessage = `${connectorCode}|${providedTimestampEpochSec}|${payloadJson}`;
      const validHmac = crypto
        .createHmac('sha256', Buffer.from(getServerEnv().blindIndexKey))
        .update(canonicalMessage)
        .digest('hex');

      const providedHmacSha256 = simulateTamperedHmac
        ? '000000000000000000000000000000000000000000000000000000000000dead'
        : validHmac;

      const result = await verifyAndSyncZeroTrustConnector({
        connectorCode,
        payloadJson,
        providedMtlsThumbprintSha256: conn.expectedMtlsThumbprintSha256,
        providedTimestampEpochSec,
        providedHmacSha256,
      });

      await auditEventStore.append({
        actorEmail: auth.user.email,
        actorRole: auth.user.role,
        action: 'CONNECTOR_ZEROTRUST_SYNC',
        outcome: result.ok ? 'success' : 'denied',
        sourceIp: ip,
        sourceSummary: buildSourceSummary(ip, ua),
        details: result.ok
          ? `Conector ${connectorCode} sincronizado con éxito (mTLS + HMAC-SHA256 + Anti-Replay 300s verificados).`
          : `Defensa Zero-Trust bloqueó sincronización en ${connectorCode}: ${result.error}`,
      });

      if (!result.ok) {
        return res.status(401).json({ ok: false, error: result.error });
      }

      const overview = await getOperationsAndIntegrationHubOverview('ALL');
      return res.json({ ok: true, syncedAt: result.syncedAt, overview });
    } catch (err) {
      console.error('[IntegrationHub test-connector] Error:', err);
      return res.status(500).json({ error: 'Error al probar el conector Zero-Trust.' });
    }
  }
);
