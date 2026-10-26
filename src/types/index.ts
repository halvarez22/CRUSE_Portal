/**
 * Contratos de tipos centralizados para el Ecosistema Microfinanciera Cruse
 * Conforme a la Regla 6 (SQA): TypeScript Estricto total
 */

export type ThemeMode = 'light' | 'dark';

export type ProductId = 'normal' | 'express' | 'especial';

export interface LoanProduct {
  id: ProductId;
  name: string;
  tagline: string;
  minAmount: number;
  maxAmount: number;
  terms: number[]; // Plazos disponibles en quincenas
  interestRateText: string;
  nominalRateFortnightly: number;
  nominalRateMonthly: number;
  annualRate: number;
  catInformativePercent: number;
  lifeInsuranceFortnightly: number;
  lifeInsuranceCoverageMxn: number;
  openingCommissionPercent: number;
  requiresProofOfAddress: boolean;
  requiresCreditBureau: boolean;
  disbursementTime: string;
}

export interface AmortizationRow {
  period: number;
  balance: string;
  capital: string;
  interest: string;
  vat: string;
  insurance: string;
  payment: string;
}

export interface SimulationResult {
  schedule: AmortizationRow[];
  fortnightlyPayment: number;
  monthlyPaymentEquivalent: number;
  totalToPay: number;
  totalInterest: number;
  totalVat: number;
  totalInsurance: number;
  catPercent: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isQuickPrompt?: boolean;
}

export interface CompanyInfo {
  name: string;
  shortName: string;
  tagline: string;
  foundedYear: number;
  hqCity: string;
  address: string;
  officePhone: string;
  cellPhone: string;
  email: string;
  website: string;
  businessHours: string;
  asofomMemberSince: number;
  qualityCertification: string;
  primaryAgreements: string[];
  uneContact: {
    title: string;
    email: string;
    phone: string;
    city: string;
  };
}

export interface RequirementItem {
  id: string;
  title: string;
  description: string;
  copies: number;
  appliesTo: 'all' | 'normal' | 'express';
  icon: 'id' | 'receipt' | 'home';
}

// ==============================================================================
// TIPOS DE FASE 2: AUTENTICACIÓN 2FA, AUDITORÍA WORM, ESCÁNER Y EXPEDIENTES
// ==============================================================================

export type UserRole = 'admin' | 'oficial_cumplimiento' | 'promotor';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  totpEnrolled: boolean;
  mustChangePassword?: boolean;
}

export interface AuthSession {
  user: AuthenticatedUser;
  token: string;
  expiresAt: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
}

/** Contexto de identidad del servidor: ÚNICA fuente del actor en endpoints privados (A.3). */
export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
}

/** Permisos de la matriz RBAC (fuente de verdad en src/config/rbacPolicy.ts). */
export type RbacPermission =
  | 'expedientes:create'
  | 'expedientes:list'
  | 'expedientes:activate'
  | 'audit:read'
  | 'reconciliation:process'
  | 'reconciliation:read'
  | 'reconciliation:sample-data'
  | 'reconciliation:manual-override'
  | 'special_credit:manage'
  | 'notes:manage'
  | 'funding:read'
  | 'funding:manage'
  | 'dashboard:read_kpis'
  | 'dashboard:read'
  | 'dashboard:read_pii'
  | 'users:manage'
  | 'credit_bureau:read'
  | 'credit_bureau:generate'
  | 'credit_bureau:catalogs_manage'
  | 'collections:read'
  | 'collections:manage'
  | 'restructures:execute'
  | 'pld:read'
  | 'pld:screen'
  | 'pld:manage_lists'
  | 'pld:resolve_alert'
  | 'executive:read'
  | 'executive:scoring'
  | 'executive:competitors_manage'
  | 'executive:internal_ai';

/** Datos de enrolamiento 2FA: solo se entregan mientras el usuario NO está enrolado. */
export interface TotpEnrollment {
  otpauthUri: string;
  manualKey: string;
}

/** Respuesta de POST /api/auth/login (paso 1: contraseña validada). */
export interface LoginChallengeResponse {
  requireTotp: true;
  tempToken: string;
  name: string;
  role: UserRole;
  totpEnrolled?: boolean;
  mustChangePassword?: boolean;
  maskedPhone?: string;
  enrollment?: TotpEnrollment;
  recoveryCodes?: string[];
}

export interface UserUpdateFieldDiff {
  field: 'name' | 'role' | 'phoneNumber' | 'active' | 'totpEnrolled' | 'passwordHash' | 'mustChangePassword';
  before: string | boolean | null;
  after: string | boolean | null;
}

