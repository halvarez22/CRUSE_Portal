/**
 * CONTRATOS DE TIPOS — FASE 2: IA, MOTOR OCR DETERMINISTA Y CUMPLIMIENTO ASISTIDO CNBV/UIF
 *
 * @implements CRUSE-APO-2026-042 (Fase 2.1 — Cimientos de Datos y Tipos)
 * @implements Regla 3 Anti-God-Object (< 600 líneas) y Regla 6 SQA (Cero any, precisión Decimal.js)
 */

import { PldListType } from './index';

// ============================================================================
// 1. TIPOS DE MATRIZ DE RIESGO INICIAL Y PERFIL TRANSACCIONAL (DIAGRAMA LIC. GERARDO)
// ============================================================================

export type CnbvRiskGrade = 'BAJO' | 'MEDIO' | 'ALTO';

export type OccupationRiskCategory =
  | 'PUBLIC_SERVANT_UNIONIZED'     // Base Sindicalizada / Gobierno (Giro Primario Cruse)
  | 'JUDICIAL_MAGISTRATE_ADMIN'    // Poder Judicial / Administrativo
  | 'HIGH_RISK_CASH_INTENSIVE'     // Actividades Vulnerables Art. 17 LFPIORPI / Efectivo intensivo
  | 'PEP_OR_HIGH_PUBLIC_OFFICIAL'  // Persona Políticamente Expuesta (PPE / PEP)
  | 'UNSPECIFIED_OR_INFORMAL';     // Sin comprobación formal

export type RiskListScreeningCategory =
  | 'CLEAN'
  | 'GRAY_LIST_PEP_OR_PRESUNTO'
  | 'BLACK_LIST_BLOCKED';

export interface RiskMatrixEvaluationInput {
  readonly occupationCategory: OccupationRiskCategory;
  readonly hubRegion: 'CHIHUAHUA' | 'LEON' | 'CANCUN' | 'OTHER';
  readonly productType: 'normal' | 'express' | 'especial';
  readonly listScreeningCategory: RiskListScreeningCategory;
  /** Monto de crédito solicitado en MXN (string exacto para Decimal.js) */
  readonly requestedAmountMxn: string;
  /** Cuota quincenal proyectada en MXN (string exacto para Decimal.js) */
  readonly projectedFortnightlyQuotaMxn: string;
  /** Ingreso neto quincenal extraído del recibo de nómina en MXN (string exacto para Decimal.js) */
  readonly extractedFortnightlyNetIncomeMxn: string;
}

export interface RiskMatrixFactorBreakdown {
  readonly occupationScore: string;
  readonly transactionalProfileScore: string;
  readonly geographicHubScore: string;
  readonly productChannelScore: string;
  readonly screeningListScore: string;
  readonly debtToIncomeRatio: string;
}

export interface RiskMatrixEvaluationResult {
  readonly weightedScore: string;
  readonly initialRiskGrade: CnbvRiskGrade;
  readonly forcedHighRiskByList: boolean;
  readonly requiresDirectionAuthorization: boolean;
  readonly breakdown: RiskMatrixFactorBreakdown;
  readonly semesterReviewDays: number;
}

// ============================================================================
// 2. TIPOS DEL MOTOR OCR DETERMINISTA + VALIDACIÓN RENAPO MOD-10 / SAT / INE
// ============================================================================

export type OcrDocumentSourceType = 'INE_FRONT' | 'INE_BACK' | 'PAYSTUB' | 'PROOF_OF_ADDRESS';

export type OcrValidationStatus =
  | 'VALIDATED'
  | 'LOW_CONFIDENCE_EXCEPTION'
  | 'DUPLICATE_DETECTED'
  | 'MANUAL_CORRECTED';

/**
 * Contrato de salida cruda del LLM (Groq Vision).
 * REGLA FORENSE: El LLM SOLO devuelve strings extraídos del documento, jamás cálculos numéricos.
 */
export interface RawLlmOcrStringsOutput {
  readonly document_type_detected: string;
  readonly extracted_full_name: string;
  readonly extracted_curp: string;
  readonly extracted_rfc: string;
  readonly extracted_voter_id: string;
  readonly extracted_address: string;
  readonly extracted_occupation: string;
  readonly extracted_fortnightly_net_income: string;
  readonly extracted_gross_income: string;
  readonly extracted_payroll_deductions: string;
  readonly readability_observations: string;
}

export interface MexicanIdValidationReport {
  readonly curpFormatValid: boolean;
  readonly curpCheckDigitMod10Valid: boolean;
  readonly rfcFormatValid: boolean;
  readonly voterIdFormatValid: boolean;
  readonly incomeFormatValid: boolean;
  readonly validationErrors: ReadonlyArray<string>;
}

