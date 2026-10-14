-- ==============================================================================
-- MIGRACIÓN 006: Esquema de Remediación (CRUSE-APO-2026-005, Bloque B)
-- - convenios:             catálogo de dependencias gubernamentales
-- - expedientes:           reconstrucción con convenio, check constraints
-- - loan_accounts:         cuentas de crédito dispersadas
-- - reconciliation_batches: índice único convenio+periodo
-- - loan_payment_applications: libro mayor (append-only)
-- - audit_events:          cadena v2 (hash_version, chain_seq)
-- ==============================================================================

-- 1. Catálogo de convenios
CREATE TABLE IF NOT EXISTS convenios (
  code          VARCHAR(40) PRIMARY KEY,
  display_name  VARCHAR(150) NOT NULL,
  payroll_layout TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1
);

INSERT INTO convenios (code, display_name, payroll_layout) VALUES
 ('STSGECH', 'Sindicato de Trabajadores al Servicio del Gobierno del Estado de Chihuahua', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE_RETENIDO"}'),
 ('SUPREMO_TRIBUNAL', 'Supremo Tribunal de Justicia del Estado de Chihuahua', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE_RETENIDO"}');

-- 2. Reconstrucción de expedientes
CREATE TABLE IF NOT EXISTS expedientes_v6 (
  id VARCHAR(64) PRIMARY KEY, 
  created_at TIMESTAMP NOT NULL, 
  updated_at TIMESTAMP NOT NULL,
  convenio VARCHAR(40) NOT NULL REFERENCES convenios(code),
  full_name VARCHAR(255) NOT NULL, 
  curp_masked VARCHAR(20) NOT NULL, 
  blind_curp CHAR(64) NOT NULL UNIQUE,
  voter_id VARCHAR(50), 
  address TEXT NOT NULL, 
  phone VARCHAR(30) NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL CHECK (requested_amount > 0),
  term_fortnights INTEGER NOT NULL CHECK (term_fortnights > 0),
  product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('normal','express')),
  status VARCHAR(30) NOT NULL DEFAULT 'capturado'
    CHECK (status IN ('capturado','aprobado','rechazado','activo','liquidado')),
  promotor_email VARCHAR(255) NOT NULL, 
  encrypted_thumb_payload TEXT, 
  kek_version INTEGER NOT NULL DEFAULT 1
);

-- Migrar datos existentes fallará intencionalmente si hay datos (el NULL violará el NOT NULL de convenio), 
-- garantizando fail-fast como se especificó, ya que debió vaciarse la BD.
INSERT INTO expedientes_v6 SELECT 
  id, created_at, updated_at, NULL, 
  full_name, curp_masked, blind_curp, voter_id, address, phone, requested_amount, term_fortnights,
  product_type, CASE status WHEN 'conciliado' THEN 'activo' ELSE status END,
  promotor_email, encrypted_thumb_payload, kek_version 
FROM expedientes;

DROP TABLE expedientes;
ALTER TABLE expedientes_v6 RENAME TO expedientes;

CREATE INDEX idx_expedientes_convenio_status ON expedientes (convenio, status);

-- 3. Cuenta de crédito (después de dispersión)
CREATE TABLE IF NOT EXISTS loan_accounts (
  expediente_id VARCHAR(64) PRIMARY KEY REFERENCES expedientes(id) ON DELETE RESTRICT,
  principal_original NUMERIC(12,2) NOT NULL, 
  fortnightly_payment NUMERIC(12,2) NOT NULL,
  first_deduction_period VARCHAR(10) NOT NULL CHECK (first_deduction_period GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[12]Q'),
  activated_at TIMESTAMP NOT NULL, 
  activated_by VARCHAR(255) NOT NULL
);

-- 4. Conciliación (Lotes) - Restricción Única
CREATE UNIQUE INDEX uq_reconciliation_convenio_periodo ON reconciliation_batches (agreement_name, fortnight_period);

-- 5. Aplicación de Pagos (Libro Mayor)
CREATE TABLE IF NOT EXISTS loan_payment_applications (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES loan_accounts(expediente_id) ON DELETE RESTRICT,
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (expediente_id, fortnight_period)
);

-- 6. Auditoría v2
ALTER TABLE audit_events ADD COLUMN hash_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE audit_events ADD COLUMN chain_seq INTEGER;
CREATE UNIQUE INDEX uq_audit_chain_seq ON audit_events (chain_seq) WHERE chain_seq IS NOT NULL;

-- 7. Triggers WORM extendidos para nuevas tablas inmutables
CREATE TRIGGER IF NOT EXISTS trg_worm_upd_convenios BEFORE UPDATE ON convenios 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla convenios es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_convenios BEFORE DELETE ON convenios 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla convenios es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_loan_accounts BEFORE UPDATE ON loan_accounts 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_accounts es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_loan_accounts BEFORE DELETE ON loan_accounts 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_accounts es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_loan_payment_applications BEFORE UPDATE ON loan_payment_applications 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_payment_applications es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_loan_payment_applications BEFORE DELETE ON loan_payment_applications 
BEGIN SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La tabla loan_payment_applications es inmutable'); END;
