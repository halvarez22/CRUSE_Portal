/**
 * CONTRATOS ESTRICTOS DE INGESTA INTELIGENTE PLD/FT AGNÓSTICA AL LAYOUT
 *
 * @implements CRUSE-APO-2026-056 (Guardrails Forenses 1 a 8)
 * @implements Regla 6 SQA: Tipado explícito estricto, cero uso de `any`.
 */

import type { PldIdentifierType, PldListType, PldRiskLevel } from './index';

export const ALLOWED_PLD_COLUMN_ROLES = [
  'CURP',
  'RFC',
  'GENERIC_ID',
  'FULL_NAME',
  'FIRST_NAME',
  'PATERNAL_SURNAME',
  'MATERNAL_SURNAME',
  'CORPORATE_NAME',
  'LIST_TYPE',
  'OFFICIAL_REF',
  'PUBLICATION_DATE',
  'SAT_69B_STATUS',
  'IGNORE',
] as const;

export type CanonicalPldColumnRole = (typeof ALLOWED_PLD_COLUMN_ROLES)[number];

export type PldColumnMappingOverride = Readonly<Record<number, CanonicalPldColumnRole>>;

export type ColumnDetectionSource =
  | 'DETERMINISTIC_CONTENT'
  | 'DETERMINISTIC_HEADER'
  | 'GROQ_SEMANTIC_ZERO_PII'
  | 'USER_OVERRIDE';

export type PatternDensityTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * Huella estructural 100% Zero-PII enviada al asistente semántico LLM (Guardrail 2 + Adicional A).
 * Prohibido incluir hashes SHA-256 de PII, Blind Indexes, longitudes exactas con fechas o datos reales.
 */
export interface ZeroPiiColumnStructuralDescriptor {
  readonly columnIndex: number;
  readonly sanitizedHeaderLabel: string;
  readonly structuralMasks: ReadonlyArray<string>;
  readonly curpPatternTier: PatternDensityTier;
  readonly rfcPatternTier: PatternDensityTier;
  readonly corporatePatternTier: PatternDensityTier;
  readonly personNamePatternTier: PatternDensityTier;
  readonly datePatternTier: PatternDensityTier;
  readonly officialRefPatternTier: PatternDensityTier;
  readonly sat69bStatusPatternTier: PatternDensityTier;
}

export interface ZeroPiiStructuralPromptPayload {
  readonly fileExtensionHint: string;
  readonly hasDetectedHeaderRow: boolean;
  readonly totalColumns: number;
  readonly columns: ReadonlyArray<ZeroPiiColumnStructuralDescriptor>;
}

export interface InferredColumnProfile {
  readonly columnIndex: number;
  readonly rawHeaderLabel: string;
  readonly assignedRole: CanonicalPldColumnRole;
  readonly confidencePct: string; // Decimal.js ("0.00" - "100.00")
  readonly detectionSource: ColumnDetectionSource;
  readonly maskedSampleValue: string; // Siempre enmascarado Zero-PII
}

export interface MaskedPreviewRowSummary {
  readonly rowNumber: number;
  readonly resolvedListType: PldListType;
  readonly identifierType: PldIdentifierType;
  readonly identifierMasked: string;
  readonly subjectMaskedName: string;
  readonly riskLevel: PldRiskLevel;
  readonly officialReference: string;
  readonly publicationDate: string;
  readonly blindIndexPrefix: string;
}

export interface SmartPldFileAnalysisResult {
  readonly sourceFileHash: string;
  readonly canonicalPayloadHash: string;
  readonly delimiter: ',' | ';' | '\t' | '|';
  readonly hasHeaderRow: boolean;
  readonly detectedHeaderLineNumber: number; // 0 cuando hasHeaderRow === false
  readonly skippedTopBannerRowsCount: number;
  readonly inferenceEngineUsed: 'HYBRID_GROQ_AND_DETERMINISTIC' | 'DETERMINISTIC_CONTENT_FIRST';
  readonly overallConfidencePct: string; // Decimal.js ("0.00" - "100.00")
  readonly humanFriendlyExplanation: string;
  readonly columns: ReadonlyArray<InferredColumnProfile>;
  readonly stats: {
    readonly totalDataRowsRead: number;
    readonly validUniqueEntriesCount: number;
    readonly curpCount: number;
    readonly rfcCount: number;
    readonly nameOnlyCount: number;
    readonly isoCountryCount: number;
    readonly excludedCleared69bCount: number;
    readonly skippedEmptyOrBannerRowsCount: number;
    readonly invalidRowsCount: number;
  };
  readonly validationWarnings: ReadonlyArray<string>;
  readonly maskedPreviewRows: ReadonlyArray<MaskedPreviewRowSummary>;
}
