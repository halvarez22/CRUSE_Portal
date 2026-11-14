/**
 * TIPOS ESTRICTOS DE FASE 3.1 Y 3.2: APP CRUSE CLIENTE, SUBIDA ZERO-EXIF Y FIRMA NOM-151
 * Expedientes: CRUSE-APO-2026-047 / CRUSE-APO-2026-048 / CRUSE-APO-2026-062
 */

export type ClientDigitalDocType = 'INE_FRONT' | 'INE_BACK' | 'PAYSTUB' | 'PROOF_OF_ADDRESS';

export type ClientDocOcrStatus =
  | 'VALIDATED'
  | 'REQUIRES_MANUAL_REVIEW'
  | 'LOW_CONFIDENCE_EXCEPTION'
  | 'DUPLICATE_DETECTED'
  | 'MANUAL_CORRECTED';

export interface ClientDigitalDocumentRecord {
  id: string;
  preApplicationId: string;
  folio: string;
  docType: ClientDigitalDocType;
  documentSha256: string;
  previousDocumentSha256: string | null;
  isOverwrite: boolean;
  exifStripped: boolean;
  ocrConfidenceScore: string;
  ocrStatus: ClientDocOcrStatus;
  extractedSummaryPreview: string;
  createdAt: string;
}

export interface ClientExpedienteSummary {
  preApplicationId: string;
  folio: string;
  applicantMaskedName: string;
  phoneMasked: string;
  productType: string;
  convenio: string;
  requestedAmountMxn: string;
  termFortnights: number;
  estimatedFortnightlyPaymentMxn: string;
  catInformativePercent: string;
  completedDocsCount: number;
  totalRequiredDocsCount: 4;
  isReadyForSignature: boolean;
  documents: ClientDigitalDocumentRecord[];
  signatureRecord: ClientDigitalSignatureRecord | null;
}

export interface CanonicalContractManifest {
  folio: string;
  preApplicationId: string;
  applicantMaskedName: string;
  convenio: string;
  productType: string;
  requestedAmountMxn: string;
  termFortnights: number;
  fortnightlyPaymentMxn: string;
  totalToPayMxn: string;
  catInformativePercent: string;
  lifeInsuranceFortnightlyMxn: string;
  documentHashes: Record<ClientDigitalDocType, string>;
  contractPreSignSha256: string;
}

export interface LivenessChallengeProof {
  durationMs: number;
  livenessScore: string;
  challengesPassed: readonly ('BLINK_DETECTED' | 'HEAD_TURN_VERIFIED' | 'FACE_CENTERED')[];
  biometricFrameBase64?: string;
}

export interface LegalConsentsAcceptance {
  acceptedContractAndCat: boolean;
  acceptedPayrollDiscountMandate: boolean;
  acceptedBiometricAndPrivacyNotice: boolean;
}

export interface ClientDigitalSignatureRecord {
  id: string;
  preApplicationId: string;
  folio: string;
  signatureRequestId: string;
  contractPreSignSha256: string;
  termsHash: string;
  payrollDiscountHash: string;
  biometricConsentHash: string;
  biometricEvidenceSha256: string;
  livenessScore: string;
  livenessDurationMs: number;
  livenessChallengesPassed: string[];
  pscProviderId: string;
  trustedTimestampIso: string;
  nom151ConstanciaSha256: string;
  nom151ConstanciaBase64: string;
  createdAt: string;
}