export interface UserUpdateAuditDiff {
  targetUserId: string;
  targetEmail: string;
  changes: UserUpdateFieldDiff[];
  totpReset: boolean;
  passwordChanged: boolean;
  sessionsRevoked: number;
  pendingChallengesPurged: number;
}

export type AuditAction =
  | 'LOGIN_2FA_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'SMS_RATE_LIMIT_EXCEEDED'
  | 'LOGOUT'
  | 'ACCESS_DENIED'
  | 'EXPEDIENTE_CREATE'
  | 'EXPEDIENTE_SYNC'
  | 'EXPEDIENTE_PURGE'
  | 'EXPEDIENTE_VIEW'
  | 'EXPEDIENTE_ACTIVATE'
  | 'LAYOUT_SIF_GENERATE'
  | 'SCREEN_VIEW'
  | 'RECONCILIATION_BATCH_SEALED'
  | 'RECONCILIATION_BATCH_REJECTED'
  | 'PAYMENT_APPLIED'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'CONFIG_CHANGE'
  | 'CREDIT_BUREAU_REPORT_GENERATED'
  | 'CREDIT_BUREAU_CATALOG_UPDATED'
  | 'LOAN_FROZEN_EXTRAJUDICIAL'
  | 'LOAN_AGREEMENT_REGISTERED'
  | 'LOAN_SUSPENSION_UPDATED'
  | 'LOAN_RESTRUCTURED'
  | 'PAYROLL_EMISSION_GENERATED'
  | 'PAYROLL_FILE_PREVIEWED'
  | 'PLD_LIST_INGESTED'
  | 'PLD_PORTFOLIO_SCREENED'
  | 'PLD_HIT_DETECTED'
  | 'PLD_ALERT_RESOLVED'
  | 'SCORING_EVALUATED'
  | 'COMPETITOR_BENCHMARK_UPDATED'
  | 'INTERNAL_AI_QUERY';

export interface AuditEvent {
  id: string;
  ts: string;
  actorEmail: string;
  actorRole: UserRole | 'sistema';
  action: AuditAction;
  outcome: 'success' | 'failure' | 'denied';
  sourceIp: string;
  sourceSummary: string;
  curpMasked?: string;
  blindCurpPrefix?: string;
  expedienteId?: string;
  details?: string;
  prevHash: string;
  recordHash: string;
}

export interface IneQualityFlags {
  isBlur: boolean;
  isTooDark: boolean;
  isTooBright: boolean;
  isTilted: boolean;
  isAcceptable: boolean;
  laplacianScore: number;
  avgBrightness: number;
  edgeRatio: number;
  feedbackText: string;
}

export interface ExpedienteItem {
  id: string;
  createdAt: string;
  convenio?: string;
  fullName: string;
  curpMasked: string;
  curp?: string;
  blindCurp: string;
  voterId?: string;
  address: string;
  phone: string;
  requestedAmount: number;
  fortnightlyPayment?: number;
  termFortnights: number;
  productType: ProductId;
  status: 'capturado' | 'conciliado' | 'aprobado' | 'rechazado' | 'activo' | 'liquidado' | 'revision_pld' | 'rechazado_pld';
  promotorEmail: string;
  encryptedThumbPayload?: string;
  encryptedPiiPayload?: string;
  kekVersion?: number;
}

export type SyncAckSuccess = {
  ok: true;
  status: 200 | 409;
  syncId: string;
  expedienteId: string;
  thumbSaved?: boolean;
};

export type SyncAckFailure = {
  ok: false;
  status: number;
  error: string;
};

export type SyncAck = SyncAckSuccess | SyncAckFailure;

// ==============================================================================
// TIPOS DE FASE 4: MOTOR DE CONCILIACIÓN QUINCENAL AUTOMATIZADO
// ==============================================================================

export type ReconciliationItemStatus =
  | 'MATCH_EXACT'
  | 'DISCREPANCY_UNDERPAYMENT'
  | 'MISSING_IN_PAYROLL'
  | 'DISCREPANCY_OVERPAYMENT'
  | 'SUSPENDED_IN_PAYROLL'
  | 'NOT_IN_PORTFOLIO';

export interface PayrollRecordInput {
  curp: string;
  employeeName: string;
  actualPayment: number;
  agreementName?: string;
  contractNumber?: string;
}

export interface ReconciliationItem {
  id: string;
  batchId: string;
  expedienteId?: string;
  loanAccountId?: string;
  contractNumber?: string;
  blindCurp: string;
  curpMasked: string;
  employeeName: string;
  expectedPayment: number;
  actualPayment: number;
  difference: number;
  status: ReconciliationItemStatus;
  auditNotes: string;
}

