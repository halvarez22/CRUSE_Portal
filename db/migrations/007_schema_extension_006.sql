-- ==============================================================================
-- MIGRACIÓN 007: Extensión de Esquema (CRUSE-APO-2026-006)
-- - loan_accounts: extensiones para Crédito Especial (añadiendo columnas)
-- - contacts: datos de contacto verificados (email, phone)
-- - documents: referencias cifradas a S3
-- - amortization_schedules: plan de amortización esperado
-- - insurance_policies / insurance_claims: pólizas colectivas y reclamos (WORM)
-- - investors / investments / investor_payments: fondeo y rendimientos (WORM)
-- - credit_bureau_reports / credit_bureau_report_details / arco_requests (WORM)
-- - accounting_movements_catalog: catálogo de movimientos contables
-- ==============================================================================

-- 1. ALTER TABLE loan_accounts
ALTER TABLE loan_accounts ADD COLUMN product_type VARCHAR(30) NOT NULL DEFAULT 'NOMINA_NORMAL' CHECK (product_type IN ('NOMINA_NORMAL', 'EXPRESS', 'ESPECIAL'));
ALTER TABLE loan_accounts ADD COLUMN insurance_required INTEGER NOT NULL DEFAULT 1 CHECK (insurance_required IN (0, 1));
ALTER TABLE loan_accounts ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT 'NOMINA' CHECK (payment_method IN ('NOMINA', 'SPEI', 'VENTANILLA'));
ALTER TABLE loan_accounts ADD COLUMN reports_to_credit_bureau INTEGER NOT NULL DEFAULT 1 CHECK (reports_to_credit_bureau IN (0, 1));

-- 2. CREATE TABLE contacts
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(64) PRIMARY KEY,
    expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('EMAIL', 'PHONE')),
    encrypted_value VARCHAR(255) NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. CREATE TABLE documents
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('INE_FRONT', 'INE_BACK', 'PAYSTUB', 'PROOF_OF_ADDRESS', 'OTHER')),
    encrypted_s3_key VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. CREATE TABLE amortization_schedules
CREATE TABLE IF NOT EXISTS amortization_schedules (
    id VARCHAR(64) PRIMARY KEY,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(expediente_id) ON DELETE RESTRICT,
    period_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    expected_capital NUMERIC(12,2) NOT NULL,
    expected_interest NUMERIC(12,2) NOT NULL,
    expected_vat NUMERIC(12,2) NOT NULL,
    expected_insurance NUMERIC(12,2) NOT NULL,
    expected_payment NUMERIC(12,2) NOT NULL,
    expected_balance NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(loan_account_id, period_number)
);

-- 5. CREATE TABLE insurance_policies & insurance_claims
CREATE TABLE IF NOT EXISTS insurance_policies (
    id VARCHAR(64) PRIMARY KEY,
    insurance_company VARCHAR(150) NOT NULL,
    policy_number VARCHAR(100) NOT NULL UNIQUE,
    coverage_amount NUMERIC(12,2) NOT NULL DEFAULT 35000.00,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insurance_claims (
    id VARCHAR(64) PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(expediente_id) ON DELETE RESTRICT,
    event_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    amount_paid NUMERIC(12,2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. CREATE TABLE investors, investments, investor_payments
CREATE TABLE IF NOT EXISTS investors (
    id VARCHAR(64) PRIMARY KEY,
    blind_name CHAR(64) NOT NULL UNIQUE,
    encrypted_name VARCHAR(255) NOT NULL,
    isr_retention_rate NUMERIC(5,4) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investments (
    id VARCHAR(64) PRIMARY KEY,
    investor_id VARCHAR(64) NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
    capital NUMERIC(12,2) NOT NULL,
    annual_rate NUMERIC(6,4) NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL CHECK(status IN ('ACTIVE', 'CLOSED')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. CREATE TABLE credit_bureau_reports & credit_bureau_report_details & arco_requests
CREATE TABLE IF NOT EXISTS credit_bureau_reports (
    id VARCHAR(64) PRIMARY KEY,
    reporting_month VARCHAR(6) NOT NULL,
    manifest_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_bureau_report_details (
    id VARCHAR(64) PRIMARY KEY,
    report_id VARCHAR(64) NOT NULL REFERENCES credit_bureau_reports(id) ON DELETE RESTRICT,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(expediente_id) ON DELETE RESTRICT,
    reported_balance NUMERIC(12,2) NOT NULL,
    days_past_due INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS arco_requests (
    id VARCHAR(64) PRIMARY KEY,
    expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
    request_type VARCHAR(30) NOT NULL CHECK(request_type IN ('ACCESO', 'RECTIFICACION', 'CANCELACION', 'OPOSICION')),
    status VARCHAR(30) NOT NULL CHECK(status IN ('RECEIVED', 'IN_PROCESS', 'RESOLVED')),
    resolution_date TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. CREATE TABLE accounting_movements_catalog
CREATE TABLE IF NOT EXISTS accounting_movements_catalog (
    code VARCHAR(30) PRIMARY KEY,
    description VARCHAR(150) NOT NULL,
    nature VARCHAR(10) NOT NULL CHECK(nature IN ('DEBIT', 'CREDIT')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Insert Convenios (On Conflict Ignore)
INSERT OR IGNORE INTO convenios (code, display_name, payroll_layout) VALUES 
('AUDITORIA', 'AUDITORIA', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE"}'),
('HACIENDA', 'HACIENDA', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE"}'),
('MUNICIPIO_Q', 'MUNICIPIO Q', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE"}'),
('TRIBUNAL-CONF', 'TRIBUNAL-CONF', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE"}');

-- 10. WORM Triggers para las nuevas tablas inmutables (O-4)
CREATE TRIGGER IF NOT EXISTS trg_worm_upd_insurance_claims BEFORE UPDATE ON insurance_claims 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla insurance_claims es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_insurance_claims BEFORE DELETE ON insurance_claims 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla insurance_claims es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_investor_payments BEFORE UPDATE ON investor_payments 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla investor_payments es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_investor_payments BEFORE DELETE ON investor_payments 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla investor_payments es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_credit_bureau_reports BEFORE UPDATE ON credit_bureau_reports 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla credit_bureau_reports es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_credit_bureau_reports BEFORE DELETE ON credit_bureau_reports 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla credit_bureau_reports es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_cb_report_details BEFORE UPDATE ON credit_bureau_report_details 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla credit_bureau_report_details es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_cb_report_details BEFORE DELETE ON credit_bureau_report_details 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla credit_bureau_report_details es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_arco_requests BEFORE UPDATE ON arco_requests 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla arco_requests es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_arco_requests BEFORE DELETE ON arco_requests 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla arco_requests es inmutable'); END;
