-- =================================================================================
-- MIGRACIÓN 019 (SQLite): HOMOLOGACIÓN FINA DEL FLUJO DE CUMPLIMIENTO CNBV (FASE 2)
-- Expediente: CRUSE-APO-2026-065 (Guardrails Forenses 1, 2, 3 y 4)
-- 1. Revisión Semestral de Perfil Transaccional (180 días) con Trazabilidad Dual WORM
-- 2. Catálogo GAFI (Jurisdicciones de Alto Riesgo) y SHCP ReFiPres (Paraísos Fiscales)
-- 3. Prórroga Extraordinaria CCC (+30 Días Naturales = 90 días) con Sello SHA-256 WORM
-- 4. Escalamiento Inmutable a Reporte de 24 Horas con Prefijo Determinista Columna 40
-- =================================================================================

-- 1. Columnas para Prórroga Extraordinaria CCC (+30 días) y Escalamiento 24 Horas en Reportes CNBV
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN extraordinary_extension_granted INTEGER NOT NULL DEFAULT 0 CHECK (extraordinary_extension_granted IN (0, 1));
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN original_investigation_deadline_at TIMESTAMP DEFAULT NULL;
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN extension_justification_notes TEXT DEFAULT NULL;
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN extension_granted_by VARCHAR(255) DEFAULT NULL;
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN extension_granted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN extension_expediente_sha256 CHAR(64) DEFAULT NULL;

ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN is_escalated_24h INTEGER NOT NULL DEFAULT 0 CHECK (is_escalated_24h IN (0, 1));
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN submission_deadline_24h_at TIMESTAMP DEFAULT NULL;
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN ccc_next_session_notified INTEGER NOT NULL DEFAULT 0 CHECK (ccc_next_session_notified IN (0, 1));
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN cancelled_24h_by_authority INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_24h_by_authority IN (0, 1));
ALTER TABLE pld_cnbv_reports_and_whistleblowing ADD COLUMN cancel_24h_justification_notes TEXT DEFAULT NULL;

