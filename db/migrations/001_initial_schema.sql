-- ==============================================================================
-- MIGRACIÓN 001: Esquema Inicial de Base de Datos Relacional
-- Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
-- Expediente: CRUSE-APO-2026-003
-- ==============================================================================

-- 1. Tabla de Control de Migraciones
CREATE TABLE IF NOT EXISTS _schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum CHAR(64) NOT NULL,
    execution_time_ms INTEGER NOT NULL
);

-- 2. Tabla: audit_events (Bitácora Forense Inmutable)
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    record_hash CHAR(64) NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events (ts);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_events_blind_curp ON audit_events (blind_curp_prefix);

-- 3. Tabla: expedientes (Expedientes de Crédito de Nómina)
CREATE TABLE IF NOT EXISTS expedientes (
    id VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    full_name VARCHAR(255) NOT NULL,
    curp_masked VARCHAR(20) NOT NULL,
    blind_curp CHAR(64) NOT NULL UNIQUE,
    voter_id VARCHAR(50),
    address TEXT NOT NULL,
    phone VARCHAR(30) NOT NULL,
    requested_amount NUMERIC(12, 2) NOT NULL,
    term_fortnights INTEGER NOT NULL,
    product_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'capturado',
    promotor_email VARCHAR(255) NOT NULL,
    encrypted_thumb_payload TEXT,
    kek_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_expedientes_status ON expedientes (status);
CREATE INDEX IF NOT EXISTS idx_expedientes_blind_curp ON expedientes (blind_curp);
CREATE INDEX IF NOT EXISTS idx_expedientes_promotor ON expedientes (promotor_email);

-- 4. Tabla: expedientes_status_history (Trazabilidad de Conciliación)
CREATE TABLE IF NOT EXISTS expedientes_status_history (
    id VARCHAR(64) PRIMARY KEY,
    expediente_id VARCHAR(64) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    actor_email VARCHAR(255) NOT NULL,
    notes TEXT
);
