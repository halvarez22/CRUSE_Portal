-- ==============================================================================
-- MIGRACIÓN 009: Modelo de Base de Datos Relacional Definitivo 3FN v4 (CRUSE-APO-2026-019)
-- Fuente: Los 9 Cuestionarios Operativos Respondidos por Administración (Alma)
-- Requerimientos Forenses Qwen (Levantamiento de HOLD):
--   Req 1: Generación de PK único (UUIDv4 RFC-4122 la_<uuid>) y contract_number secuencial único.
--   Req 2: Tabla temporal de mapeo (_tmp_loan_account_map) para migrar todas las FKs hijas a loan_accounts(id).
--   Req 3: Cálculo algebraico determinista de current_principal_balance (principal_original - SUM(applied_capital)).
--   Req 4: Soporte 1:N verificado (hasta 4 créditos normales activos por expediente_id) + Triggers WORM intactos.
-- ==============================================================================

PRAGMA foreign_keys = OFF;

-- ==============================================================================
-- 1. PARÁMETROS FINANCIEROS EDITABLES Y CATÁLOGOS DE CÍRCULO DE CRÉDITO (RN-04, RN-06, RN-08)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_financial_parameters (
    param_key VARCHAR(60) PRIMARY KEY,
    param_numeric_value NUMERIC(14,6),
    param_text_value TEXT,
    description VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system'
);

INSERT OR IGNORE INTO system_financial_parameters (param_key, param_numeric_value, description) VALUES
('ISR_RETENTION_RATE_ANNUAL', 0.009000, 'Tasa de retención anual de ISR sobre intereses de inversionistas (Editable cada 1-2 años)'),
('LIFE_INSURANCE_FORTNIGHTLY_MXN', 22.850000, 'Prima quincenal fija de seguro de vida para créditos normales gubernamentales'),
('LIFE_INSURANCE_COVERAGE_MXN', 35000.000000, 'Suma asegurada fija por cada crédito normal activo (hasta 4 créditos por cliente)'),
('LIFE_INSURANCE_MIN_AGE', 18.000000, 'Edad mínima de elegibilidad para póliza de seguro de vida'),
('LIFE_INSURANCE_MAX_AGE', 65.000000, 'Edad máxima de elegibilidad para póliza de seguro de vida (jubilados >65 exentos)'),
('MAX_ACTIVE_NORMAL_LOANS_PER_CLIENT', 4.000000, 'Máximo de créditos normales simultáneos permitidos y cubiertos por cliente');

CREATE TABLE IF NOT EXISTS credit_bureau_catalogs (
    id VARCHAR(64) PRIMARY KEY,
    catalog_group VARCHAR(40) NOT NULL CHECK (catalog_group IN ('OBSERVATION_KEY', 'CONTRACT_TYPE', 'PAYMENT_FREQUENCY', 'ACCOUNT_STATUS')),
    code VARCHAR(20) NOT NULL,
    description VARCHAR(255) NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system',
    UNIQUE (catalog_group, code)
);

INSERT OR IGNORE INTO credit_bureau_catalogs (id, catalog_group, code, description) VALUES
('cbc_obs_cc', 'OBSERVATION_KEY', 'CC', 'Cuenta cerrada o liquidada con saldo cero'),
('cbc_obs_cl', 'OBSERVATION_KEY', 'CL', 'Cuenta en cobranza extrajudicial / congelada por baja laboral'),
('cbc_obs_rv', 'OBSERVATION_KEY', 'RV', 'Cuenta reestructurada por renovación de crédito normal'),
('cbc_freq_q', 'PAYMENT_FREQUENCY', 'Q', 'Pago Quincenal (Nómina Ordinaria)'),
('cbc_freq_m', 'PAYMENT_FREQUENCY', 'M', 'Pago Mensual (Compensación / Pensión / Emisión Mensual)');

