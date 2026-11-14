-- =================================================================================
-- MIGRACIÓN 015 (SQLite): SPRINT FASE 3.2 — MOTOR DE FIRMA DIGITAL CON VALIDEZ LEGAL
-- NOM-151-SCFI-2016, BIOMETRÍA CON PRUEBA DE VIDA ACTIVA E IDEMPOTENCIA TRANSACCIONAL
-- Expediente: CRUSE-APO-2026-048
-- =================================================================================

CREATE TABLE IF NOT EXISTS client_digital_signatures (
  id TEXT PRIMARY KEY,
  pre_application_id TEXT NOT NULL UNIQUE,
  folio TEXT NOT NULL UNIQUE,
  signature_request_id TEXT NOT NULL UNIQUE,
  contract_pre_sign_sha256 TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  payroll_discount_hash TEXT NOT NULL,
  biometric_consent_hash TEXT NOT NULL,
  biometric_evidence_sha256 TEXT NOT NULL,
  liveness_score TEXT NOT NULL,
  liveness_duration_ms INTEGER NOT NULL,
  liveness_challenges_passed TEXT NOT NULL,
  psc_provider_id TEXT NOT NULL,
  trusted_timestamp_iso TEXT NOT NULL,
  nom151_constancia_sha256 TEXT NOT NULL,
  nom151_constancia_base64 TEXT NOT NULL,
  encrypted_signature_envelope TEXT NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_digital_sig_folio
  ON client_digital_signatures (folio);

CREATE INDEX IF NOT EXISTS idx_client_digital_sig_contract_hash
  ON client_digital_signatures (contract_pre_sign_sha256);
