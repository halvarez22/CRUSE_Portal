-- ============================================================================
-- MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.
-- MIGRACIÓN 011 (SQLITE 3FN v4): HUBS NACIONALES (CHIHUAHUA, LEÓN, CANCÚN) Y BENCHMARKS DE COMPETENCIA
-- Expediente: CRUSE-APO-2026-029 (Guardrail Forense 4: Backfill Determinista)
-- ============================================================================

INSERT OR IGNORE INTO convenios (code, display_name, payroll_layout, active, default_frequency, charges_life_insurance, sends_union_letter) VALUES
  ('PODER_JUDICIAL_GTO', 'Poder Judicial del Estado de Guanajuato (Hub León)', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE_RETENIDO"}', 1, 'QUINCENAL', 1, 1),
  ('SINDICATO_SALUD_GTO', 'Sindicatos del Sector Salud y Magisterio de Guanajuato (Hub León)', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE_RETENIDO"}', 1, 'QUINCENAL', 1, 1),
  ('PODER_JUDICIAL_QROO', 'Poder Judicial del Estado de Quintana Roo (Hub Cancún)', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE_RETENIDO"}', 1, 'QUINCENAL', 1, 1),
  ('AYUNTAMIENTO_CANCUN', 'Ayuntamiento de Benito Juárez Cancún y Riviera Maya (Hub Cancún)', '{"curp":"CURP","name":"NOMBRE","amount":"IMPORTE_RETENIDO"}', 1, 'QUINCENAL', 1, 1);

ALTER TABLE expedientes ADD COLUMN hub_region VARCHAR(30) NOT NULL DEFAULT 'CHIHUAHUA';
ALTER TABLE loan_accounts ADD COLUMN hub_region VARCHAR(30) NOT NULL DEFAULT 'CHIHUAHUA';

UPDATE expedientes
SET hub_region = CASE
  WHEN convenio IN ('STSGECH', 'SUPREMO_TRIBUNAL', 'HACIENDA') THEN 'CHIHUAHUA'
  WHEN convenio IN ('MUNICIPIO_Q', 'AUDITORIA', 'PODER_JUDICIAL_GTO', 'SINDICATO_SALUD_GTO') THEN 'LEON'
  WHEN convenio IN ('TRIBUNAL-CONF', 'PODER_JUDICIAL_QROO', 'AYUNTAMIENTO_CANCUN') THEN 'CANCUN'
  ELSE 'CHIHUAHUA'
END;

DROP TRIGGER IF EXISTS trg_worm_upd_loan_accounts;

UPDATE loan_accounts
SET hub_region = COALESCE(
  (SELECT e.hub_region FROM expedientes e WHERE e.id = loan_accounts.expediente_id),
  'CHIHUAHUA'
);

CREATE TRIGGER IF NOT EXISTS trg_worm_upd_loan_accounts
BEFORE UPDATE ON loan_accounts
BEGIN
  SELECT RAISE(ABORT, 'WORM_VIOLATION: El registro en la tabla loan_accounts es inmutable (WORM). Operación UPDATE bloqueada.');
END;

CREATE INDEX IF NOT EXISTS idx_expedientes_hub_region ON expedientes(hub_region);
CREATE INDEX IF NOT EXISTS idx_loan_accounts_hub_region ON loan_accounts(hub_region);

CREATE TABLE IF NOT EXISTS competitor_benchmarks (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  sample_loan NUMERIC(12,2) NOT NULL DEFAULT 10000.00,
  sample_term_quincenas INTEGER NOT NULL DEFAULT 24,
  sample_fortnightly_payment NUMERIC(12,2) NOT NULL,
  sample_total_payment NUMERIC(12,2) NOT NULL,
  annual_interest_rate VARCHAR(80) NOT NULL,
  commissions VARCHAR(255) NOT NULL,
  target_audience VARCHAR(150) NOT NULL,
  requires_bureau INTEGER NOT NULL DEFAULT 1,
  speed VARCHAR(100) NOT NULL,
  is_cruse INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NOT NULL DEFAULT 'system'
);

INSERT OR IGNORE INTO competitor_benchmarks (
  id, name, product_name, sample_loan, sample_term_quincenas,
  sample_fortnightly_payment, sample_total_payment, annual_interest_rate,
  commissions, target_audience, requires_bureau, speed, is_cruse, updated_by
) VALUES
  ('cruse', 'Microfinanciera Cruse', 'Crédito de Nómina Institucional', 10000.00, 24, 569.44, 13666.56, '47.50% anual fija (1.97% qnal)', '0% Comisión por apertura', 'Empleados Gubernamentales / Sindicalizados', 0, '< 2 hrs (Core Digital + IA)', 1, 'system'),
  ('independencia', 'Financiera Independencia', 'Crédito Nómina / Personal', 10000.00, 26, 590.00, 15340.00, '122.00% anual', '5% apertura + 5% investigación + 18% cobranza', 'Público en general', 1, '24-48 hrs (alta tasa de rechazo)', 0, 'system'),
  ('banorte', 'Banorte', 'Crédito de Nómina Banorte', 10000.00, 24, 541.05, 12985.20, '39.00% - 45.00% según perfil', 'Varía según cuenta y seguro', 'Exclusivo Cuentahabiente Banorte', 1, 'Mismo día si es cliente nómina', 0, 'system'),
  ('santander', 'Santander', 'Crédito 24x7 Nómina', 10000.00, 24, 599.52, 14388.52, '65.00% anual fija', '12% apertura + 2.25% disposición en cajero + seguro', 'Exclusivo Cuentahabiente Santander', 1, '24-72 hrs', 0, 'system'),
  ('kubo', 'Kubo Financiero (SOFIPO)', 'Kubo.Personal / Nómina', 25000.00, 19, 1683.95, 31995.05, '53.70% promedio anual', 'Comisión por apertura según score', 'Público en general digital', 1, '12-24 hrs digital', 0, 'system'),
  ('creditea', 'IPF Digital / Creditea (Fintech)', 'Línea de Crédito Flexible', 70000.00, 60, 2170.00, 130200.00, '47.80% + IVA (alto costo total CAT)', 'Intereses moratorios y gastos de gestión altos', 'Público en general web', 1, '24 hrs digital', 0, 'system');
