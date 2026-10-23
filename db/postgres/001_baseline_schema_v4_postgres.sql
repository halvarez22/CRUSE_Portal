-- ============================================================================
-- MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.
-- ESQUEMA RELACIONAL DEFINITIVO 3FN v4 — POSTGRESQL 16+ (IDEMPOTENTE)
-- Expediente: CRUSE-APO-2026-023 (Guardrail Forense 4: 100% Idempotente)
-- Contiene: 33 Tablas 3FN v4 + Índices + 4 Funciones PL/pgSQL + 26 Triggers WORM/RN
-- ============================================================================

-- 1. CONTROL DE MIGRACIONES CRIPTOGRÁFICAS
CREATE TABLE IF NOT EXISTS _schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum CHAR(64) NOT NULL,
  execution_time_ms INTEGER NOT NULL
);

-- 2. SEGURIDAD, AUTENTICACIÓN 2FA Y BITÁCORA FORENSE WORM
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL,
  phone_number TEXT,
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT NOT NULL,
  totp_enrolled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS pending_totp (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_totp_user ON pending_totp(user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(64) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  source_ip VARCHAR(45) NOT NULL,
  source_summary VARCHAR(255) NOT NULL,
  curp_masked VARCHAR(20),
  blind_curp_prefix VARCHAR(32),
  expediente_id VARCHAR(64),
  details TEXT,
  prev_hash CHAR(64) NOT NULL,
  record_hash CHAR(64) NOT NULL UNIQUE,
  hash_version INTEGER NOT NULL DEFAULT 2,
  chain_seq INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_chain_seq ON audit_events(chain_seq) WHERE chain_seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events(ts);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_events_blind_curp ON audit_events(blind_curp_prefix);

-- 3. GOBERNANZA Y PARÁMETROS FINANCIEROS (HRU — CERO HARDCODING)
CREATE TABLE IF NOT EXISTS system_financial_parameters (
  param_key VARCHAR(60) PRIMARY KEY,
  param_numeric_value NUMERIC(14,6),
  param_text_value TEXT,
  description VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS accounting_movements_catalog (
  code VARCHAR(30) PRIMARY KEY,
  description VARCHAR(150) NOT NULL,
  nature VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operational_notes (
  id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(30) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  note_content TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 1,
  author_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operational_notes_entity ON operational_notes(entity_type, entity_id, is_pinned);

-- 4. CORE Y EXPEDIENTES (BLIND INDEXING HMAC-SHA256 + ENVELOPE ENCRYPTION AES-GCM-256)
CREATE TABLE IF NOT EXISTS convenios (
  code VARCHAR(40) PRIMARY KEY,
  display_name VARCHAR(150) NOT NULL,
  payroll_layout TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  default_frequency VARCHAR(15) NOT NULL DEFAULT 'QUINCENAL',
  charges_life_insurance INTEGER NOT NULL DEFAULT 1,
  sends_union_letter INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expedientes (
  id VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  convenio VARCHAR(40) NOT NULL REFERENCES convenios(code),
  full_name VARCHAR(255) NOT NULL,
  curp_masked VARCHAR(20) NOT NULL,
  blind_curp CHAR(64) NOT NULL UNIQUE,
  voter_id VARCHAR(50),
  address TEXT NOT NULL,
  phone VARCHAR(30) NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL,
  term_fortnights INTEGER NOT NULL,
  product_type VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'capturado',
  promotor_email VARCHAR(255) NOT NULL,
  encrypted_thumb_payload TEXT,
  kek_version INTEGER NOT NULL DEFAULT 1,
  encrypted_pii_payload TEXT,
  person_type VARCHAR(15) NOT NULL DEFAULT 'FISICA',
  rfc_masked VARCHAR(20),
  blind_rfc CHAR(64),
  gender CHAR(1),
  birth_date DATE,
  gross_income NUMERIC(12,2),
  payroll_deductions NUMERIC(12,2)
);
CREATE INDEX IF NOT EXISTS idx_expedientes_convenio_status ON expedientes(convenio, status);
CREATE INDEX IF NOT EXISTS idx_expedientes_blind_rfc ON expedientes(blind_rfc) WHERE blind_rfc IS NOT NULL;

CREATE TABLE IF NOT EXISTS expedientes_status_history (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS legal_entity_members (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  member_role VARCHAR(30) NOT NULL,
  rfc_masked VARCHAR(20) NOT NULL,
  blind_rfc CHAR(64) NOT NULL,
  encrypted_pii_payload TEXT NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  shareholding_percent NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_legal_members_expediente ON legal_entity_members(expediente_id);
CREATE INDEX IF NOT EXISTS idx_legal_members_blind_rfc ON legal_entity_members(blind_rfc);

CREATE TABLE IF NOT EXISTS contacts (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  type VARCHAR(20) NOT NULL,
  encrypted_value VARCHAR(255) NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. SEGURIDAD LFPDPPP (ARCO)
CREATE TABLE IF NOT EXISTS arco_requests (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  request_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  resolution_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. COLOCACIÓN OPERATIVA, REESTRUCTURAS, SUSPENSIONES Y CONCILIACIÓN QUINCENAL
CREATE TABLE IF NOT EXISTS loan_accounts (
  id VARCHAR(64) PRIMARY KEY,
  contract_number VARCHAR(50) NOT NULL UNIQUE,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  principal_original NUMERIC(12,2) NOT NULL,
  current_principal_balance NUMERIC(12,2) NOT NULL,
  fortnightly_payment NUMERIC(12,2) NOT NULL,
  payment_frequency VARCHAR(15) NOT NULL DEFAULT 'QUINCENAL',
  payroll_source_type VARCHAR(20) NOT NULL DEFAULT 'ORDINARIA',
  first_deduction_period VARCHAR(15) NOT NULL,
  union_official_letter_no VARCHAR(100),
  disbursement_method VARCHAR(20) NOT NULL DEFAULT 'SPEI',
  disbursement_reference VARCHAR(100),
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by VARCHAR(255) NOT NULL,
  product_type VARCHAR(30) NOT NULL DEFAULT 'NOMINA_NORMAL',
  insurance_required INTEGER NOT NULL DEFAULT 1,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'NOMINA',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  reports_to_credit_bureau INTEGER NOT NULL DEFAULT 1,
  capacity_override_flag INTEGER NOT NULL DEFAULT 0,
  capacity_override_reason TEXT,
  capacity_override_by VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_loan_accounts_expediente_id ON loan_accounts(expediente_id);
CREATE INDEX IF NOT EXISTS idx_loan_accounts_status_product ON loan_accounts(status, product_type);

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  loan_account_id VARCHAR(64) REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  type VARCHAR(30) NOT NULL,
  encrypted_s3_key VARCHAR(255) NOT NULL,
  upload_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS amortization_schedules (
  id VARCHAR(64) PRIMARY KEY,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  period_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  expected_capital NUMERIC(12,2) NOT NULL,
  expected_interest NUMERIC(12,2) NOT NULL,
  expected_vat NUMERIC(12,2) NOT NULL,
  expected_insurance NUMERIC(12,2) NOT NULL,
  expected_payment NUMERIC(12,2) NOT NULL,
  expected_balance NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (loan_account_id, period_number)
);

CREATE TABLE IF NOT EXISTS special_credit_movements (
  id VARCHAR(64) PRIMARY KEY,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  movement_date DATE NOT NULL,
  movement_type VARCHAR(25) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  disbursement_method VARCHAR(20),
  reference_number VARCHAR(100),
  recorded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loan_restructures (
  id VARCHAR(64) PRIMARY KEY,
  new_loan_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  previous_loan_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  absorbed_payoff_amount NUMERIC(12,2) NOT NULL,
  authorized_by VARCHAR(255) NOT NULL,
  restructured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (new_loan_id, previous_loan_id)
);

CREATE TABLE IF NOT EXISTS loan_suspension_periods (
  id VARCHAR(64) PRIMARY KEY,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  start_period VARCHAR(15) NOT NULL,
  end_period VARCHAR(15),
  reason VARCHAR(50) NOT NULL DEFAULT 'LICENCIA_SIN_GOCE',
  status VARCHAR(25) NOT NULL DEFAULT 'ACTIVE_SUSPENSION',
  approved_by VARCHAR(255) NOT NULL,
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_batches (
  id VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  agreement_name VARCHAR(100) NOT NULL,
  fortnight_period VARCHAR(20) NOT NULL,
  total_records INTEGER NOT NULL,
  total_amount_expected NUMERIC(14,2) NOT NULL,
  total_amount_received NUMERIC(14,2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'procesado',
  officer_email VARCHAR(255) NOT NULL,
  batch_manifest_hash CHAR(64) NOT NULL UNIQUE,
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_convenio_periodo ON reconciliation_batches(agreement_name, fortnight_period);
CREATE INDEX IF NOT EXISTS idx_reconciliation_agreement ON reconciliation_batches(agreement_name);
CREATE INDEX IF NOT EXISTS idx_reconciliation_period ON reconciliation_batches(fortnight_period);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id VARCHAR(64) PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL REFERENCES reconciliation_batches(id) ON DELETE RESTRICT,
  expediente_id VARCHAR(64),
  blind_curp CHAR(64) NOT NULL,
  curp_masked VARCHAR(20) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  expected_payment NUMERIC(12,2) NOT NULL,
  actual_payment NUMERIC(12,2) NOT NULL,
  difference NUMERIC(12,2) NOT NULL,
  status VARCHAR(40) NOT NULL,
  audit_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_batch ON reconciliation_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_status ON reconciliation_items(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_blind ON reconciliation_items(blind_curp);

CREATE TABLE IF NOT EXISTS loan_payment_applications (
  id VARCHAR(64) PRIMARY KEY,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  batch_id VARCHAR(64) NOT NULL REFERENCES reconciliation_batches(id) ON DELETE RESTRICT,
  reconciliation_item_id VARCHAR(64) NOT NULL UNIQUE REFERENCES reconciliation_items(id) ON DELETE RESTRICT,
  fortnight_period VARCHAR(10) NOT NULL,
  amount_received NUMERIC(12,2) NOT NULL,
  due_insurance NUMERIC(12,2) NOT NULL,
  due_interest NUMERIC(12,2) NOT NULL,
  due_vat NUMERIC(12,2) NOT NULL,
  due_capital NUMERIC(12,2) NOT NULL,
  applied_insurance NUMERIC(12,2) NOT NULL,
  applied_interest NUMERIC(12,2) NOT NULL,
  applied_vat NUMERIC(12,2) NOT NULL,
  applied_capital NUMERIC(12,2) NOT NULL,
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  arrears_insurance_after NUMERIC(12,2) NOT NULL,
  arrears_interest_after NUMERIC(12,2) NOT NULL,
  arrears_vat_after NUMERIC(12,2) NOT NULL,
  credit_balance_after NUMERIC(12,2) NOT NULL,
  allocation_mode VARCHAR(20) NOT NULL DEFAULT 'AUTOMATIC',
  override_reason TEXT,
  authorized_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (loan_account_id, fortnight_period)
);
CREATE INDEX IF NOT EXISTS idx_lpa_loan_account_id ON loan_payment_applications(loan_account_id);
CREATE INDEX IF NOT EXISTS idx_lpa_expediente_id ON loan_payment_applications(expediente_id);

-- 7. FONDEO E INVERSIONISTAS
CREATE TABLE IF NOT EXISTS investors (
  id VARCHAR(64) PRIMARY KEY,
  blind_name CHAR(64) NOT NULL UNIQUE,
  encrypted_name VARCHAR(255) NOT NULL,
  isr_retention_rate NUMERIC(5,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applies_isr INTEGER NOT NULL DEFAULT 1,
  requires_invoice INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS investments (
  id VARCHAR(64) PRIMARY KEY,
  investor_id VARCHAR(64) NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
  capital NUMERIC(12,2) NOT NULL,
  annual_rate NUMERIC(6,4) NOT NULL,
  start_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  interest_type VARCHAR(20) NOT NULL DEFAULT 'SIMPLE',
  current_capital NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS investment_capital_movements (
  id VARCHAR(64) PRIMARY KEY,
  investment_id VARCHAR(64) NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  movement_date DATE NOT NULL,
  movement_type VARCHAR(30) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  capital_before NUMERIC(12,2) NOT NULL,
  capital_after NUMERIC(12,2) NOT NULL,
  reference_number VARCHAR(100) NOT NULL,
  recorded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investor_payments (
  id VARCHAR(64) PRIMARY KEY,
  investor_id VARCHAR(64) NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
  investment_id VARCHAR(64) REFERENCES investments(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  gross_yield NUMERIC(12,2) NOT NULL,
  isr_retained NUMERIC(12,2) NOT NULL,
  net_paid NUMERIC(12,2) NOT NULL,
  reference_number VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. SEGUROS DE VIDA (PÓLIZA COLECTIVA $35,000 MXN)
CREATE TABLE IF NOT EXISTS insurance_policies (
  id VARCHAR(64) PRIMARY KEY,
  insurance_company VARCHAR(150) NOT NULL,
  policy_number VARCHAR(100) NOT NULL UNIQUE,
  coverage_amount NUMERIC(12,2) NOT NULL DEFAULT 35000.00,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loan_insurance_enrollments (
  id VARCHAR(64) PRIMARY KEY,
  policy_id VARCHAR(64) NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  insured_amount NUMERIC(12,2) NOT NULL DEFAULT 35000.00,
  period_premium NUMERIC(12,2) NOT NULL DEFAULT 22.85,
  first_payment_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (policy_id, loan_account_id)
);

CREATE TABLE IF NOT EXISTS insurance_claims (
  id VARCHAR(64) PRIMARY KEY,
  policy_id VARCHAR(64) NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  event_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL,
  amount_paid NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. CUMPLIMIENTO REGULATORIO Y CÍRCULO DE CRÉDITO (SIC)
CREATE TABLE IF NOT EXISTS credit_bureau_catalogs (
  id VARCHAR(64) PRIMARY KEY,
  catalog_group VARCHAR(40) NOT NULL,
  code VARCHAR(20) NOT NULL,
  description VARCHAR(255) NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NOT NULL DEFAULT 'system',
  UNIQUE (catalog_group, code)
);

CREATE TABLE IF NOT EXISTS credit_bureau_reports (
  id VARCHAR(64) PRIMARY KEY,
  reporting_month VARCHAR(10) NOT NULL,
  manifest_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE credit_bureau_reports ALTER COLUMN reporting_month TYPE VARCHAR(10);

CREATE TABLE IF NOT EXISTS credit_bureau_report_details (
  id VARCHAR(64) PRIMARY KEY,
  report_id VARCHAR(64) NOT NULL REFERENCES credit_bureau_reports(id) ON DELETE RESTRICT,
  loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
  reported_balance NUMERIC(12,2) NOT NULL,
  days_past_due INTEGER NOT NULL,
  observation_code VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 10. FUNCIONES PL/pgSQL Y LOS 26 TRIGGERS WORM Y REGLAS DE NEGOCIO (IDEMPOTENTES)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_worm_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'WORM_VIOLATION: El registro en la tabla % es inmutable (WORM). Operación % bloqueada.', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_max_4_normal_loans()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_normal_count INTEGER;
BEGIN
  IF NEW.product_type = 'NOMINA_NORMAL' AND NEW.status = 'ACTIVE' THEN
    SELECT COUNT(*) INTO v_active_normal_count
      FROM loan_accounts
     WHERE expediente_id = NEW.expediente_id
       AND product_type = 'NOMINA_NORMAL'
       AND status = 'ACTIVE';

    IF v_active_normal_count >= 4 THEN
      RAISE EXCEPTION 'RN01_MAX_LOANS_EXCEEDED: El cliente ya posee el máximo permitido de 4 créditos NOMINA_NORMAL activos simultáneos.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_forbid_express_restructure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_type VARCHAR(30);
  v_new_type VARCHAR(30);
BEGIN
  SELECT product_type INTO v_prev_type FROM loan_accounts WHERE id = NEW.previous_loan_id;
  SELECT product_type INTO v_new_type FROM loan_accounts WHERE id = NEW.new_loan_id;

  IF v_prev_type = 'EXPRESS' OR v_new_type = 'EXPRESS' THEN
    RAISE EXCEPTION 'RN02_EXPRESS_NO_RESTRUCTURE: Los créditos EXPRESS no admiten reestructura ni refinanciamiento.';
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers WORM (24) + Triggers RN-01 / RN-02 (2) = 26 Triggers
DROP TRIGGER IF EXISTS trg_audit_events_no_update ON audit_events;
CREATE TRIGGER trg_audit_events_no_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_audit_events_no_delete ON audit_events;
CREATE TRIGGER trg_audit_events_no_delete BEFORE DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_arco_requests ON arco_requests;
CREATE TRIGGER trg_worm_upd_arco_requests BEFORE UPDATE ON arco_requests FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_arco_requests ON arco_requests;
CREATE TRIGGER trg_worm_del_arco_requests BEFORE DELETE ON arco_requests FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_convenios ON convenios;
CREATE TRIGGER trg_worm_upd_convenios BEFORE UPDATE ON convenios FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_convenios ON convenios;
CREATE TRIGGER trg_worm_del_convenios BEFORE DELETE ON convenios FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_credit_bureau_reports ON credit_bureau_reports;
CREATE TRIGGER trg_worm_upd_credit_bureau_reports BEFORE UPDATE ON credit_bureau_reports FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_credit_bureau_reports ON credit_bureau_reports;
CREATE TRIGGER trg_worm_del_credit_bureau_reports BEFORE DELETE ON credit_bureau_reports FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_cb_report_details ON credit_bureau_report_details;
CREATE TRIGGER trg_worm_upd_cb_report_details BEFORE UPDATE ON credit_bureau_report_details FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_cb_report_details ON credit_bureau_report_details;
CREATE TRIGGER trg_worm_del_cb_report_details BEFORE DELETE ON credit_bureau_report_details FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_insurance_claims ON insurance_claims;
CREATE TRIGGER trg_worm_upd_insurance_claims BEFORE UPDATE ON insurance_claims FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_insurance_claims ON insurance_claims;
CREATE TRIGGER trg_worm_del_insurance_claims BEFORE DELETE ON insurance_claims FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_investment_cap_movements ON investment_capital_movements;
CREATE TRIGGER trg_worm_upd_investment_cap_movements BEFORE UPDATE ON investment_capital_movements FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_investment_cap_movements ON investment_capital_movements;
CREATE TRIGGER trg_worm_del_investment_cap_movements BEFORE DELETE ON investment_capital_movements FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_investor_payments ON investor_payments;
CREATE TRIGGER trg_worm_upd_investor_payments BEFORE UPDATE ON investor_payments FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_investor_payments ON investor_payments;
CREATE TRIGGER trg_worm_del_investor_payments BEFORE DELETE ON investor_payments FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_loan_accounts ON loan_accounts;
CREATE TRIGGER trg_worm_upd_loan_accounts BEFORE UPDATE ON loan_accounts FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_loan_accounts ON loan_accounts;
CREATE TRIGGER trg_worm_del_loan_accounts BEFORE DELETE ON loan_accounts FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_max_4_normal_loans_per_client ON loan_accounts;
CREATE TRIGGER trg_max_4_normal_loans_per_client BEFORE INSERT ON loan_accounts FOR EACH ROW EXECUTE FUNCTION fn_enforce_max_4_normal_loans();

DROP TRIGGER IF EXISTS trg_worm_upd_loan_payment_applications ON loan_payment_applications;
CREATE TRIGGER trg_worm_upd_loan_payment_applications BEFORE UPDATE ON loan_payment_applications FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_loan_payment_applications ON loan_payment_applications;
CREATE TRIGGER trg_worm_del_loan_payment_applications BEFORE DELETE ON loan_payment_applications FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_upd_loan_restructures ON loan_restructures;
CREATE TRIGGER trg_worm_upd_loan_restructures BEFORE UPDATE ON loan_restructures FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_loan_restructures ON loan_restructures;
CREATE TRIGGER trg_worm_del_loan_restructures BEFORE DELETE ON loan_restructures FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_no_express_restructure ON loan_restructures;
CREATE TRIGGER trg_no_express_restructure BEFORE INSERT ON loan_restructures FOR EACH ROW EXECUTE FUNCTION fn_forbid_express_restructure();

DROP TRIGGER IF EXISTS trg_worm_upd_special_credit_movements ON special_credit_movements;
CREATE TRIGGER trg_worm_upd_special_credit_movements BEFORE UPDATE ON special_credit_movements FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();

DROP TRIGGER IF EXISTS trg_worm_del_special_credit_movements ON special_credit_movements;
CREATE TRIGGER trg_worm_del_special_credit_movements BEFORE DELETE ON special_credit_movements FOR EACH ROW EXECUTE FUNCTION fn_enforce_worm_immutability();
