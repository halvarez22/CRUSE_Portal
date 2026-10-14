-- ==============================================================================
-- MIGRACIÓN 004: Tablas para el Motor de Conciliación Quincenal Automatizado
-- Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
-- Expediente: CRUSE-APO-2026-004
-- ==============================================================================

-- 1. Lotes de Conciliación Quincenal
CREATE TABLE IF NOT EXISTS reconciliation_batches (
    id VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    agreement_name VARCHAR(100) NOT NULL,
    fortnight_period VARCHAR(20) NOT NULL,
    total_records INTEGER NOT NULL,
    total_amount_expected NUMERIC(14, 2) NOT NULL,
    total_amount_received NUMERIC(14, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'procesado',
    officer_email VARCHAR(255) NOT NULL,
    batch_manifest_hash CHAR(64) NOT NULL UNIQUE,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_period ON reconciliation_batches (fortnight_period);
CREATE INDEX IF NOT EXISTS idx_reconciliation_agreement ON reconciliation_batches (agreement_name);

-- 2. Detalle de Partidas Conciliadas
CREATE TABLE IF NOT EXISTS reconciliation_items (
    id VARCHAR(64) PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL,
    expediente_id VARCHAR(64),
    blind_curp CHAR(64) NOT NULL,
    curp_masked VARCHAR(20) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    expected_payment NUMERIC(12, 2) NOT NULL,
    actual_payment NUMERIC(12, 2) NOT NULL,
    difference NUMERIC(12, 2) NOT NULL,
    status VARCHAR(40) NOT NULL,
    audit_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_items_batch ON reconciliation_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_status ON reconciliation_items (status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_blind ON reconciliation_items (blind_curp);
