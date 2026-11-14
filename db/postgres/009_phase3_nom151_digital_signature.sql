-- =================================================================================
-- MIGRACIÓN 009 (PostgreSQL): SPRINT FASE 3.2 — MOTOR DE FIRMA DIGITAL CON VALIDEZ LEGAL
-- NOM-151-SCFI-2016, BIOMETRÍA CON PRUEBA DE VIDA ACTIVA E IDEMPOTENCIA TRANSACCIONAL
-- Expediente: CRUSE-APO-2026-048
-- =================================================================================

CREATE TABLE IF NOT EXISTS client_digital_signatures (
  id VARCHAR(80) PRIMARY KEY,
  pre_application_id VARCHAR(80) NOT NULL UNIQUE,
  folio VARCHAR(32) NOT NULL UNIQUE,
  signature_request_id VARCHAR(96) NOT NULL UNIQUE,
  contract_pre_sign_sha256 CHAR(64) NOT NULL,
  terms_hash CHAR(64) NOT NULL,
  payroll_discount_hash CHAR(64) NOT NULL,
  biometric_consent_hash CHAR(64) NOT NULL,
  biometric_evidence_sha256 CHAR(64) NOT NULL,
  liveness_score VARCHAR(16) NOT NULL,
  liveness_duration_ms INTEGER NOT NULL,
  liveness_challenges_passed TEXT NOT NULL,
  psc_provider_id VARCHAR(80) NOT NULL,
  trusted_timestamp_iso VARCHAR(40) NOT NULL,
  nom151_constancia_sha256 CHAR(64) NOT NULL,
  nom151_constancia_base64 TEXT NOT NULL,
  encrypted_signature_envelope TEXT NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  created_at VARCHAR(40) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_digital_sig_folio
  ON client_digital_signatures (folio);

CREATE INDEX IF NOT EXISTS idx_client_digital_sig_contract_hash
  ON client_digital_signatures (contract_pre_sign_sha256);