export interface ReconciliationBatch {
  id: string;
  createdAt: string;
  agreementName: string;
  fortnightPeriod: string;
  totalRecords: number;
  totalAmountExpected: number;
  totalAmountReceived: number;
  status: 'procesado' | 'cerrado_con_discrepancias' | 'conciliado_total';
  officerEmail: string;
  batchManifestHash: string;
  sourceFileHash?: string;
  notes?: string;
  items?: ReconciliationItem[];
}

export interface ReconciliationProcessResult {
  batch: ReconciliationBatch;
  items: ReconciliationItem[];
  summary: {
    totalRecords: number;
    matchExactCount: number;
    underpaymentCount: number;
    missingInPayrollCount: number;
    overpaymentCount: number;
    suspendedInPayrollCount?: number;
    notInPortfolioCount?: number;
    totalExpected: number;
    totalReceived: number;
    netDifference: number;
  };
  sourceFileHash?: string;
  signedActaText?: string;
  sifCsvText?: string;
}

export interface ConvenioCatalogItem {
  code: string;
  displayName: string;
  defaultFrequency: string;
  chargesLifeInsurance: boolean;
  sendsUnionLetter: boolean;
  activeLoansCount: number;
  suspendedLeaveCount: number;
  expectedFortnightlyTotal: string;
}

export interface PayrollEmissionRow {
  loanAccountId: string;
  expedienteId: string;
  contractNumber: string;
  unionOfficialLetterNo: string;
  blindCurpPrefix: string;
  curpMasked: string;
  maskedName: string;
  productType: string;
  projectedStatus: 'ACTIVE' | 'SUSPENDED_LEAVE';
  expectedDeductionOrStatus: string;
  liveBalance: string;
}

export interface PayrollIngestionPreviewResult {
  sourceFileHash: string;
  agreementName: string;
  fortnightPeriod: string;
  summary: {
    totalRecords: number;
    matchExactCount: number;
    underpaymentCount: number;
    missingInPayrollCount: number;
    overpaymentCount: number;
    suspendedInPayrollCount: number;
    notInPortfolioCount: number;
    totalExpected: number;
    totalReceived: number;
    netDifference: number;
  };
  items: ReconciliationItem[];
  warnings: string[];
}

// ==============================================================================
// TIPOS DE FASE 5 (CRUSE-APO-2026-024): MOTOR DE REPORTE A CÍRCULO DE CRÉDITO (SIC)
// ==============================================================================

export type CreditBureauPersonScope = 'PF' | 'PM' | 'ALL';

