/**
 * ENRUTADOR DE FIRMA DIGITAL CON VALIDEZ LEGAL (NOM-151-SCFI-2016) Y BIOMETRÍA (FASE 3.2)
 *
 * Implementa:
 * - Construcción del Manifiesto Contractual Canónico sólo cuando los 4 documentos están completos.
 * - Validación de los 3 consentimientos legales y de la Prueba de Vida Activa (>= 1500 ms).
 * - Idempotencia transaccional y emisión de Constancia NOM-151 sellada en Bitácora Forense WORM.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/connectionPool';
import {
  buildCanonicalContractManifest,
  generateNom151ConstanciaAndEnvelope,
  validateLegalConsentsAndLiveness,
} from '../crypto/nom151SignatureService';
import { buildClientExpedienteSummary, verifyFolioAndPhoneWithLockout } from './clientSelfServiceRouter';
import { auditEventStore } from '../audit/auditEventStore';
import { buildSourceSummary, extractClientIp } from '../audit/auditMask';
import { ClientDigitalDocType, LegalConsentsAcceptance, LivenessChallengeProof } from '../../types';

export const digitalSignatureRouter = Router();

// POST /api/digital-signature/manifest
digitalSignatureRouter.post('/manifest', async (req: Request, res: Response) => {
  try {
    const ip = extractClientIp(req.headers);
    const ua = String(req.headers['user-agent'] || '');
    const { folio, phone } = req.body ?? {};

    const authCheck = await verifyFolioAndPhoneWithLockout({
      folio: String(folio ?? ''),
      phone10Digits: String(phone ?? ''),
      ip,
      ua,
    });

    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const summary = await buildClientExpedienteSummary(authCheck.preApp);
    if (summary.completedDocsCount < 4) {
      return res.status(400).json({
        error: `Para habilitar la Firma Digital NOM-151 debes completar primero los 4 documentos (${summary.completedDocsCount}/4 cargados).`,
      });
    }

    const docMap: Record<ClientDigitalDocType, string> = {
      INE_FRONT: '',
      INE_BACK: '',
      PAYSTUB: '',
      PROOF_OF_ADDRESS: '',
    };
    for (const d of summary.documents) {
      docMap[d.docType] = d.documentSha256;
    }

    const manifest = buildCanonicalContractManifest({
      folio: summary.folio,
      preApplicationId: summary.preApplicationId,
      applicantMaskedName: summary.applicantMaskedName,
      convenio: summary.convenio,
      productType: summary.productType,
      requestedAmountMxn: summary.requestedAmountMxn,
      termFortnights: summary.termFortnights,
      fortnightlyPaymentMxn: summary.estimatedFortnightlyPaymentMxn,
      catInformativePercent: summary.catInformativePercent,
      documentHashes: docMap,
    });

    return res.json({
      manifest,
      existingSignature: summary.signatureRecord,
    });
  } catch (err) {
    console.error('[DigitalSignature manifest] Error:', err);
    return res.status(500).json({ error: 'Error al generar el manifiesto contractual NOM-151.' });
  }
});

// POST /api/digital-signature/sign
digitalSignatureRouter.post('/sign', async (req: Request, res: Response) => {
  try {
    const ip = extractClientIp(req.headers);
    const ua = String(req.headers['user-agent'] || '');
    const { folio, phone, consents, liveness, signatureRequestId } = req.body ?? {};

    const authCheck = await verifyFolioAndPhoneWithLockout({
      folio: String(folio ?? ''),
      phone10Digits: String(phone ?? ''),
      ip,
      ua,
    });

    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const summary = await buildClientExpedienteSummary(authCheck.preApp);

    // Idempotencia: si ya fue firmado previamente, devuelve la constancia existente
    if (summary.signatureRecord) {
      return res.json({
        ok: true,
        idempotentReplay: true,
        signature: summary.signatureRecord,
      });
    }

    if (summary.completedDocsCount < 4) {
      return res.status(400).json({
        error: `Expediente incompleto (${summary.completedDocsCount}/4 documentos). No es posible firmar el contrato.`,
      });
    }

    const typedConsents: LegalConsentsAcceptance = {
      acceptedContractAndCat: Boolean(consents?.acceptedContractAndCat),
      acceptedPayrollDiscountMandate: Boolean(consents?.acceptedPayrollDiscountMandate),
      acceptedBiometricAndPrivacyNotice: Boolean(consents?.acceptedBiometricAndPrivacyNotice),
    };

    const typedLiveness: LivenessChallengeProof = {
      durationMs: Number(liveness?.durationMs ?? 0),
      livenessScore: String(liveness?.livenessScore ?? '0.96'),
      challengesPassed: Array.isArray(liveness?.challengesPassed) ? liveness.challengesPassed : [],
      biometricFrameBase64: liveness?.biometricFrameBase64,
    };

    const validation = validateLegalConsentsAndLiveness(typedConsents, typedLiveness);
    if (!validation.ok) {
      return res.status(422).json({ error: validation.error });
    }

    const docMap: Record<ClientDigitalDocType, string> = {
      INE_FRONT: '',
      INE_BACK: '',
      PAYSTUB: '',
      PROOF_OF_ADDRESS: '',
    };
    for (const d of summary.documents) {
      docMap[d.docType] = d.documentSha256;
    }

    const manifest = buildCanonicalContractManifest({
      folio: summary.folio,
      preApplicationId: summary.preApplicationId,
      applicantMaskedName: summary.applicantMaskedName,
      convenio: summary.convenio,
      productType: summary.productType,
      requestedAmountMxn: summary.requestedAmountMxn,
      termFortnights: summary.termFortnights,
      fortnightlyPaymentMxn: summary.estimatedFortnightlyPaymentMxn,
      catInformativePercent: summary.catInformativePercent,
      documentHashes: docMap,
    });

    const reqId = String(signatureRequestId || `SIGREQ-${summary.folio}-${Date.now()}`);
    const generated = await generateNom151ConstanciaAndEnvelope({
      manifest,
      consents: typedConsents,
      liveness: typedLiveness,
      signatureRequestId: reqId,
    });

    const id = `dsig_${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    await db.execute(
      `INSERT INTO client_digital_signatures (
         id, pre_application_id, folio, signature_request_id, contract_pre_sign_sha256,
         terms_hash, payroll_discount_hash, biometric_consent_hash, biometric_evidence_sha256,
         liveness_score, liveness_duration_ms, liveness_challenges_passed, psc_provider_id,
         trusted_timestamp_iso, nom151_constancia_sha256, nom151_constancia_base64,
         encrypted_signature_envelope, kek_version, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        id,
        generated.record.preApplicationId,
        generated.record.folio,
        generated.record.signatureRequestId,
        generated.record.contractPreSignSha256,
        generated.record.termsHash,
        generated.record.payrollDiscountHash,
        generated.record.biometricConsentHash,
        generated.record.biometricEvidenceSha256,
        generated.record.livenessScore,
        generated.record.livenessDurationMs,
        JSON.stringify(generated.record.livenessChallengesPassed),
        generated.record.pscProviderId,
        generated.record.trustedTimestampIso,
        generated.record.nom151ConstanciaSha256,
        generated.record.nom151ConstanciaBase64,
        generated.encryptedSignatureEnvelope,
        generated.kekVersion,
        nowIso,
      ]
    );

    await auditEventStore.append({
      actorEmail: 'autoservicio@cruse.mx',
      actorRole: 'sistema',
      action: 'NOM151_CONTRACT_SIGNED',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, ua),
      details: `Contrato firmado NOM-151 para folio ${summary.folio} (Constancia SHA-256: ${generated.record.nom151ConstanciaSha256.slice(0, 16)}, Liveness: ${generated.record.livenessDurationMs}ms).`,
    });

    return res.json({
      ok: true,
      idempotentReplay: false,
      signature: {
        id,
        ...generated.record,
        createdAt: nowIso,
      },
    });
  } catch (err) {
    console.error('[DigitalSignature sign] Error:', err);
    return res.status(500).json({ error: 'Error interno al emitir la Constancia NOM-151.' });
  }
});