-- 2. Bitácora Inmutable WORM de Prórrogas Extraordinarias CCC (+30 días) y Revocaciones (Guardrail 1)
CREATE TABLE IF NOT EXISTS pld_ccc_extension_worm_events (
  id VARCHAR(64) PRIMARY KEY,
  report_id VARCHAR(64) NOT NULL REFERENCES pld_cnbv_reports_and_whistleblowing(id) ON DELETE RESTRICT,
  event_type VARCHAR(45) NOT NULL CHECK (event_type IN ('CCC_EXTRAORDINARY_EXTENSION_GRANTED', 'CCC_EXTENSION_REVOKED')),
  justification_text TEXT NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  source_ip VARCHAR(64) NOT NULL,
  original_deadline TIMESTAMP NOT NULL,
  new_deadline TIMESTAMP NOT NULL,
  expediente_sha256 CHAR(64) NOT NULL,
  record_sha256_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_pld_ccc_extension_worm_events
BEFORE UPDATE ON pld_ccc_extension_worm_events
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en pld_ccc_extension_worm_events es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_pld_ccc_extension_worm_events
BEFORE DELETE ON pld_ccc_extension_worm_events
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en pld_ccc_extension_worm_events es inmutable (WORM). Operación DELETE bloqueada.');
END;

-- 3. Catálogo Oficial de Jurisdicciones de Alto Riesgo GAFI y Paraísos Fiscales ReFiPres SHCP (Guardrail 3)
CREATE TABLE IF NOT EXISTS pld_gafi_refipres_jurisdictions (
  id VARCHAR(64) PRIMARY KEY,
  list_type VARCHAR(40) NOT NULL CHECK (list_type IN ('GAFI_HIGH_RISK_JURISDICTIONS', 'SHCP_REFIPRES_TAX_HAVENS')),
  jurisdiction_iso3166_alpha2 CHAR(2) NOT NULL,
  jurisdiction_name VARCHAR(160) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  official_publication_date VARCHAR(20) NOT NULL,
  risk_classification_note TEXT NOT NULL,
  recorded_by VARCHAR(255) NOT NULL,
  record_sha256_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (jurisdiction_iso3166_alpha2, list_type, official_publication_date)
);

CREATE INDEX IF NOT EXISTS idx_gafi_refipres_iso_type ON pld_gafi_refipres_jurisdictions(jurisdiction_iso3166_alpha2, list_type);

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_pld_gafi_refipres_jurisdictions
BEFORE UPDATE ON pld_gafi_refipres_jurisdictions
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El catálogo pld_gafi_refipres_jurisdictions es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_pld_gafi_refipres_jurisdictions
BEFORE DELETE ON pld_gafi_refipres_jurisdictions
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El catálogo pld_gafi_refipres_jurisdictions es inmutable (WORM). Operación DELETE bloqueada.');
END;

-- Semilla Oficial Inicial GAFI y SHCP ReFiPres (Fracción X Cap. X DCG Art. 115 LIC)
INSERT OR IGNORE INTO pld_gafi_refipres_jurisdictions (
  id, list_type, jurisdiction_iso3166_alpha2, jurisdiction_name,
  source_url, official_publication_date, risk_classification_note,
  recorded_by, record_sha256_hash
) VALUES
  ('gafi_jur_kp_2026', 'GAFI_HIGH_RISK_JURISDICTIONS', 'KP', 'REPUBLICA POPULAR DEMOCRATICA DE COREA', 'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html', '2026-02-23', 'Lista Negra GAFI: Jurisdicción sujeta a llamado a la acción (contramedidas PLD/FT).', 'system_cnbv', 'a111111111111111111111111111111111111111111111111111111111111101'),
  ('gafi_jur_ir_2026', 'GAFI_HIGH_RISK_JURISDICTIONS', 'IR', 'REPUBLICA ISLAMICA DE IRAN', 'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html', '2026-02-23', 'Lista Negra GAFI: Jurisdicción con deficiencias estratégicas severas en PLD/FT.', 'system_cnbv', 'a111111111111111111111111111111111111111111111111111111111111102'),
  ('gafi_jur_mm_2026', 'GAFI_HIGH_RISK_JURISDICTIONS', 'MM', 'MYANMAR (BIRMANIA)', 'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html', '2026-02-23', 'Lista GAFI: Jurisdicción sujeta a debida diligencia reforzada.', 'system_cnbv', 'a111111111111111111111111111111111111111111111111111111111111103'),
  ('shcp_ref_ky_2026', 'SHCP_REFIPRES_TAX_HAVENS', 'KY', 'ISLAS CAIMAN (TERRITORIO REFIPRE)', 'https://www.dof.gob.mx/nota_detalle_shcp_refipres_anexo.php', '2026-01-15', 'Disposiciones SHCP / LISR Titel VI: Régimen Fiscal Preferente (Paraíso Fiscal).', 'system_cnbv', 'b222222222222222222222222222222222222222222222222222222222222201'),
  ('shcp_ref_vg_2026', 'SHCP_REFIPRES_TAX_HAVENS', 'VG', 'ISLAS VIRGENES BRITANICAS (BVI REFIPRE)', 'https://www.dof.gob.mx/nota_detalle_shcp_refipres_anexo.php', '2026-01-15', 'Disposiciones SHCP / LISR Título VI: Régimen Fiscal Preferente (Paraíso Fiscal).', 'system_cnbv', 'b222222222222222222222222222222222222222222222222222222222222202');

-- 4. Historial Inmutable WORM de Revisiones Semestrales de Perfil Transaccional (Guardrail 4 — Diagrama Lic. Gerardo)
CREATE TABLE IF NOT EXISTS expediente_semester_reviews_worm (
  id VARCHAR(64) PRIMARY KEY,
  expediente_id VARCHAR(64) NOT NULL REFERENCES expedientes(id) ON DELETE RESTRICT,
  profile_changed INTEGER NOT NULL CHECK (profile_changed IN (0, 1)),
  requires_inusual_report INTEGER DEFAULT NULL CHECK (requires_inusual_report IS NULL OR requires_inusual_report IN (0, 1)),
  previous_transactional_profile_mxn NUMERIC(14,2) NOT NULL,
  updated_transactional_profile_mxn NUMERIC(14,2) NOT NULL,
  previous_risk_grade VARCHAR(10) NOT NULL CHECK (previous_risk_grade IN ('BAJO', 'MEDIO', 'ALTO')),
  updated_risk_grade VARCHAR(10) NOT NULL CHECK (updated_risk_grade IN ('BAJO', 'MEDIO', 'ALTO')),
  generated_report_id VARCHAR(64) DEFAULT NULL REFERENCES pld_cnbv_reports_and_whistleblowing(id) ON DELETE RESTRICT,
  review_justification_notes TEXT NOT NULL,
  worm_action VARCHAR(50) NOT NULL CHECK (worm_action IN ('SEMESTER_REVIEW_NO_CHANGES', 'SEMESTER_REVIEW_ESCALATED_TO_ROI', 'SEMESTER_REVIEW_PROFILE_UPDATED_NO_ROI')),
  record_sha256_hash CHAR(64) NOT NULL UNIQUE,
  reviewed_by_email VARCHAR(255) NOT NULL,
  reviewed_by_role VARCHAR(40) NOT NULL,
  source_ip VARCHAR(64) NOT NULL,
  next_semester_review_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sem_rev_worm_exp ON expediente_semester_reviews_worm(expediente_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_expediente_semester_reviews_worm
BEFORE UPDATE ON expediente_semester_reviews_worm
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El historial expediente_semester_reviews_worm es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE TRIGGER IF NOT EXISTS trg_worm_del_expediente_semester_reviews_worm
BEFORE DELETE ON expediente_semester_reviews_worm
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El historial expediente_semester_reviews_worm es inmutable (WORM). Operación DELETE bloqueada.');
END;
