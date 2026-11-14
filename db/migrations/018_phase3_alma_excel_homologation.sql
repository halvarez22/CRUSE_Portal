-- =================================================================================
-- MIGRACIÓN 018 (SQLite): HOMOLOGACIÓN FINA CON LA OPERACIÓN REAL DE LOS 14 LIBROS
-- DE EXCEL DE LA LIC. ALMA (Base 365/30.4, Renovaciones LFT, 3 Regímenes IVA,
-- Círculo de Crédito PM v5 + Baja Laboral Activa, Padrón Aseguradora y Póliza COI)
-- Expediente: CRUSE-APO-2026-063 (Guardrail Forense 3)
-- =================================================================================

-- 1. Convención de Conteo de Días Contractual en Fondeo e Inversionistas (Base 365 / 30.4)
ALTER TABLE investors ADD COLUMN day_count_convention VARCHAR(30) NOT NULL DEFAULT 'ACTUAL_365_30_4'
  CHECK (day_count_convention IN ('ACTUAL_365_30_4', 'ACTUAL_365', 'ACTUAL_360', 'THIRTY_360'));

ALTER TABLE investments ADD COLUMN day_count_convention VARCHAR(30) NOT NULL DEFAULT 'ACTUAL_365_30_4'
  CHECK (day_count_convention IN ('ACTUAL_365_30_4', 'ACTUAL_365', 'ACTUAL_360', 'THIRTY_360'));

-- 2. Regímenes de IVA (ADDED, EXEMPT, INCLUDED), Tasa Especial hasta 5%, Estatus Laboral,
--    Oficios Sindicales/Dependencia y Trazabilidad de Renovación en Cuentas de Crédito
ALTER TABLE loan_accounts ADD COLUMN vat_regime VARCHAR(20) NOT NULL DEFAULT 'ADDED'
  CHECK (vat_regime IN ('ADDED', 'EXEMPT', 'INCLUDED'));

ALTER TABLE loan_accounts ADD COLUMN custom_monthly_rate NUMERIC(10,6) DEFAULT NULL;

ALTER TABLE loan_accounts ADD COLUMN employment_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVO'
  CHECK (employment_status IN ('ACTIVO', 'BAJA_LABORAL_ACTIVA', 'SUSPENDIDO', 'JUBILADO'));

ALTER TABLE loan_accounts ADD COLUMN oficio_primer_pago VARCHAR(100) DEFAULT NULL;
ALTER TABLE loan_accounts ADD COLUMN oficio_suspension VARCHAR(100) DEFAULT NULL;

ALTER TABLE loan_accounts ADD COLUMN is_renewal INTEGER NOT NULL DEFAULT 0
  CHECK (is_renewal IN (0, 1));

ALTER TABLE loan_accounts ADD COLUMN prior_loan_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE loan_accounts ADD COLUMN prior_loan_liquidated_amount_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE loan_accounts ADD COLUMN net_disbursed_amount_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE loan_accounts ADD COLUMN borrower_sex VARCHAR(5) NOT NULL DEFAULT 'M';
ALTER TABLE loan_accounts ADD COLUMN borrower_birth_date VARCHAR(20) DEFAULT NULL;

ALTER TABLE loan_accounts ADD COLUMN borrower_person_type VARCHAR(10) NOT NULL DEFAULT 'PF'
  CHECK (borrower_person_type IN ('PF', 'PM'));

ALTER TABLE loan_accounts ADD COLUMN pm_shareholders_json TEXT DEFAULT NULL;

-- 3. Parámetros Financieros y Catálogo de Cuentas Contables Aspel COI (Caso 5)
INSERT OR IGNORE INTO system_financial_parameters (param_key, param_numeric_value, param_text_value, description) VALUES
  ('ESPECIAL_MONTHLY_RATE_MAX', 0.050000, '0.05', 'Tasa mensual máxima autorizada para Crédito Especial (5.0% mensual)'),
  ('INVESTOR_DEFAULT_DAY_COUNT', 365.000000, 'ACTUAL_365_30_4', 'Convención contractual de conteo de días para pagarés de fondeo (365 / 30.4)'),
  ('COI_ACCOUNT_CAPITAL_CARTERA', NULL, '1104001001', 'Cuenta contable Aspel COI para Capital de Cartera de Crédito'),
  ('COI_ACCOUNT_INTERES_ORDINARIO', NULL, '4101001001', 'Cuenta contable Aspel COI para Ingresos por Intereses Ordinarios'),
  ('COI_ACCOUNT_IVA_TRASLADADO', NULL, '2104001001', 'Cuenta contable Aspel COI para IVA Trasladado 16% Cobrado'),
  ('COI_ACCOUNT_SEGURO_VIDA', NULL, '4103000001', 'Cuenta contable Aspel COI para Recuperación de Seguro de Vida ($22.85)');

-- 4. Catálogo Oficial de Observación SIC para Baja Laboral Activa (SUBIR A BURO DESPEDIDOS)
INSERT OR IGNORE INTO credit_bureau_catalogs (id, catalog_group, code, description) VALUES
  ('cbc_obs_bl', 'OBSERVATION_KEY', 'BL', 'Baja laboral activa con saldo insoluto reportable a Círculo de Crédito (Despedidos)');

CREATE INDEX IF NOT EXISTS idx_loan_accounts_employment_status
  ON loan_accounts (employment_status, reports_to_credit_bureau);
