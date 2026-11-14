/**
 * TIPOS ESTRICTOS DE FASE 3.4: TABLERO WEB DE OPERACIONES UNIFICADO (SINGLE PANE OF GLASS),
 * HUB DE INTEGRACIÓN POR LAYOUTS (TRIBUNAL / PATRONES) Y CONECTORES ZERO-TRUST
 * Expedientes: CRUSE-APO-2026-050 / CRUSE-APO-2026-062
 */

export type OperationsHubRegionFilter = 'ALL' | 'CHIHUAHUA' | 'LEON' | 'CANCUN';
export type IntegrationHubRegion = 'CHIHUAHUA' | 'LEON' | 'CANCUN' | 'NACIONAL';
export type LayoutFormatType = 'FIXED_WIDTH_TXT' | 'CSV_PIPE';
export type LayoutExchangeDirection = 'OUTBOUND_DISCOUNT_LAYOUT' | 'INBOUND_PAYROLL_RESPONSE';

export interface SinglePanePhase1Metrics {
  activeLoansCount: number;
  frozenExtrajudicialCount: number;
  frozenRatioPercent: string;
  totalOriginalPrincipalMxn: string;
  totalLiveBalanceMxn: string;
}

export interface SinglePanePhase2Metrics {
  totalPreApplicationsCount: number;
  unreadPreApplicationsCount: number;
  pendingPldAlertsCount: number;
  confirmedPldBlocksCount: number;
  aiScoringEvaluationsCount: number;
}

export interface SinglePanePhase3Metrics {
  selfServiceExpedientesCount: number;
  nom151SignedContractsCount: number;
  cloudMigratedContractsCount: number;
  layoutExchangesCount: number;
}

export interface IntegrationConnectorRecord {
  id: string;
  connectorCode: string;
  displayName: string;
  institutionOrSystem: string;
  hubRegion: IntegrationHubRegion;
  transportMode: 'HYBRID_LAYOUT_AND_WEBHOOK' | 'LAYOUT_FILE_ONLY' | 'INTERNAL_MTLS_HMAC_BUS';
  defaultLayoutFormat: LayoutFormatType;
  expectedMtlsThumbprintSha256: string;
  status: 'ONLINE_READY' | 'MAINTENANCE' | 'DISABLED';
  lastSyncAt: string | null;
  totalExchangesCount: number;
}

export interface LayoutRejectedRowDetail {
  lineNumber: number;
  rawLinePreview: string;
  reason: string;
}

export interface InstitutionalLayoutExchangeRecord {
  id: string;
  batchFolio: string;
  connectorCode: string;
  direction: LayoutExchangeDirection;
  layoutFormat: LayoutFormatType;
  hubRegion: IntegrationHubRegion;
  periodCode: string;
  validRowsCount: number;
  rejectedRowsCount: number;
  declaredTotalMxn: string;
  verifiedTotalMxn: string;
  discrepancyMxn: string;
  payloadSha256: string;
  rejectedRows: LayoutRejectedRowDetail[];
  status: 'VERIFIED_SEALED' | 'PARTIAL_WITH_REJECTIONS' | 'ABORTED_DISCREPANCY';
  actorEmail: string;
  createdAt: string;
  generatedLayoutContent?: string;
}

export interface OperationsIntegrationHubOverview {
  selectedHub: OperationsHubRegionFilter;
  phase1: SinglePanePhase1Metrics;
  phase2: SinglePanePhase2Metrics;
  phase3: SinglePanePhase3Metrics;
  connectors: IntegrationConnectorRecord[];
  recentExchanges: InstitutionalLayoutExchangeRecord[];
}
