/**
 * SERVICIO DE DOSSIER EFÍMERO DE DICTAMINACIÓN PLD/FT (CNBV / ART. 95 BIS / LFPDPPP)
 *
 * Garantías forenses (CRUSE-APO-2026-082):
 * 1) Orden Atómico Fail-Closed: sella el evento WORM `PLD_ALERT_PII_REVEALED` ANTES
 *    de consultar/descifrar `encrypted_pii_payload`. Si el sellado falla, aborta sin revelar PII.
 * 2) Purga Criptográfica (Zeroization): tanto la DEK de 256 bits (`dekBytes`) como el
 *    buffer descifrado en claro (`decryptedBytes`) se sobrescriben con ceros (`.fill(0)`) en `finally`.
 * 3) Cero PII en logs, errores o bitácora WORM (`actorEmail` enmascarado; solo IDs técnicos en `details`).
 */

import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import {
  PldAlertRulingDossier,
  PldAlertStatus,
  PldListType,
  PldRiskLevel,
  UserRole,
} from '../../types';
import { db } from '../db/connectionPool';
import { EnvelopeEncryptedPayload, KmsProvider } from '../crypto/cryptoService';
import { getServerKms } from '../crypto/serverKeyring';
import { auditEventStore } from '../audit/auditEventStore';
import { buildSourceSummary, maskEmailForAudit } from '../audit/auditMask';

export type DossierAuditPayload = Parameters<typeof auditEventStore.append>[0];

export interface GetPldAlertDossierInput {
  readonly alertId: string;
  readonly actorEmail: string;
  readonly actorRole: UserRole;
  readonly sourceIp: string;
  readonly userAgent?: string | string[];
}

export interface PldAlertDossierDeps {
  readonly auditWriter?: (input: DossierAuditPayload) => Promise<unknown>;
  readonly kmsProvider?: () => KmsProvider;
  readonly onStepTrace?: (step: 'WORM_SEALED' | 'DECRYPT_EXECUTED') => void;
}

interface DecryptedSubjectFields {
  readonly fullName?: string;
  readonly curp?: string;
  readonly rfc?: string;
}

let dossierQueryQueue: Promise<unknown> = Promise.resolve();
function runSafeDbQuery<T>(fn: () => Promise<T>): Promise<T> {
  const next = dossierQueryQueue.then(fn, fn);
  dossierQueryQueue = next.then(() => undefined, () => undefined);
  return next;
}

export async function decryptEnvelopeWithZeroization(
  payload: EnvelopeEncryptedPayload,
  kms: KmsProvider
): Promise<DecryptedSubjectFields> {
  const subtle = crypto.webcrypto.subtle;
  let dekBytes: Uint8Array | null = null;
  let decryptedBytes: Uint8Array | null = null;

  try {
    dekBytes = await kms.unwrapKey(payload.wrappedDek, payload.kekVersion);
    const dekKey = await subtle.importKey(
      'raw',
      dekBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const iv = Buffer.from(payload.iv, 'base64');
    const cipherBytes = Buffer.from(payload.ciphertext, 'base64');
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      dekKey,
      cipherBytes
    );
    decryptedBytes = new Uint8Array(plainBuffer);
    const parsed = JSON.parse(new TextDecoder().decode(decryptedBytes)) as {
      fullName?: unknown;
      curp?: unknown;
      rfc?: unknown;
    };
    return {
      fullName: typeof parsed.fullName === 'string' && parsed.fullName.trim() ? parsed.fullName.trim() : undefined,
      curp: typeof parsed.curp === 'string' && parsed.curp.trim() ? parsed.curp.trim().toUpperCase() : undefined,
      rfc: typeof parsed.rfc === 'string' && parsed.rfc.trim() ? parsed.rfc.trim().toUpperCase() : undefined,
    };
  } catch {
    throw new Error('DOSSIER_DECRYPT_ERROR');
  } finally {
    if (dekBytes) dekBytes.fill(0);
    if (decryptedBytes) decryptedBytes.fill(0);
  }
}

