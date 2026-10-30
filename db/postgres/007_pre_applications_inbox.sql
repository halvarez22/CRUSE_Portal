-- ==============================================================================
-- MIGRACIÓN POSTGRES 007: Buzón Cifrado de Pre-Solicitudes del Simulador Público (Zero-PII)
-- Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
-- Expediente: CRUSE-APO-2026-045
-- ==============================================================================

CREATE TABLE IF NOT EXISTS credit_pre_applications (
  id VARCHAR(64) PRIMARY KEY,
  folio VARCHAR(32) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applicant_name_masked VARCHAR(120) NOT NULL,
  phone_masked VARCHAR(32) NOT NULL,
  email_masked VARCHAR(120) NOT NULL,
  phone_blind_index VARCHAR(64) NOT NULL,
  email_blind_index VARCHAR(64) NOT NULL,
  convenio VARCHAR(80) NOT NULL,
  encrypted_contact_envelope TEXT NOT NULL,
  product_id VARCHAR(24) NOT NULL,
  product_name VARCHAR(80) NOT NULL,
  requested_amount_mxn NUMERIC(14, 2) NOT NULL,
  term_fortnights INTEGER NOT NULL,
  fortnightly_payment_mxn NUMERIC(14, 2) NOT NULL,
  monthly_payment_mxn NUMERIC(14, 2) NOT NULL,
  total_to_pay_mxn NUMERIC(14, 2) NOT NULL,
  cat_percent NUMERIC(8, 2) NOT NULL,
  interest_rate_text VARCHAR(80) NOT NULL,
  inbox_status VARCHAR(20) NOT NULL DEFAULT 'NO_LEIDO'
    CHECK (inbox_status IN ('NO_LEIDO', 'LEIDO', 'ATENDIDO')),
  read_by_email VARCHAR(120),
  read_at TIMESTAMP,
  attended_by_email VARCHAR(120),
  attended_at TIMESTAMP,
  promoter_notes TEXT,
  source_ip VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_pre_apps_inbox_status
  ON credit_pre_applications(inbox_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pre_apps_phone_bi
  ON credit_pre_applications(phone_blind_index);

CREATE INDEX IF NOT EXISTS idx_pre_apps_source_ip
  ON credit_pre_applications(source_ip, created_at DESC);