export interface CreditBureauCatalogItem {
  id: string;
  catalogGroup: string;
  code: string;
  description: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface CreditBureauValidationIssue {
  expedienteId: string;
  blindCurpPrefix: string;
  loanAccountId: string;
  contractNumber: string;
  severity: 'WARNING' | 'ERROR';
  code: string;
  message: string;
}

export interface CreditBureauPreviewRow {
  loanAccountId: string;
  expedienteId: string;
  blindCurpPrefix: string;
  contractNumber: string;
  personType: 'FISICA' | 'MORAL';
  convenio: string;
  maskedName: string;
  curpMasked: string;
  rfcMasked: string;
  productType: string;
  loanStatus: string;
  paymentFrequencySic: 'Q' | 'M' | 'S' | 'C' | 'U';
  termPeriods: number;
  termMonthsSic: number;
  originalPrincipal: string;
  currentBalance: string;
  pastDueBalance: string;
  scheduledPayment: string;
  daysPastDue: number;
  paymentStatusSic: string;
  observationCode: string | null;
  openedDateSic: string;
  cutoffDateSic: string;
}

export interface CreditBureauControlTotals {
  totalAccountsReported: number;
  totalPfAccounts: number;
  totalPmAccounts: number;
  totalFrozenExtrajudicialAccounts: number;
  totalCurrentBalance: string;
  totalPastDueBalance: string;
  totalNameElements: number;
  totalAddressElements: number;
  totalEmploymentElements: number;
}

export interface CreditBureauReportRecord {
  id: string;
  reportingMonth: string;
  manifestHash: string;
  createdAt: string;
  totalAccounts: number;
  totalReportedBalance: string;
}

export interface CreditBureauGenerateResult {
  reportId?: string;
  reportingMonth: string;
  cutoffDateIso: string;
  cutoffDateYyyyMmDd: string;
  officialFileNameBase: string;
  manifestHash: string;
  controlTotals: CreditBureauControlTotals;
  previewRows: CreditBureauPreviewRow[];
  validationIssues: CreditBureauValidationIssue[];
  pfCsvContent?: string;
  pfPipeContent?: string;
  pmCsvContent?: string;
}


// TIPOS DE CRUSE-APO-2026-025 & 027: COBRANZA, REESTRUCTURAS Y PLD/FT ZERO-PII
export type ProjectedLoanOperationalStatus = 'ACTIVE' | 'SUSPENDED_LEAVE' | 'FROZEN_EXTRAJUDICIAL' | 'RESTRUCTURED' | 'PAID_OFF';
export type SuspensionOrFreezeReason = 'LICENCIA_SIN_GOCE' | 'BAJA_LABORAL' | 'COBRANZA_EXTRAJUDICIAL' | 'DEMANDA_JUDICIAL' | 'CONVENIO_EXTRAJUDICIAL';
export type InsuranceEnrollmentStatus = 'ACTIVE' | 'EXCLUDED_AGE_OVER_65' | 'EXCLUDED_DEMANDA' | 'EXCLUDED_CONVENIO' | 'CLOSED';

export interface LoanPortfolioRiskRow {
  loanAccountId: string; contractNumber: string; expedienteId: string; convenio: string;
  productType: 'NOMINA_NORMAL' | 'EXPRESS' | 'ESPECIAL'; paymentFrequency: string; termPeriods: number;
  blindCurpPrefix: string; maskedName: string; curpMasked: string; rfcMasked: string;
  principalOriginal: string; liveBalance: string; fortnightlyPayment: string;
  projectedStatus: ProjectedLoanOperationalStatus;
  activeSuspensionId: string | null; activeSuspensionReason: SuspensionOrFreezeReason | null; activeSuspensionStartPeriod: string | null;
  restructuredIntoLoanId: string | null; restructuredIntoContract: string | null;
  insuranceStatus: InsuranceEnrollmentStatus; insuredAmount: string; periodPremium: string;
  sicObservationPreview: string | null; latestNoteContent: string | null; activatedAtIso: string;
}

export interface PortfolioRiskSummary {
  totalLoans: number; activeCount: number; frozenExtrajudicialCount: number; suspendedLeaveCount: number;
  restructuredCount: number; paidOffCount: number; excludedInsuranceCount: number;
  totalLiveBalance: string; totalFrozenBalance: string;
}

export type PldListType = 'SAT_69B_DEFINITIVO' | 'SAT_69B_PRESUNTO' | 'UIF_PERSONAS_BLOQUEADAS' | 'OFAC_SDN' | 'PEP_NACIONAL';
export type PldIdentifierType = 'CURP' | 'RFC' | 'NOMBRE';
export type PldRiskLevel = 'CRITICAL_BLOCK' | 'HIGH_EDD_REQUIRED' | 'MEDIUM_MONITORING';
export type PldAlertStatus = 'PENDING_REVIEW' | 'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE';

export interface PldRiskEntryItem {
  id: string; listType: PldListType; identifierType: PldIdentifierType;
  blindIndexPrefix: string; identifierMasked: string; subjectMaskedName: string;
  riskLevel: PldRiskLevel; officialReference: string; publicationDate: string;
  sourceFileHash: string; recordedBy: string; createdAt: string;
}

export interface PldHitAlertItem {
  id: string; screeningBatchId: string | null; riskEntryId: string;
  entityType: 'EXPEDIENTE' | 'INVESTOR'; entityId: string; blindIndexPrefix: string;
  entityMaskedId: string; entityMaskedName: string; listType: PldListType;
  riskLevel: PldRiskLevel; officialReference: string; exposureAmount: string;
  detectionChannel: 'BATCH_SCREENING' | 'REALTIME_ORIGINATION'; projectedStatus: PldAlertStatus;
  latestResolutionNotes: string | null; latestResolvedBy: string | null; latestResolvedAt: string | null; createdAt: string;
}

export interface PldScreeningBatchSummary {
  id: string; createdAt: string; officerEmail: string;
  totalExpedientesScreened: number; totalInvestorsScreened: number; totalRiskEntriesEvaluated: number;
  hitsDetectedCount: number; newAlertsCreatedCount: number; batchManifestHash: string; certificateActa: string;
}

export interface PldComplianceOverview {
  kpis: {
    totalRiskEntries: number; sat69bCount: number; uifOfacCount: number; pepCount: number;
    pendingAlertsCount: number; confirmedBlockedCount: number; clearedOrFalsePositiveCount: number;
    totalExposureBlockedOrPending: string;
  };
  riskEntries: PldRiskEntryItem[]; alerts: PldHitAlertItem[]; latestBatch: PldScreeningBatchSummary | null;
}

export * from './executive';