export async function getPldAlertRulingDossier(
  input: GetPldAlertDossierInput,
  deps?: PldAlertDossierDeps
): Promise<PldAlertRulingDossier> {
  const cleanAlertId = String(input.alertId ?? '').trim();
  if (!cleanAlertId) {
    throw new Error('ALERT_NOT_FOUND');
  }

  const alertRes = await runSafeDbQuery(() =>
    db.query<{
      id: string;
      entity_type: 'EXPEDIENTE' | 'INVESTOR';
      entity_id: string;
      entity_masked_name: string;
      entity_masked_id: string;
      list_type: PldListType;
      risk_level: PldRiskLevel;
      official_reference: string;
      exposure_amount: string | number;
      detection_channel: 'BATCH_SCREENING' | 'REALTIME_ORIGINATION';
      projected_status: PldAlertStatus;
      created_at: string;
    }>(
      `SELECT pha.id, pha.entity_type, pha.entity_id, pha.entity_masked_name, pha.entity_masked_id,
              pha.list_type, pha.risk_level, pha.official_reference, pha.exposure_amount,
              pha.detection_channel,
              COALESCE(
                (SELECT par.resolution_status FROM pld_alert_resolutions par
                 WHERE par.hit_alert_id = pha.id ORDER BY par.created_at DESC, par.id DESC LIMIT 1),
                pha.status
              ) AS projected_status,
              pha.created_at
       FROM pld_hit_alerts pha
       WHERE pha.id = $1`,
      [cleanAlertId]
    )
  );

  const alert = alertRes.rows[0];
  if (!alert) {
    throw new Error('ALERT_NOT_FOUND');
  }

  // PASO 2 OBLIGATORIO (FAIL-CLOSED): Sellar evento WORM ANTES de leer o descifrar PII
  const auditWriter = deps?.auditWriter ?? ((ev: DossierAuditPayload) => auditEventStore.append(ev));
  const uaStr = Array.isArray(input.userAgent) ? input.userAgent[0] : input.userAgent;
  await auditWriter({
    actorEmail: maskEmailForAudit(input.actorEmail),
    actorRole: input.actorRole,
    action: 'PLD_ALERT_PII_REVEALED',
    outcome: 'success',
    sourceIp: input.sourceIp,
    sourceSummary: buildSourceSummary(input.sourceIp, uaStr),
    details: `Dossier PLD/FT consultado | Alerta: ${alert.id} | Entidad: ${alert.entity_type}:${alert.entity_id} | Lista: ${alert.list_type}`,
  });
  deps?.onStepTrace?.('WORM_SEALED');

  // PASO 3: Descifrado efímero con purga criptográfica (.fill(0) en finally)
  const kms = deps?.kmsProvider ? deps.kmsProvider() : getServerKms();
  let subjectFullName = alert.entity_masked_name;
  let subjectCurp: string | null = null;
  let subjectRfc: string | null = null;

  if (alert.entity_type === 'EXPEDIENTE') {
    const expRes = await runSafeDbQuery(() =>
      db.query<{ full_name: string | null; encrypted_pii_payload: string | null }>(
        `SELECT full_name, encrypted_pii_payload FROM expedientes WHERE id = $1`,
        [alert.entity_id]
      )
    );
    const exp = expRes.rows[0];
    if (exp?.full_name) subjectFullName = exp.full_name;
    if (exp?.encrypted_pii_payload) {
      deps?.onStepTrace?.('DECRYPT_EXECUTED');
      const plain = await decryptEnvelopeWithZeroization(
        JSON.parse(exp.encrypted_pii_payload) as EnvelopeEncryptedPayload,
        kms
      );
      if (plain.fullName) subjectFullName = plain.fullName;
      subjectCurp = plain.curp ?? null;
      subjectRfc = plain.rfc ?? null;
    }
  } else {
    const invRes = await runSafeDbQuery(() =>
      db.query<{ encrypted_name: string | null }>(
        `SELECT encrypted_name FROM investors WHERE id = $1`,
        [alert.entity_id]
      )
    );
    const inv = invRes.rows[0];
    if (inv?.encrypted_name) {
      const rawInv = inv.encrypted_name.trim();
      if (rawInv.startsWith('{') && rawInv.includes('"ciphertext"')) {
        deps?.onStepTrace?.('DECRYPT_EXECUTED');
        const plain = await decryptEnvelopeWithZeroization(
          JSON.parse(rawInv) as EnvelopeEncryptedPayload,
          kms
        );
        if (plain.fullName) subjectFullName = plain.fullName;
        subjectCurp = plain.curp ?? null;
        subjectRfc = plain.rfc ?? null;
      } else {
        subjectFullName = rawInv;
      }
    }
  }

  return {
    alertId: alert.id,
    entityType: alert.entity_type,
    entityId: alert.entity_id,
    subjectFullName,
    subjectCurp,
    subjectRfc,
    listType: alert.list_type,
    riskLevel: alert.risk_level,
    officialReference: alert.official_reference,
    exposureAmount: new Decimal(alert.exposure_amount || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    detectionChannel: alert.detection_channel,
    projectedStatus: alert.projected_status,
    createdAt: String(alert.created_at),
    auditEventSealed: true,
  };
}