-- ==============================================================================
-- 2. EXTENSIÓN DE CONVENIOS Y EXPEDIENTES + PERSONAS MORALES (RN-07, RN-08, CONDICIÓN 3)
-- ==============================================================================
ALTER TABLE convenios ADD COLUMN default_frequency VARCHAR(15) NOT NULL DEFAULT 'QUINCENAL' CHECK (default_frequency IN ('QUINCENAL', 'MENSUAL'));
ALTER TABLE convenios ADD COLUMN charges_life_insurance INTEGER NOT NULL DEFAULT 1 CHECK (charges_life_insurance IN (0, 1));
ALTER TABLE convenios ADD COLUMN sends_union_letter INTEGER NOT NULL DEFAULT 1 CHECK (sends_union_letter IN (0, 1));

ALTER TABLE expedientes ADD COLUMN person_type VARCHAR(15) NOT NULL DEFAULT 'FISICA' CHECK (person_type IN ('FISICA', 'MORAL'));
ALTER TABLE expedientes ADD COLUMN rfc_masked VARCHAR(20);
ALTER TABLE expedientes ADD COLUMN blind_rfc CHAR(64);
ALTER TABLE expedientes ADD COLUMN gender CHAR(1) CHECK (gender IN ('M', 'F', 'X') OR gender IS NULL);
ALTER TABLE expedientes ADD COLUMN birth_date DATE;
ALTER TABLE expedientes ADD COLUMN gross_income NUMERIC(12,2);
ALTER TABLE expedientes ADD COLUMN payroll_deductions NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_expedientes_blind_rfc ON expedientes (blind_rfc) WHERE blind_rfc IS NOT NULL;