export interface OcrFieldConfidenceBreakdown {
  readonly curpConfidence: string;
  readonly rfcConfidence: string;
  readonly voterIdConfidence: string;
  readonly fullNameConfidence: string;
  readonly addressConfidence: string;
  readonly incomeConfidence: string;
  readonly globalConfidenceScore: string;
}

export interface OcrDuplicateCheckResult {
  readonly isDuplicate: boolean;
  readonly duplicateReason: 'NONE' | 'DUPLICATE_IMAGE_HASH' | 'DUPLICATE_SUBJECT_CURP';
  readonly matchedExpedienteId: string | null;
  readonly documentImageSha256: string;
}

export interface DeterministicOcrExtractionResult {
  readonly documentType: OcrDocumentSourceType;
  readonly rawExtracted: RawLlmOcrStringsOutput;
  readonly idValidation: MexicanIdValidationReport;
  readonly confidence: OcrFieldConfidenceBreakdown;
  readonly duplicateCheck: OcrDuplicateCheckResult;
  readonly ocrStatus: OcrValidationStatus;
  readonly riskMatrix: RiskMatrixEvaluationResult;
  readonly serverRamBufferPurged: true;
  readonly processedAtIso: string;
}

// ============================================================================
// 3. TIPOS DE LISTA GRIS (¿AUTORIZA DIRECCIÓN?), RELOJ 60+3 DÍAS Y SITI 41 COLUMNAS
// ============================================================================

export type CnbvReportCategory =
  | 'ROR_RELEVANTE'             // Tipo '1': Operación Relevante (>= $7,500 USD en efectivo)
  | 'ROI_OPERACION'             // Tipo '2': Operación Inusual individual
  | 'ROI_OPERATIVA_FRACCIONADA' // Tipo '2': Operación Inusual por Operativa (Fraccionada >= $500 USD sumando >= $7,500 USD/mes)
  | 'ROI_EOPERATIVO_TENTATIVA'  // Tipo '2': Reporte Eoperativo (Tentativa rechazada por Dirección / sin operación)
  | 'ROI_24_HORAS'              // Tipo '2': Reporte de 24 Horas (Indicios concretos o Lista de Personas Bloqueadas)
  | 'ROIP_INTERNA_PREOCUPANTE'; // Tipo '3': Operación Interna Preocupante (Buzón de Denuncia de empleados/directivos)

export type TentativeAmountReportingMode =
  | 'ZERO_EOPERATIVO'
  | 'REQUESTED_AMOUNT_BLOCKED';

export type DirectionAuthorizationState =
  | 'NOT_REQUIRED'
  | 'PENDING_DIRECTION'
  | 'AUTHORIZED_CONTINUE'
  | 'REJECTED_GENERATE_INUSUAL';

export type CnbvSlaClockStatus =
  | 'ON_TIME'
  | 'WARNING_10_DAYS'
  | 'URGENT_24H'
  | 'SLA_EXPIRED'
  | 'SUBMITTED_TO_SITI'
  | 'ARCHIVED_NO_REPORT';

