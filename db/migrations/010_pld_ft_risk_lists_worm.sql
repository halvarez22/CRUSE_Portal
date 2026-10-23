-- ============================================================================
-- CRUSE FINTECH PORTAL — MIGRACIÓN INCREMENTAL SQLITE 3FN v4 (VERSIÓN 010)
-- Expediente: CRUSE-APO-2026-027
-- Motor Automatizado de Prevención de Lavado de Dinero (PLD/FT: 69-B SAT, UIF, OFAC, PEPs)
-- Blind Indexing HMAC-SHA256 Zero-PII + Inmutabilidad WORM + Proyección por Eventos
-- ============================================================================

-- 1. Catálogo Criptográfico de Entradas en Listas de Riesgo PLD/FT (Zero-PII)
CREATE TABLE IF NOT EXISTS pld_risk_entries (
  id VARCHAR(64) PRIMARY KEY,
  list_type VARCHAR(40) NOT NULL,
  identifier_type VARCHAR(20) NOT NULL DEFAULT 'CURP',
  blind_index VARCHAR(64) NOT NULL,
  identifier_masked VARCHAR(40) NOT NULL,
  subject_masked_name VARCHAR(255) NOT NULL,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'CRITICAL_BLOCK',
  official_reference VARCHAR(120) NOT NULL,
  publication_date VARCHAR(20) NOT NULL,
  source_file_hash CHAR(64) NOT NULL,
  recorded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (blind_index, list_type)
);

CREATE INDEX IF NOT EXISTS idx_pld_risk_blind_index ON pld_risk_entries(blind_index, list_type);
CREATE INDEX IF NOT EXISTS idx_pld_risk_list_type ON pld_risk_entries(list_type);

-- 2. Lotes WORM de Barrido Integral de Cartera e Inversionistas (CNBV / UIF)
CREATE TABLE IF NOT EXISTS pld_screening_batches (
  id VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  officer_email VARCHAR(255) NOT NULL,
  total_expedientes_screened INTEGER NOT NULL,
  total_investors_screened INTEGER NOT NULL,
  total_risk_entries_evaluated INTEGER NOT NULL,
  hits_detected_count INTEGER NOT NULL,
  new_alerts_created_count INTEGER NOT NULL,
  batch_manifest_hash CHAR(64) NOT NULL UNIQUE,
  certificate_acta TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pld_batches_created_at ON pld_screening_batches(created_at DESC);

-- 3. Alertas Inmutables WORM de Coincidencia PLD/FT (Barrido Masivo + Originación en Tiempo Real)
CREATE TABLE IF NOT EXISTS pld_hit_alerts (
  id VARCHAR(64) PRIMARY KEY,
  screening_batch_id VARCHAR(64) REFERENCES pld_screening_batches(id) ON DELETE RESTRICT,
  risk_entry_id VARCHAR(64) NOT NULL REFERENCES pld_risk_entries(id) ON DELETE RESTRICT,
  entity_type VARCHAR(20) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  blind_index_prefix VARCHAR(16) NOT NULL,
  entity_masked_id VARCHAR(40) NOT NULL,
  entity_masked_name VARCHAR(255) NOT NULL,
  list_type VARCHAR(40) NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  official_reference VARCHAR(120) NOT NULL,
  exposure_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  detection_channel VARCHAR(30) NOT NULL DEFAULT 'BATCH_SCREENING',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pld_alerts_entity_list ON pld_hit_alerts(entity_id, list_type);
CREATE INDEX IF NOT EXISTS idx_pld_alerts_created_at ON pld_hit_alerts(created_at DESC);

-- 4. Dictámenes Inmutables WORM del Oficial de Cumplimiento (Event-Sourced State Projection)
CREATE TABLE IF NOT EXISTS pld_alert_resolutions (
  id VARCHAR(64) PRIMARY KEY,
  hit_alert_id VARCHAR(64) NOT NULL REFERENCES pld_hit_alerts(id) ON DELETE RESTRICT,
  resolution_status VARCHAR(30) NOT NULL,
  justification_notes TEXT NOT NULL,
  officer_email VARCHAR(255) NOT NULL,
  resolution_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pld_resolutions_alert_created ON pld_alert_resolutions(hit_alert_id, created_at DESC, id DESC);

-- 5. Triggers de Inmutabilidad WORM (8 Triggers sobre las 4 tablas PLD/FT)
CREATE TRIGGER IF NOT EXISTS trg_worm_upd_pld_risk_entries
BEFORE UPDATE ON pld_risk_entries
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_risk_entries es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_pld_risk_entries
BEFORE DELETE ON pld_risk_entries
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_risk_entries es inmutable (WORM). Operación DELETE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_pld_screening_batches
BEFORE UPDATE ON pld_screening_batches
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_screening_batches es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_pld_screening_batches
BEFORE DELETE ON pld_screening_batches
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_screening_batches es inmutable (WORM). Operación DELETE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_pld_hit_alerts
BEFORE UPDATE ON pld_hit_alerts
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_hit_alerts es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_pld_hit_alerts
BEFORE DELETE ON pld_hit_alerts
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_hit_alerts es inmutable (WORM). Operación DELETE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_pld_alert_resolutions
BEFORE UPDATE ON pld_alert_resolutions
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_alert_resolutions es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_pld_alert_resolutions
BEFORE DELETE ON pld_alert_resolutions
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla pld_alert_resolutions es inmutable (WORM). Operación DELETE bloqueada.');
END;
