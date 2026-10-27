/**
 * CONTRATOS DE TIPOS EJECUTIVOS, COMERCIALES, SCORING Y ASISTENTE IA INTERNO
 * Expediente: CRUSE-APO-2026-029 (Bloques B y C)
 * Conforme a la Regla 3 (Anti-God-Object) y Regla 6 (SQA TypeScript Estricto — Cero `any`).
 */

import { AmortizationRow, ProductId } from './index';

export type HubRegion = 'CHIHUAHUA' | 'LEON' | 'CANCUN';
export type HubFilterOption = 'ALL' | HubRegion;
export type DelinquencySemaphore = 'VERDE' | 'AMARILLO' | 'ROJO';
export type RiskLevelClassification = 'BAJO' | 'MEDIO' | 'ALTO';

export type ExecutiveTabId =
  | 'pitch-deck'
  | 'roi-simulator'
  | 'credit-scoring'
  | 'competitor-matrix'
  | 'national-hubs';

export interface PitchSlideItem {
  id: number;
  title: string;
  subtitle: string;
  category: string;
  investorNotes: string;
  highlights: string[];
  metrics: Array<{ label: string; value: string; accent?: string }>;
}

export interface ExpansionHubItem {
  id: string;
  hubCode: HubRegion;
  name: string;
  region: string;
  phase: string;
  launchMonth: string;
  targetEmployees: number;
  targetAgreements: string[];
  projectedPortfolioMillions: number;
  status: 'active' | 'in-preparation' | 'planned';
  coordinates: { x: number; y: number };
  description: string;
  keyInstitutions: string[];
}

export interface OperationsManualStep {
  id: number;
  title: string;
  manualProcess: string;
  digitalProcess: string;
  aiEnhancement: string;
  slaBefore: string;
  slaAfter: string;
  responsibleRole: string;
}

export interface CompetitorBenchmark {
  id: string;
  name: string;
  productName: string;
  sampleLoan: number;
  sampleTermQuincenas: number;
  sampleFortnightlyPayment: number;
  sampleTotalPayment: number;
  annualInterestRate: string;
  commissions: string;
  targetAudience: string;
  requiresBureau: boolean;
  speed: string;
  isCruse: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface PortfolioRoiRealMetrics {
  realPlacedCapital: number;
  realActiveCapital: number;
  realActiveLoansCount: number;
  realInvestorCapitalCommitted: number;
  realDefaultRatePercent: number;
  realExpressSharePercent: number;
  hubBreakdown: Record<HubRegion, { loansCount: number; activeBalance: number }>;
}

export interface ScoringEvaluationInput {
  productType: Extract<ProductId, 'normal' | 'express'>;
  requestedAmount: number;
  termFortnights: number;
  fortnightlyNetSalary: number;
  currentPayrollDeductions: number;
  seniorityMonths: number;
  convenio: string;
  hubRegion?: HubRegion;
}

export interface ScoringParametricRuleResult {
  ruleCode: string;
  label: string;
  valueFormatted: string;
  impact: 'POSITIVE' | 'NEUTRAL' | 'WARNING' | 'CRITICAL';
  pointsDelta: number;
}

export interface ScoringEvaluationResult {
  score: number; // 300 - 950
  riskLevel: RiskLevelClassification; // Determinista: BAJO, MEDIO, ALTO (Guardrail 3)
  riskLabel: string;
  approvedSuggestion: boolean;
  dtiRatioPercent: number; // % de ingreso libre comprometido
  totalDeductionRatioPercent: number; // % de sueldo neto comprometido total
  availableFortnightlyCapacity: number; // 35% tope institucional menos deducciones previas
  fortnightlyPayment: number;
  totalToPay: number;
  catPercent: number;
  recommendedMaxAmount: number;
  parametricRules: ScoringParametricRuleResult[];
  aiExecutiveJustification: string;
  generatedByModel: string;
  schedule: AmortizationRow[];
}

/**
 * Resumen Operativo 100% Agregado y Anonimizado (Zero-PII — Guardrail Forense 2)
 */
export interface InternalAiAggregatedContext {
  timestampIso: string;
  totalLoansThisMonth: number;
  totalActiveLoans: number;
  totalCapitalPlacedMxn: number;
  totalActiveBalanceMxn: number;
  totalOverdueBalanceMxn: number;
  pldAlertsPendingCount: number;
  pldAlertsConfirmedBlockedCount: number;
  pldTotalRiskEntriesCount: number;
  semaphoreDistribution: {
    VERDE: number;
    AMARILLO: number;
    ROJO: number;
  };
  hubSummary: Record<
    HubRegion,
    {
      activeLoans: number;
      placedAmountMxn: number;
      delinquencyRatePercent: string;
    }
  >;
  fundingSummary: {
    activeInvestorsCount: number;
    totalCommittedCapitalMxn: number;
  };
}

export interface InternalAiQueryResponse {
  answer: string;
  model: string;
  zeroPiiCertified: true;
  aggregatedSnapshot: InternalAiAggregatedContext;
  intentCode?: string;
  domain?: AlmaVirtualDomainId;
  questionNumber?: number | null;
  toolsInvoked?: string[];
}

export type AlmaToolName =
  | 'get_cobranza_data'
  | 'get_originacion_reestructuras_data'
  | 'get_insurance_status'
  | 'get_credit_bureau_closings'
  | 'get_worm_audit_and_arco_log'
  | 'get_executive_portfolio_overview';

export interface AlmaValidatedToolArgs {
  query_type?: string;
  folio?: string | null;
  convenio?: string | null;
  fortnight_period?: string | null;
  curp_prefix?: string | null;
  reporting_month?: string | null;
}

export interface AlmaToolValidationOutcome {
  valid: boolean;
  errorCode?: string;
  message?: string;
  sanitizedArgs?: AlmaValidatedToolArgs;
}


export type AlmaVirtualDomainId =
  | 'COBRANZA'
  | 'ORIGINACION'
  | 'SEGUROS'
  | 'BURO'
  | 'WORM_ARCO'
  | 'RESUMEN_EJECUTIVO';

export interface AlmaVirtualQuestionPrompt {
  id: number;
  domain: AlmaVirtualDomainId;
  shortLabel: string;
  question: string;
}

export interface AlmaVirtualValidatedEntities {
  folio: string | null;
  fortnightPeriod: string | null;
  convenioCode: string | null;
  curpPrefix: string | null;
  reportingMonth: string | null;
  amountHint: number | null;
}

export interface AlmaVirtualDomainExecutionResult {
  intentCode: string;
  domain: AlmaVirtualDomainId;
  questionNumber: number | null;
  structuredData: Record<string, unknown>;
  deterministicMarkdown: string;
}

