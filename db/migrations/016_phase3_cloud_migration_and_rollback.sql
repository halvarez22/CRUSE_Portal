-- =================================================================================
-- MIGRACIÓN 016 (SQLite): SPRINT FASE 3.3 — MOTOR DE MIGRACIÓN HISTÓRICA EXCEL -> NUBE,
-- SANEAMIENTO DETERMINISTA, RECONCILIACIÓN CENTAVO A CENTAVO Y PLAN DE REGRESO (ROLLBACK)
-- Expediente: CRUSE-APO-2026-049
-- =================================================================================

CREATE TABLE IF NOT EXISTS cloud_migration_batches (
  id TEXT PRIMARY KEY,
  batch_code TEXT NOT NULL UNIQUE,
  source_filename TEXT NOT NULL,
  payload_size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('STAGED_VERIFIED', 'PROMOTED_CUTOVER', 'ROLLED_BACK', 'ABORTED_DISCREPANCY')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  idempotent_upserts INTEGER NOT NULL DEFAULT 0,
  excel_total_principal_mxn TEXT NOT NULL,
  migrated_total_principal_mxn TEXT NOT NULL,
  excel_total_live_balance_mxn TEXT NOT NULL,
  migrated_total_live_balance_mxn TEXT NOT NULL,
  discrepancy_mxn TEXT NOT NULL DEFAULT '0.00',
  pre_migration_snapshot_sha256 TEXT NOT NULL,
  post_rollback_snapshot_sha256 TEXT,
  post_rollback_verified INTEGER NOT NULL DEFAULT 0 CHECK (post_rollback_verified IN (0, 1)),
  batch_manifest_sha256 TEXT NOT NULL,
  executed_by_email TEXT NOT NULL,
  rolled_back_by_email TEXT,
  rolled_back_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_mig_batches_status
  ON cloud_migration_batches (status, created_at DESC);

CREATE TABLE IF NOT EXISTS legacy_excel_raw_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  legacy_contract_number TEXT NOT NULL,
  raw_row_json TEXT NOT NULL,
  raw_row_sha256 TEXT NOT NULL,
  cleansing_transformations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_legacy_excel_raw_batch
  ON legacy_excel_raw_rows (batch_id);

CREATE TABLE IF NOT EXISTS cleaned_migrated_portfolio (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  legacy_contract_number TEXT NOT NULL UNIQUE,
  convenio TEXT NOT NULL,
  product_type TEXT NOT NULL,
  normalized_origination_date TEXT NOT NULL,
  masked_name TEXT NOT NULL,
  curp_masked TEXT NOT NULL,
  rfc_masked TEXT NOT NULL,
  blind_curp TEXT NOT NULL,
  blind_rfc TEXT NOT NULL,
  principal_original_mxn TEXT NOT NULL,
  accrued_charges_mxn TEXT NOT NULL,
  applied_payments_mxn TEXT NOT NULL,
  live_balance_mxn TEXT NOT NULL,
  fortnightly_payment_mxn TEXT NOT NULL,
  term_fortnights INTEGER NOT NULL,
  encrypted_pii_envelope TEXT NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  raw_row_sha256 TEXT NOT NULL,
  cleansing_notes TEXT NOT NULL,
  migration_status TEXT NOT NULL DEFAULT 'STAGED' CHECK (migration_status IN ('STAGED', 'ACTIVE_CUTOVER', 'ROLLED_BACK')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cleaned_mig_portfolio_batch
  ON cleaned_migrated_portfolio (batch_id);

CREATE INDEX IF NOT EXISTS idx_cleaned_mig_portfolio_blind_curp
  ON cleaned_migrated_portfolio (blind_curp);

INSERT INTO system_financial_parameters (
  param_key, param_numeric_value, param_text_value, description, updated_by
) VALUES (
  'CLOUD_MIGRATION_CUTOVER_ACTIVE',
  0,
  'STAGING_PARALLEL',
  'Feature Flag de Corte Productivo de Cartera Histórica Migrada (0=Staging Paralelo, 1=Corte Activo)',
  'system@cruse.mx'
) ON CONFLICT(param_key) DO NOTHING;