export interface ExpedienteComplianceProfileItem {
  readonly expedienteId: string;
  readonly documentImageSha256: string | null;
  readonly ocrConfidenceScore: string;
  readonly ocrStatus: OcrValidationStatus;
  readonly occupationCategory: OccupationRiskCategory;
  readonly occupationLabel: string;
  readonly fortnightlyNetIncomeMxn: string;
  readonly initialTransactionalProfileMxn: string;
  readonly riskMatrixScore: string;
  readonly initialRiskGrade: CnbvRiskGrade;
  readonly currentRiskGrade: CnbvRiskGrade;
  readonly directionAuthStatus: DirectionAuthorizationState;
  readonly directionAuthorizedBy: string | null;
  readonly directionAuthNotes: string | null;
  readonly directionAuthAt: string | null;
  readonly lastSemesterReviewAt: string;
  readonly nextSemesterReviewAt: string;
  readonly isSemesterReviewDue: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CnbvReportAndWhistleblowingItem {
  readonly id: string;
  readonly reportCategory: CnbvReportCategory;
  readonly sitiReportTypeCode: '1' | '2' | '3';
  readonly expedienteId: string | null;
  readonly subjectMaskedName: string;
  readonly subjectCurpMasked: string;
  readonly subjectRfcMasked: string;
  readonly hubCode: string;
  readonly operationAmountMxn: string;
  readonly operationAmountUsd: string;
  readonly appliedFxRateUsdMxn: string;
  readonly tentativeAmountMode: TentativeAmountReportingMode;
  readonly mandatoryCol40Prefix: 'NONE' | 'Reporte de 24 Horas' | 'Lista de Personas Bloqueadas';
  readonly col40OperationDescription: string;
  readonly col41InusualReasons: string;
  readonly isAnonymousWhistleblowing: boolean;
  readonly reporterRoleOrChannel: string;
  readonly detectedAt: string;
  readonly investigationDeadlineAt: string;
  readonly cccSessionAt: string | null;
  readonly cccDecision: 'PENDING_CCC' | 'REPORT_TO_UIF' | 'DISMISSED_WITH_JUSTIFICATION' | 'DIRECT_24H_BYPASS_CCC';
  readonly cccJustificationNotes: string | null;
  readonly uifTransmissionDeadlineAt: string | null;
  readonly slaClockStatus: CnbvSlaClockStatus;
  readonly remainingCalendarDaysForCcc: number;
  readonly retentionUntilYear: number; // +10 años conforme a Cap. VI Slide 12
  readonly createdAt: string;
}

// ============================================================================
// 4. DICCIONARIO DE LAS 41 COLUMNAS DEL LAYOUT OFICIAL .TXT SITI CNBV/UIF
// ============================================================================

export interface Siti41ColumnRow {
  readonly col01TipoReporte: '1' | '2' | '3';
  readonly col02PeriodoReporte: string;
  readonly col03Folio: string;
  readonly col04OrganoSupervisor: string;
  readonly col05ClaveSujetoObligado: string;
  readonly col06Localidad: string;
  readonly col07Sucursal: string;
  readonly col08TipoOperacion: string;
  readonly col09InstrumentoMonetario: string;
  readonly col10NumeroCuentaContrato: string;
  readonly col11Monto: string;
  readonly col12Moneda: string;
  readonly col13FechaOperacion: string;
  readonly col14FechaDeteccion: string;
  readonly col15Nacionalidad: string;
  readonly col16TipoPersona: string;
  readonly col17RazonSocial: string;
  readonly col18Nombre: string;
  readonly col19ApellidoPaterno: string;
  readonly col20ApellidoMaterno: string;
  readonly col21Rfc: string;
  readonly col22Curp: string;
  readonly col23FechaNacimientoConstitucion: string;
  readonly col24Domicilio: string;
  readonly col25Colonia: string;
  readonly col26CiudadPoblacion: string;
  readonly col27Telefono: string;
  readonly col28ActividadEconomica: string;
  readonly col29AgenteNombre: string;
  readonly col30AgenteApellidoPaterno: string;
  readonly col31AgenteApellidoMaterno: string;
  readonly col32AgenteRfc: string;
  readonly col33AgenteCurp: string;
  readonly col34ConsecutivoCuentaRelacionada: string;
  readonly col35NumeroCuentaRelacionada: string;
  readonly col36ClaveSujetoRelacionado: string;
  readonly col37TitularRelacionadoNombre: string;
  readonly col38TitularRelacionadoApellidoPaterno: string;
  readonly col39TitularRelacionadoApellidoMaterno: string;
  readonly col40DescripcionOperacion: string;
  readonly col41RazonesInusualidad: string;
}

// ============================================================================
// 5. DASHBOARD DE CONTROL DE CARGA SEMIAUTOMÁTICA CIB (LOGIC SYSTEMS)
// ============================================================================

export type CibBatchWorkflowStatus =
  | 'GENERATED_PENDING_OC'
  | 'APPROVED_BY_OC'
  | 'UPLOADED_TO_CIB';

export interface CibExportBatchItem {
  readonly id: string;
  readonly batchCode: string;
  readonly totalExpedientesIncluded: number;
  readonly excludedLowConfidenceOrPldCount: number;
  readonly totalPrincipalMxn: string;
  readonly totalFortnightlyQuotaMxn: string;
  readonly fileSha256Hash: string;
  readonly workflowStatus: CibBatchWorkflowStatus;
  readonly generatedByEmail: string;
  readonly reviewedByOcEmail: string | null;
  readonly reviewedByOcAt: string | null;
  readonly ocReviewNotes: string | null;
  readonly cibConfirmationFolio: string | null;
  readonly uploadedToCibAt: string | null;
  readonly createdAt: string;
}

export interface Phase2AssistedComplianceOverview {
  readonly fxRateUsdMxn: string;
  readonly relevantOpThresholdUsd: string;
  readonly relevantOpThresholdMxn: string;
  readonly fractionedSingleMinUsd: string;
  readonly fractionedSingleMinMxn: string;
  readonly complianceProfiles: ReadonlyArray<ExpedienteComplianceProfileItem>;
  readonly reportsAndWhistleblowing: ReadonlyArray<CnbvReportAndWhistleblowingItem>;
  readonly cibBatches: ReadonlyArray<CibExportBatchItem>;
  readonly kpis: {
    readonly validatedOcrCount: number;
    readonly exceptionQueueCount: number;
    readonly pendingDirectionGrayListCount: number;
    readonly semesterReviewsDueCount: number;
    readonly openRoipOrRoiCount: number;
    readonly highRiskClientsCount: number;
  };
}

export type GrayListAlertHitType = Extract<PldListType, 'PEP_NACIONAL' | 'SAT_69B_PRESUNTO'>;
