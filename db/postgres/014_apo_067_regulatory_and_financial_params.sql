-- =================================================================================
-- MIGRACIÓN 014 (PostgreSQL): BLINDAJE FINANCIERO, REGULATORIO CNBV Y PARAMETRIZACIÓN
-- Expediente: CRUSE-APO-2026-067 (Guardrails Forenses 1 al 8)
-- =================================================================================

ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS originated_from_arrears_restructure INTEGER NOT NULL DEFAULT 0
  CHECK (originated_from_arrears_restructure IN (0, 1));
ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS sustained_payments_completed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS days_past_due INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS loan_sustained_payment_events (
  id VARCHAR(64) PRIMARY KEY,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  is_complete_payment INTEGER NOT NULL CHECK (is_complete_payment IN (0, 1)),
  days_after_due_date INTEGER NOT NULL,
  streak_after_event INTEGER NOT NULL,
  recorded_by VARCHAR(255) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sustained_pmt_loan ON loan_sustained_payment_events(loan_account_id, recorded_at DESC);

ALTER TABLE investors ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(45) NOT NULL DEFAULT 'SISTEMA_FINANCIERO_ART54_CAPITAL'
  CHECK (tax_regime IN ('SISTEMA_FINANCIERO_ART54_CAPITAL', 'MUTUO_PF_ART160_INTERES', 'PERSONA_MORAL_SIN_RETENCION'));
ALTER TABLE investors ADD COLUMN IF NOT EXISTS funding_legal_classification VARCHAR(50) NOT NULL DEFAULT 'FONDEO_PRIVADO_EXENTO_ART103_LIC'
  CHECK (funding_legal_classification IN ('ACCIONISTA_RELACIONADO', 'LINEA_INSTITUCIONAL', 'FONDEO_PRIVADO_EXENTO_ART103_LIC'));
ALTER TABLE investors ADD COLUMN IF NOT EXISTS funding_contract_folio VARCHAR(80) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS une_complaints_log (
  id VARCHAR(64) PRIMARY KEY,
  folio_une VARCHAR(40) NOT NULL UNIQUE,
  report_channel VARCHAR(20) NOT NULL CHECK (report_channel IN ('REUNE', 'REDECO', 'PRESENCIAL_UNE')),
  expediente_id VARCHAR(64) DEFAULT NULL,
  subject_masked_name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  summary_text TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED_FAVORABLE', 'RESOLVED_UNFAVORABLE')),
  resolution_notes TEXT DEFAULT NULL,
  recorded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_une_complaints_status ON une_complaints_log(status, created_at DESC);

INSERT INTO system_financial_parameters (param_key, param_numeric_value, param_text_value, description) VALUES
  ('LIFE_INSURANCE_FORTNIGHTLY_MXN', 22.850000, '22.85', 'Prima quincenal de Seguro de Vida institucional para Crédito Normal activo (MXN)'),
  ('LIFE_INSURANCE_MONTHLY_MXN', 45.700000, '45.70', 'Prima mensual de Seguro de Vida institucional para Crédito Normal activo (MXN)'),
  ('LIFE_INSURANCE_COVERAGE_MXN', 35000.000000, '35000.00', 'Suma asegurada de póliza institucional de Seguro de Vida (MXN)'),
  ('SPECIAL_CREDIT_MIN_MONTHLY_RATE', 0.030000, '0.03', 'Tasa mensual mínima autorizada para Crédito Especial (3.0% mensual)'),
  ('SPECIAL_CREDIT_MAX_MONTHLY_RATE', 0.050000, '0.05', 'Tasa mensual máxima autorizada para Crédito Especial (5.0% mensual)'),
  ('ISR_FINANCIAL_SYSTEM_RATE_2025', 0.005000, '0.0050', 'Tasa anual LIF 2025 de retención ISR sobre capital (Art. 54 LISR: 0.50%)'),
  ('ISR_FINANCIAL_SYSTEM_RATE_2026', 0.009000, '0.0090', 'Tasa anual LIF 2026 de retención ISR sobre capital (Art. 54 LISR: 0.90%)'),
  ('ISR_MUTUO_PF_INTEREST_RATE', 0.200000, '0.2000', 'Tasa de retención provisional ISR sobre interés devengado en mutuos PF (Art. 135/160 LISR: 20%)'),
  ('SUSTAINED_PAYMENTS_REQUIRED_COUNT', 3.000000, '3', 'Número mínimo de pagos consecutivos completos y oportunos para acreditar Pago Sostenido CNBV (Anexo 33 CUB)'),
  ('PLD_RETENTION_YEARS_MINIMUM', 10.000000, '10', 'Plazo mínimo legal de conservación documental y bitácora PLD/FT (10 años conforme DCG Art. 95 Bis LGOAAC / CNBV)')
ON CONFLICT (param_key) DO NOTHING;
