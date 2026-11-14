/**
 * TIPOS ESTRICTOS DE FASE 3.3: MIGRACIÓN HISTÓRICA EXCEL -> NUBE Y PLAN DE REGRESO (ROLLBACK)
 * Expedientes: CRUSE-APO-2026-049 / CRUSE-APO-2026-062
 */

export type CloudMigrationBatchStatus =
  | 'STAGED_VERIFIED'
  | 'PROMOTED_CUTOVER'
  | 'ROLLED_BACK'
  | 'ABORTED_DISCREPANCY';

export type CloudMigrationCutoverMode = 'STAGING_PARALLEL' | 'PRODUCTION_CUTOVER_ACTIVE';

export interface LegacyExcelRawRowInput {
  rowNumber: number;
  legacyContractNumber: string;
  convenio: string;
  productType: string;
  rawOriginationDate: string | number;
  fullName: string;
  curp: string;
  rfc: string;
  rawPrincipalOriginal: string | number;
  rawAccruedCharges: string | number;
  rawAppliedPayments: string | number;
  rawLiveBalance: string | number;
  rawFortnightlyPayment: string | number;
  termFortnights: number;
}

export interface CleanedMigratedPortfolioItem {
  id: string;
  batchId: string;
  legacyContractNumber: string;
  convenio: string;
  productType: string;
  normalizedOriginationDate: string;
  maskedName: string;
  curpMasked: string;
  rfcMasked: string;
  principalOriginalMxn: string;
  accruedChargesMxn: string;
  appliedPaymentsMxn: string;
  liveBalanceMxn: string;
  fortnightlyPaymentMxn: string;
  termFortnights: number;
  rawRowSha256: string;
  cleansingNotes: string;
  migrationStatus: 'STAGED' | 'ACTIVE_CUTOVER' | 'ROLLED_BACK';
  createdAt: string;
}

export interface CloudMigrationBatchRecord {
  id: string;
  batchCode: string;
  sourceFilename: string;
  payloadSizeBytes: number;
  status: CloudMigrationBatchStatus;
  totalRows: number;
  idempotentUpserts: number;
  excelTotalPrincipalMxn: string;
  migratedTotalPrincipalMxn: string;
  excelTotalLiveBalanceMxn: string;
  migratedTotalLiveBalanceMxn: string;
  discrepancyMxn: string;
  preMigrationSnapshotSha256: string;
  postRollbackSnapshotSha256: string | null;
  postRollbackVerified: boolean;
  batchManifestSha256: string;
  executedByEmail: string;
  rolledBackByEmail: string | null;
  rolledBackAt: string | null;
  createdAt: string;
}

export interface CloudMigrationOverview {
  cutoverMode: CloudMigrationCutoverMode;
  activeMigratedContractsCount: number;
  totalMigratedPrincipalMxn: string;
  totalMigratedLiveBalanceMxn: string;
  batches: CloudMigrationBatchRecord[];
  latestCleanedRows: CleanedMigratedPortfolioItem[];
}