-- Condición 3 de Auditoría: Cifrado AES-GCM-256 Envelope + Blind Index HMAC-SHA256 en Socios y Representante Legal
CREATE TABLE IF NOT EXISTS legal_entity_members (
    id VARCHAR(64) PRIMARY KEY,
    expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
    member_role VARCHAR(30) NOT NULL CHECK (member_role IN ('REPRESENTANTE_LEGAL', 'SOCIO', 'ACCIONISTA', 'OBLIGADO_SOLIDARIO')),
    rfc_masked VARCHAR(20) NOT NULL,
    blind_rfc CHAR(64) NOT NULL,
    encrypted_pii_payload TEXT NOT NULL,
    kek_version INTEGER NOT NULL DEFAULT 1,
    shareholding_percent NUMERIC(5,2) CHECK (shareholding_percent IS NULL OR (shareholding_percent >= 0 AND shareholding_percent <= 100)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_legal_members_expediente ON legal_entity_members (expediente_id);
CREATE INDEX IF NOT EXISTS idx_legal_members_blind_rfc ON legal_entity_members (blind_rfc);

-- ==============================================================================
-- 3. TABLA TEMPORAL DE MAPEO, MIGRACIÓN DE HIJAS Y RECONSTRUCCIÓN DE loan_accounts (REQ 1, 2 Y 3)
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_worm_upd_loan_accounts;
DROP TRIGGER IF EXISTS trg_worm_del_loan_accounts;
DROP TRIGGER IF EXISTS trg_worm_upd_loan_payment_applications;
DROP TRIGGER IF EXISTS trg_worm_del_loan_payment_applications;

-- 3.1 Requerimiento 1 y 2: Mapeo determinista old_expediente_id -> new_loan_account_id (UUIDv4 RFC-4122) y new_contract_number
DROP TABLE IF EXISTS _tmp_loan_account_map;
CREATE TEMP TABLE _tmp_loan_account_map (
    old_expediente_id VARCHAR(64) PRIMARY KEY,
    new_loan_account_id VARCHAR(64) NOT NULL UNIQUE,
    new_contract_number VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO _tmp_loan_account_map (old_expediente_id, new_loan_account_id, new_contract_number)
SELECT
    la.expediente_id AS old_expediente_id,
    'la_' || lower(
        hex(randomblob(4)) || '-' ||
        hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', abs(random()) % 4 + 1, 1) ||
        substr(hex(randomblob(2)), 2) || '-' ||
        hex(randomblob(6))
    ) AS new_loan_account_id,
    printf('CNT-2026-%04d', ROW_NUMBER() OVER (ORDER BY la.activated_at ASC, la.expediente_id ASC)) AS new_contract_number
FROM loan_accounts la;

-- 3.2 Reconstrucción de loan_payment_applications PRIMERO para poblar lpa.loan_account_id (UUIDv4)
CREATE TABLE new_loan_payment_applications (
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
    allocation_mode VARCHAR(20) NOT NULL DEFAULT 'AUTOMATIC' CHECK (allocation_mode IN ('AUTOMATIC', 'MANUAL_OVERRIDE')),
    override_reason TEXT,
    authorized_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (loan_account_id, fortnight_period)
);

INSERT INTO new_loan_payment_applications (
    id, loan_account_id, expediente_id, batch_id, reconciliation_item_id, fortnight_period,
    amount_received, due_insurance, due_interest, due_vat, due_capital,
    applied_insurance, applied_interest, applied_vat, applied_capital,
    balance_before, balance_after, arrears_insurance_after, arrears_interest_after,
    arrears_vat_after, credit_balance_after, allocation_mode, override_reason, authorized_by, created_at
)
SELECT
    lpa.id,
    m.new_loan_account_id AS loan_account_id,
    lpa.expediente_id,
    lpa.batch_id,
    lpa.reconciliation_item_id,
    lpa.fortnight_period,
    lpa.amount_received,
    lpa.due_insurance,
    lpa.due_interest,
    lpa.due_vat,
    lpa.due_capital,
    lpa.applied_insurance,
    lpa.applied_interest,
    lpa.applied_vat,
    lpa.applied_capital,
    lpa.balance_before,
    lpa.balance_after,
    lpa.arrears_insurance_after,
    lpa.arrears_interest_after,
    lpa.arrears_vat_after,
    lpa.credit_balance_after,
    'AUTOMATIC' AS allocation_mode,
    NULL AS override_reason,
    NULL AS authorized_by,
    lpa.created_at
FROM loan_payment_applications lpa
INNER JOIN _tmp_loan_account_map m ON m.old_expediente_id = lpa.expediente_id;

DROP TABLE loan_payment_applications;
ALTER TABLE new_loan_payment_applications RENAME TO loan_payment_applications;

CREATE INDEX IF NOT EXISTS idx_lpa_loan_account_id ON loan_payment_applications (loan_account_id);
CREATE INDEX IF NOT EXISTS idx_lpa_expediente_id ON loan_payment_applications (expediente_id);

CREATE TRIGGER trg_worm_upd_loan_payment_applications BEFORE UPDATE ON loan_payment_applications
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_payment_applications es inmutable'); END;

CREATE TRIGGER trg_worm_del_loan_payment_applications BEFORE DELETE ON loan_payment_applications
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_payment_applications es inmutable'); END;

-- 3.3 Reconstrucción de loan_accounts filtrando current_principal_balance ESTRICTAMENTE por lpa.loan_account_id (Requerimiento 3)
CREATE TABLE new_loan_accounts (
    id VARCHAR(64) PRIMARY KEY,
    contract_number VARCHAR(50) NOT NULL UNIQUE,
    expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
    principal_original NUMERIC(12,2) NOT NULL CHECK (principal_original > 0),
    current_principal_balance NUMERIC(12,2) NOT NULL CHECK (current_principal_balance >= 0),
    fortnightly_payment NUMERIC(12,2) NOT NULL CHECK (fortnightly_payment >= 0),
    payment_frequency VARCHAR(15) NOT NULL DEFAULT 'QUINCENAL' CHECK (payment_frequency IN ('QUINCENAL', 'MENSUAL', 'LIBRE')),
    payroll_source_type VARCHAR(20) NOT NULL DEFAULT 'ORDINARIA' CHECK (payroll_source_type IN ('ORDINARIA', 'COMPENSACION', 'PENSION', 'EXTERNA')),
    first_deduction_period VARCHAR(15) NOT NULL,
    union_official_letter_no VARCHAR(100),
    disbursement_method VARCHAR(20) NOT NULL DEFAULT 'SPEI' CHECK (disbursement_method IN ('SPEI', 'CHEQUE', 'VENTANILLA')),
    disbursement_reference VARCHAR(100),
    activated_at TIMESTAMP NOT NULL,
    activated_by VARCHAR(255) NOT NULL,
    product_type VARCHAR(30) NOT NULL DEFAULT 'NOMINA_NORMAL' CHECK (product_type IN ('NOMINA_NORMAL', 'EXPRESS', 'ESPECIAL')),
    insurance_required INTEGER NOT NULL DEFAULT 1 CHECK (insurance_required IN (0, 1)),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'NOMINA' CHECK (payment_method IN ('NOMINA', 'SPEI', 'VENTANILLA', 'CHEQUE')),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED_LEAVE', 'FROZEN_EXTRAJUDICIAL', 'RESTRUCTURED', 'PAID_OFF')),
    reports_to_credit_bureau INTEGER NOT NULL DEFAULT 1 CHECK (reports_to_credit_bureau IN (0, 1)),
    capacity_override_flag INTEGER NOT NULL DEFAULT 0 CHECK (capacity_override_flag IN (0, 1)),
    capacity_override_reason TEXT,
    capacity_override_by VARCHAR(255)
);

-- Requerimiento 3: Cálculo algebraico determinista filtrando ESTRICTAMENTE por lpa.loan_account_id = m.new_loan_account_id (la.id)
INSERT INTO new_loan_accounts (
    id,
    contract_number,
    expediente_id,
    principal_original,
    current_principal_balance,
    fortnightly_payment,
    payment_frequency,
    payroll_source_type,
    first_deduction_period,
    union_official_letter_no,
    disbursement_method,
    disbursement_reference,
    activated_at,
    activated_by,
    product_type,
    insurance_required,
    payment_method,
    status,
    reports_to_credit_bureau,
    capacity_override_flag,
    capacity_override_reason,
    capacity_override_by
)
SELECT
    m.new_loan_account_id AS id,
    m.new_contract_number AS contract_number,
    la.expediente_id,
    la.principal_original,
    ROUND(
        MAX(
            0,
            la.principal_original - COALESCE(
                (SELECT SUM(lpa.applied_capital)
                 FROM loan_payment_applications lpa
                 WHERE lpa.loan_account_id = m.new_loan_account_id),
                0
            )
        ),
        2
    ) AS current_principal_balance,
    la.fortnightly_payment,
    'QUINCENAL' AS payment_frequency,
    'ORDINARIA' AS payroll_source_type,
    la.first_deduction_period,
    NULL AS union_official_letter_no,
    'SPEI' AS disbursement_method,
    NULL AS disbursement_reference,
    la.activated_at,
    la.activated_by,
    la.product_type,
    la.insurance_required,
    la.payment_method,
    'ACTIVE' AS status,
    la.reports_to_credit_bureau,
    0 AS capacity_override_flag,
    NULL AS capacity_override_reason,
    NULL AS capacity_override_by
FROM loan_accounts la
INNER JOIN _tmp_loan_account_map m ON m.old_expediente_id = la.expediente_id;

DROP TABLE loan_accounts;
ALTER TABLE new_loan_accounts RENAME TO loan_accounts;

CREATE INDEX IF NOT EXISTS idx_loan_accounts_expediente_id ON loan_accounts (expediente_id);
CREATE INDEX IF NOT EXISTS idx_loan_accounts_status_product ON loan_accounts (status, product_type);

-- Recreación estricta de Triggers WORM para loan_accounts (Condición 1)
CREATE TRIGGER trg_worm_upd_loan_accounts BEFORE UPDATE ON loan_accounts
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_accounts es inmutable'); END;

CREATE TRIGGER trg_worm_del_loan_accounts BEFORE DELETE ON loan_accounts
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_accounts es inmutable'); END;

-- Trigger de Regla de Negocio RN-08: Máximo 4 créditos normales activos simultáneos por cliente
CREATE TRIGGER trg_max_4_normal_loans_per_client BEFORE INSERT ON loan_accounts
WHEN NEW.product_type = 'NOMINA_NORMAL' AND NEW.status = 'ACTIVE'
BEGIN
    SELECT CASE
        WHEN (
            SELECT COUNT(*) FROM loan_accounts
            WHERE expediente_id = NEW.expediente_id
              AND product_type = 'NOMINA_NORMAL'
              AND status = 'ACTIVE'
        ) >= 4
        THEN RAISE(ABORT, 'REGLA DE NEGOCIO RN-08: El acreditado ya cuenta con el máximo de 4 créditos normales activos permitidos por la póliza colectiva.')
    END;
END;

-- ==============================================================================
-- 4. ACTUALIZACIÓN DEL RESTO DE TABLAS HIJAS MEDIANTE _tmp_loan_account_map (REQUERIMIENTO 2)
-- ==============================================================================

-- 4.2 Reconstrucción de amortization_schedules traduciendo loan_account_id mediante _tmp_loan_account_map
CREATE TABLE new_amortization_schedules (
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
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(loan_account_id, period_number)
);

INSERT INTO new_amortization_schedules (
    id, loan_account_id, period_number, due_date, expected_capital,
    expected_interest, expected_vat, expected_insurance, expected_payment, expected_balance, created_at
)
SELECT
    am.id,
    m.new_loan_account_id AS loan_account_id,
    am.period_number,
    am.due_date,
    am.expected_capital,
    am.expected_interest,
    am.expected_vat,
    am.expected_insurance,
    am.expected_payment,
    am.expected_balance,
    am.created_at
FROM amortization_schedules am
INNER JOIN _tmp_loan_account_map m ON m.old_expediente_id = am.loan_account_id;

DROP TABLE amortization_schedules;
ALTER TABLE new_amortization_schedules RENAME TO amortization_schedules;

-- 4.3 Reconstrucción de insurance_claims traduciendo loan_account_id mediante _tmp_loan_account_map
DROP TRIGGER IF EXISTS trg_worm_upd_insurance_claims;
DROP TRIGGER IF EXISTS trg_worm_del_insurance_claims;

CREATE TABLE new_insurance_claims (
    id VARCHAR(64) PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    event_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    amount_paid NUMERIC(12,2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO new_insurance_claims (
    id, policy_id, loan_account_id, event_date, status, amount_paid, created_at
)
SELECT
    ic.id,
    ic.policy_id,
    m.new_loan_account_id AS loan_account_id,
    ic.event_date,
    ic.status,
    ic.amount_paid,
    ic.created_at
FROM insurance_claims ic
INNER JOIN _tmp_loan_account_map m ON m.old_expediente_id = ic.loan_account_id;

DROP TABLE insurance_claims;
ALTER TABLE new_insurance_claims RENAME TO insurance_claims;

CREATE TRIGGER trg_worm_upd_insurance_claims BEFORE UPDATE ON insurance_claims
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla insurance_claims es inmutable'); END;

CREATE TRIGGER trg_worm_del_insurance_claims BEFORE DELETE ON insurance_claims
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla insurance_claims es inmutable'); END;

-- 4.4 Reconstrucción de credit_bureau_report_details traduciendo loan_account_id mediante _tmp_loan_account_map
DROP TRIGGER IF EXISTS trg_worm_upd_cb_report_details;
DROP TRIGGER IF EXISTS trg_worm_del_cb_report_details;

CREATE TABLE new_credit_bureau_report_details (
    id VARCHAR(64) PRIMARY KEY,
    report_id VARCHAR(64) NOT NULL REFERENCES credit_bureau_reports(id) ON DELETE RESTRICT,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    reported_balance NUMERIC(12,2) NOT NULL,
    days_past_due INTEGER NOT NULL,
    observation_code VARCHAR(10),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO new_credit_bureau_report_details (
    id, report_id, loan_account_id, reported_balance, days_past_due, observation_code, created_at
)
SELECT
    cbd.id,
    cbd.report_id,
    m.new_loan_account_id AS loan_account_id,
    cbd.reported_balance,
    cbd.days_past_due,
    NULL AS observation_code,
    cbd.created_at
FROM credit_bureau_report_details cbd
INNER JOIN _tmp_loan_account_map m ON m.old_expediente_id = cbd.loan_account_id;

DROP TABLE credit_bureau_report_details;
ALTER TABLE new_credit_bureau_report_details RENAME TO credit_bureau_report_details;

CREATE TRIGGER trg_worm_upd_cb_report_details BEFORE UPDATE ON credit_bureau_report_details
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla credit_bureau_report_details es inmutable'); END;

CREATE TRIGGER trg_worm_del_cb_report_details BEFORE DELETE ON credit_bureau_report_details
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla credit_bureau_report_details es inmutable'); END;

-- 4.5 Reconstrucción de documents para soportar CONTRATO EN PDF por crédito (RN-03)
CREATE TABLE new_documents (
    id VARCHAR(64) PRIMARY KEY,
    expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
    loan_account_id VARCHAR(64) REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('INE_FRONT', 'INE_BACK', 'PAYSTUB', 'PROOF_OF_ADDRESS', 'CONTRACT_PDF', 'PROMISSORY_NOTE', 'PAYROLL_MANDATE', 'OTHER')),
    encrypted_s3_key VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO new_documents (id, expediente_id, loan_account_id, type, encrypted_s3_key, upload_date)
SELECT
    d.id,
    d.expediente_id,
    m.new_loan_account_id AS loan_account_id,
    d.type,
    d.encrypted_s3_key,
    d.upload_date
FROM documents d
LEFT JOIN _tmp_loan_account_map m ON m.old_expediente_id = d.expediente_id;

DROP TABLE documents;
ALTER TABLE new_documents RENAME TO documents;

-- Purgar tabla temporal de mapeo tras migrar todas las tablas hijas
DROP TABLE _tmp_loan_account_map;

-- ==============================================================================
-- 5. NUEVAS ENTIDADES DEL MODELO DEFINITIVO 3FN V4 (RN-01, RN-02, RN-04, RN-08, RN-10, RN-11)
-- ==============================================================================

-- 5.1 Movimientos de Línea Abierta para Crédito Especial sin Tabla de Amortización (RN-01) [WORM]
CREATE TABLE IF NOT EXISTS special_credit_movements (
    id VARCHAR(64) PRIMARY KEY,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    movement_date DATE NOT NULL,
    movement_type VARCHAR(25) NOT NULL CHECK (movement_type IN ('DISPOSICION', 'ABONO', 'CARGO_INTERES')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    balance_before NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    disbursement_method VARCHAR(20) CHECK (disbursement_method IN ('SPEI', 'CHEQUE', 'EFECTIVO', 'TRANSFERENCIA') OR disbursement_method IS NULL),
    reference_number VARCHAR(100),
    recorded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_special_credit_movements BEFORE UPDATE ON special_credit_movements
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla special_credit_movements es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_special_credit_movements BEFORE DELETE ON special_credit_movements
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla special_credit_movements es inmutable'); END;

-- 5.2 Reestructuras de Créditos Normales (Hasta 4 créditos absorbidos; prohibido en Express — RN-11) [WORM]
CREATE TABLE IF NOT EXISTS loan_restructures (
    id VARCHAR(64) PRIMARY KEY,
    new_loan_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    previous_loan_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    absorbed_payoff_amount NUMERIC(12,2) NOT NULL CHECK (absorbed_payoff_amount >= 0),
    authorized_by VARCHAR(255) NOT NULL,
    restructured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (new_loan_id, previous_loan_id)
);

CREATE TRIGGER IF NOT EXISTS trg_no_express_restructure BEFORE INSERT ON loan_restructures
BEGIN
    SELECT CASE
        WHEN (SELECT product_type FROM loan_accounts WHERE id = NEW.previous_loan_id) = 'EXPRESS'
          OR (SELECT product_type FROM loan_accounts WHERE id = NEW.new_loan_id) = 'EXPRESS'
        THEN RAISE(ABORT, 'REGLA DE NEGOCIO RN-11: Los créditos EXPRESS no son sujetos de reestructura.')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_loan_restructures BEFORE UPDATE ON loan_restructures
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_restructures es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_loan_restructures BEFORE DELETE ON loan_restructures
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_restructures es inmutable'); END;

-- 5.3 Periodos de Suspensión por Licencia sin Goce de Sueldo (RN-10)
CREATE TABLE IF NOT EXISTS loan_suspension_periods (
    id VARCHAR(64) PRIMARY KEY,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    start_period VARCHAR(15) NOT NULL,
    end_period VARCHAR(15),
    reason VARCHAR(50) NOT NULL DEFAULT 'LICENCIA_SIN_GOCE',
    status VARCHAR(25) NOT NULL DEFAULT 'ACTIVE_SUSPENSION' CHECK (status IN ('ACTIVE_SUSPENSION', 'REACTIVATED')),
    approved_by VARCHAR(255) NOT NULL,
    reactivated_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5.4 Inscripciones a Póliza de Seguro de Vida por Crédito Activo ($35,000 c/u hasta 4 créditos — RN-08)
CREATE TABLE IF NOT EXISTS loan_insurance_enrollments (
    id VARCHAR(64) PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
    loan_account_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(id) ON DELETE RESTRICT,
    insured_amount NUMERIC(12,2) NOT NULL DEFAULT 35000.00,
    period_premium NUMERIC(12,2) NOT NULL DEFAULT 22.85,
    first_payment_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXCLUDED_AGE_OVER_65', 'EXCLUDED_DEMANDA', 'EXCLUDED_CONVENIO', 'CLOSED')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (policy_id, loan_account_id)
);

-- 5.5 Evolución del Módulo de Inversionistas (Interés Simple vs Compuesto Capitalizado + Exención ISR — RN-04 y Condición 4)
ALTER TABLE investors ADD COLUMN applies_isr INTEGER NOT NULL DEFAULT 1 CHECK (applies_isr IN (0, 1));
ALTER TABLE investors ADD COLUMN requires_invoice INTEGER NOT NULL DEFAULT 0 CHECK (requires_invoice IN (0, 1));

ALTER TABLE investments ADD COLUMN interest_type VARCHAR(20) NOT NULL DEFAULT 'SIMPLE' CHECK (interest_type IN ('SIMPLE', 'COMPOUND'));
ALTER TABLE investments ADD COLUMN current_capital NUMERIC(12,2) NOT NULL DEFAULT 0.00;
UPDATE investments SET current_capital = capital WHERE current_capital = 0.00;

CREATE TABLE IF NOT EXISTS investment_capital_movements (
    id VARCHAR(64) PRIMARY KEY,
    investment_id VARCHAR(64) NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
    movement_date DATE NOT NULL,
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('DEPOSIT', 'WITHDRAWAL', 'CAPITALIZATION')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    capital_before NUMERIC(12,2) NOT NULL,
    capital_after NUMERIC(12,2) NOT NULL,
    reference_number VARCHAR(100) NOT NULL,
    recorded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_investment_cap_movements BEFORE UPDATE ON investment_capital_movements
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla investment_capital_movements es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_investment_cap_movements BEFORE DELETE ON investment_capital_movements
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla investment_capital_movements es inmutable'); END;

-- 5.6 Block de Notas / Bitácora Operativa Siempre Visible en Créditos e Inversionistas (RN-02 y RN-04)
CREATE TABLE IF NOT EXISTS operational_notes (
    id VARCHAR(64) PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('LOAN_ACCOUNT', 'INVESTOR', 'INVESTMENT', 'EXPEDIENTE')),
    entity_id VARCHAR(64) NOT NULL,
    note_content TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 1 CHECK (is_pinned IN (0, 1)),
    author_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operational_notes_entity ON operational_notes (entity_type, entity_id, is_pinned);

PRAGMA foreign_keys = ON;
