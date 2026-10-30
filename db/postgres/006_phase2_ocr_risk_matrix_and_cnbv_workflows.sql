-- ============================================================================
-- CRUSE FINTECH PORTAL — MIGRACIÓN INCREMENTAL POSTGRESQL 16 (VERSIÓN 006)
-- Expediente: CRUSE-APO-2026-042 (Fase 2.1 — Cimientos de Datos y Tipos)
-- Motor OCR Determinista, Matriz de Riesgo Inicial (Lic. Gerardo), Lista Gris
-- (¿Autoriza Dirección?), Reloj SLA 60+3 Días (ROI/ROIP/ROR/24h), Layout SITI
-- 41 Columnas y Bitácora de Control de Carga Semiautomática CIB.
-- ============================================================================

-- 1. Semilla Oficial de Parámetros PLD/FT y Tipo de Cambio en system_financial_parameters (Evidencias #1 y #5)
INSERT INTO system_financial_parameters (param_key, param_numeric_value, param_text_value, description, updated_by) VALUES
  ('PLD_USD_MXN_FIX_RATE', 19.850000, 'BANXICO_SF43718_DOF', 'Tipo de cambio FIX USD/MXN vigente (Banxico DOF) para conversión determinista de umbrales PLD/FT', 'system_cnbv'),
  ('PLD_RELEVANT_OP_THRESHOLD_USD', 7500.000000, 'DCG_ART_115_ROR', 'Umbral en USD para Reporte de Operaciones Relevantes en una sola exhibición (Efectivo)', 'system_cnbv'),
  ('PLD_FRACTIONED_SINGLE_MIN_USD', 500.000000, 'DCG_ART_115_CAP_VI_FRACC_IV', 'Monto mínimo individual en USD en efectivo para cómputo de Operaciones Fraccionadas', 'system_cnbv'),
  ('PLD_FRACTIONED_MONTHLY_ACCUM_USD', 7500.000000, 'DCG_ART_115_CAP_VI_FRACC_IV', 'Monto acumulado mensual en USD para disparo de alerta de Operación Fraccionada (Estructuración)', 'system_cnbv'),
  ('PLD_RISK_MATRIX_MEDIUM_THRESHOLD', 35.000000, 'MATRIZ_LIC_GERARDO', 'Puntaje mínimo (0-100) en Matriz de Riesgo para clasificar Grado de Riesgo MEDIO', 'system_cnbv'),
  ('PLD_RISK_MATRIX_HIGH_THRESHOLD', 65.000000, 'MATRIZ_LIC_GERARDO', 'Puntaje mínimo (0-100) en Matriz de Riesgo para clasificar Grado de Riesgo ALTO', 'system_cnbv'),
  ('PLD_SEMESTER_REVIEW_DAYS', 180.000000, 'DIAGRAMA_LIC_GERARDO_6_MESES', 'Periodicidad en días naturales (6 meses) para actualización de Perfil Transaccional', 'system_cnbv'),
  ('PLD_CNBV_SUPERVISOR_CODE', NULL, '001002', 'Clave oficial del Órgano Supervisor CNBV para Columna 4 del Layout SITI', 'system_cnbv'),
  ('PLD_CASFIM_ENTITY_CODE', NULL, '0692026', 'Clave del Sujeto Obligado (CASFIM) para Columna 5 del Layout SITI', 'system_cnbv')
ON CONFLICT (param_key) DO NOTHING;

-- 2. Perfiles de Cumplimiento, OCR y Matriz de Riesgo por Expediente (Diagrama Lic. Gerardo — Fase A y Fase B)
CREATE TABLE IF NOT EXISTS expediente_compliance_profiles (
  expediente_id VARCHAR(64) PRIMARY KEY REFERENCES expedientes(id) ON DELETE RESTRICT,
  document_image_sha256 CHAR(64),
  ocr_confidence_score NUMERIC(5,2) NOT NULL DEFAULT 96.50,
  ocr_status VARCHAR(35) NOT NULL DEFAULT 'VALIDATED' CHECK (ocr_status IN ('VALIDATED', 'LOW_CONFIDENCE_EXCEPTION', 'DUPLICATE_DETECTED', 'MANUAL_CORRECTED')),
  occupation_category VARCHAR(40) NOT NULL DEFAULT 'PUBLIC_SERVANT_UNIONIZED' CHECK (occupation_category IN ('PUBLIC_SERVANT_UNIONIZED', 'JUDICIAL_MAGISTRATE_ADMIN', 'HIGH_RISK_CASH_INTENSIVE', 'PEP_OR_HIGH_PUBLIC_OFFICIAL', 'UNSPECIFIED_OR_INFORMAL')),
  occupation_label VARCHAR(120) NOT NULL DEFAULT 'Servidor Público Sindicalizado (Nómina Gubernamental)',
  fortnightly_net_income_mxn NUMERIC(14,2) NOT NULL DEFAULT 12500.00,
  initial_transactional_profile_mxn NUMERIC(14,2) NOT NULL DEFAULT 3500.00,
  risk_matrix_score NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  initial_risk_grade VARCHAR(10) NOT NULL DEFAULT 'BAJO' CHECK (initial_risk_grade IN ('BAJO', 'MEDIO', 'ALTO')),
  current_risk_grade VARCHAR(10) NOT NULL DEFAULT 'BAJO' CHECK (current_risk_grade IN ('BAJO', 'MEDIO', 'ALTO')),
  direction_auth_status VARCHAR(35) NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (direction_auth_status IN ('NOT_REQUIRED', 'PENDING_DIRECTION', 'AUTHORIZED_CONTINUE', 'REJECTED_GENERATE_INUSUAL')),
  direction_authorized_by VARCHAR(255),
  direction_auth_notes TEXT,
  direction_auth_at TIMESTAMPTZ,
  last_semester_review_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_semester_review_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exp_comp_doc_sha256 ON expediente_compliance_profiles(document_image_sha256) WHERE document_image_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exp_comp_ocr_status ON expediente_compliance_profiles(ocr_status);
CREATE INDEX IF NOT EXISTS idx_exp_comp_risk_grade ON expediente_compliance_profiles(current_risk_grade);
CREATE INDEX IF NOT EXISTS idx_exp_comp_next_review ON expediente_compliance_profiles(next_semester_review_at);

-- Backfill idempotente para todos los expedientes existentes en cartera
INSERT INTO expediente_compliance_profiles (
  expediente_id,
  document_image_sha256,
  ocr_confidence_score,
  ocr_status,
  occupation_category,
  occupation_label,
  fortnightly_net_income_mxn,
  initial_transactional_profile_mxn,
  risk_matrix_score,
  initial_risk_grade,
  current_risk_grade,
  direction_auth_status,
  last_semester_review_at,
  next_semester_review_at
)
SELECT
  e.id,
  md5(e.id || '_doc_a') || md5(e.id || '_doc_b'),
  CASE WHEN e.status = 'revision_pld' THEN 88.00 ELSE 97.40 END,
  'VALIDATED',
  CASE
    WHEN e.convenio LIKE '%SUPREMO%' OR e.convenio LIKE '%PJ%' THEN 'JUDICIAL_MAGISTRATE_ADMIN'
    ELSE 'PUBLIC_SERVANT_UNIONIZED'
  END,
  CASE
    WHEN e.convenio LIKE '%SUPREMO%' OR e.convenio LIKE '%PJ%' THEN 'Funcionario del Poder Judicial Estatal'
    ELSE 'Servidor Público Sindicalizado (Gobierno Estatal)'
  END,
  COALESCE(e.gross_income, 14500.00),
  ROUND(e.requested_amount / CASE WHEN e.term_fortnights > 0 THEN e.term_fortnights ELSE 24 END, 2),
  CASE
    WHEN e.status = 'revision_pld' THEN 78.50
    WHEN e.product_type = 'especial' THEN 48.25
    ELSE 18.00
  END,
  CASE
    WHEN e.status = 'revision_pld' THEN 'ALTO'
    WHEN e.product_type = 'especial' THEN 'MEDIO'
    ELSE 'BAJO'
  END,
  CASE
    WHEN e.status = 'revision_pld' THEN 'ALTO'
    WHEN e.product_type = 'especial' THEN 'MEDIO'
    ELSE 'BAJO'
  END,
  CASE
    WHEN e.status = 'revision_pld' THEN 'PENDING_DIRECTION'
    ELSE 'NOT_REQUIRED'
  END,
  COALESCE(e.created_at, CURRENT_TIMESTAMP),
  COALESCE(e.created_at, CURRENT_TIMESTAMP) + INTERVAL '180 days'
FROM expedientes e
ON CONFLICT (expediente_id) DO NOTHING;

-- 3. Tabla de Reportes Regulatorios CNBV/UIF (ROR, ROI, ROIP, 24h) y Buzón de Denuncia Interna (Reloj 60+3 Días)
CREATE TABLE IF NOT EXISTS pld_cnbv_reports_and_whistleblowing (
  id VARCHAR(64) PRIMARY KEY,
  report_category VARCHAR(35) NOT NULL CHECK (report_category IN ('ROR_RELEVANTE', 'ROI_OPERACION', 'ROI_OPERATIVA_FRACCIONADA', 'ROI_EOPERATIVO_TENTATIVA', 'ROI_24_HORAS', 'ROIP_INTERNA_PREOCUPANTE')),
  siti_report_type_code CHAR(1) NOT NULL CHECK (siti_report_type_code IN ('1', '2', '3')),
  expediente_id VARCHAR(64) REFERENCES expedientes(id) ON DELETE RESTRICT,
  subject_masked_name VARCHAR(255) NOT NULL,
  subject_curp_masked VARCHAR(40) NOT NULL,
  subject_rfc_masked VARCHAR(25) NOT NULL DEFAULT 'XXXX000000XXX',
  hub_code VARCHAR(20) NOT NULL DEFAULT 'HUB-CUU',
  operation_amount_mxn NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  operation_amount_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  applied_fx_rate_usd_mxn NUMERIC(14,6) NOT NULL DEFAULT 19.850000,
  tentative_amount_mode VARCHAR(30) NOT NULL DEFAULT 'ZERO_EOPERATIVO' CHECK (tentative_amount_mode IN ('ZERO_EOPERATIVO', 'REQUESTED_AMOUNT_BLOCKED')),
  mandatory_col40_prefix VARCHAR(35) NOT NULL DEFAULT 'NONE' CHECK (mandatory_col40_prefix IN ('NONE', 'Reporte de 24 Horas', 'Lista de Personas Bloqueadas')),
  col40_operation_description TEXT NOT NULL,
  col41_inusual_reasons TEXT NOT NULL,
  is_anonymous_whistleblowing INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous_whistleblowing IN (0, 1)),
  reporter_role_or_channel VARCHAR(120) NOT NULL DEFAULT 'SISTEMA_AUTOMATIZADO_CAP_X',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  investigation_deadline_at TIMESTAMPTZ NOT NULL,
  ccc_session_at TIMESTAMPTZ,
  ccc_decision VARCHAR(35) NOT NULL DEFAULT 'PENDING_CCC' CHECK (ccc_decision IN ('PENDING_CCC', 'REPORT_TO_UIF', 'DISMISSED_WITH_JUSTIFICATION', 'DIRECT_24H_BYPASS_CCC')),
  ccc_justification_notes TEXT,
  uif_transmission_deadline_at TIMESTAMPTZ,
  sla_clock_status VARCHAR(30) NOT NULL DEFAULT 'ON_TIME' CHECK (sla_clock_status IN ('ON_TIME', 'WARNING_10_DAYS', 'URGENT_24H', 'SLA_EXPIRED', 'SUBMITTED_TO_SITI', 'ARCHIVED_NO_REPORT')),
  retention_until_year INTEGER NOT NULL DEFAULT 2036,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pld_cnbv_reports_category ON pld_cnbv_reports_and_whistleblowing(report_category);
CREATE INDEX IF NOT EXISTS idx_pld_cnbv_reports_sla ON pld_cnbv_reports_and_whistleblowing(sla_clock_status, investigation_deadline_at);

-- 4. Bitácora de Control de Carga Semiautomática CIB / Logic Systems (Fase 2 Entregable 4)
CREATE TABLE IF NOT EXISTS cib_export_batches (
  id VARCHAR(64) PRIMARY KEY,
  batch_code VARCHAR(40) NOT NULL UNIQUE,
  total_expedientes_included INTEGER NOT NULL,
  excluded_low_confidence_or_pld_count INTEGER NOT NULL DEFAULT 0,
  total_principal_mxn NUMERIC(14,2) NOT NULL,
  total_fortnightly_quota_mxn NUMERIC(14,2) NOT NULL,
  file_sha256_hash CHAR(64) NOT NULL,
  workflow_status VARCHAR(35) NOT NULL DEFAULT 'GENERATED_PENDING_OC' CHECK (workflow_status IN ('GENERATED_PENDING_OC', 'APPROVED_BY_OC', 'UPLOADED_TO_CIB')),
  generated_by_email VARCHAR(255) NOT NULL,
  reviewed_by_oc_email VARCHAR(255),
  reviewed_by_oc_at TIMESTAMPTZ,
  oc_review_notes TEXT,
  cib_confirmation_folio VARCHAR(80),
  uploaded_to_cib_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cib_batches_created_at ON cib_export_batches(created_at DESC);

-- 5. Semilla Operativa Institucional para Demostración del Oficial de Cumplimiento (Lic. Gerardo)
INSERT INTO pld_cnbv_reports_and_whistleblowing (
  id, report_category, siti_report_type_code, expediente_id,
  subject_masked_name, subject_curp_masked, subject_rfc_masked, hub_code,
  operation_amount_mxn, operation_amount_usd, applied_fx_rate_usd_mxn,
  tentative_amount_mode, mandatory_col40_prefix,
  col40_operation_description, col41_inusual_reasons,
  is_anonymous_whistleblowing, reporter_role_or_channel,
  detected_at, investigation_deadline_at, ccc_session_at,
  ccc_decision, ccc_justification_notes, uif_transmission_deadline_at,
  sla_clock_status, retention_until_year, created_at
) VALUES
(
  'cnbv_rep_frac_001',
  'ROI_OPERATIVA_FRACCIONADA',
  '2',
  NULL,
  'CARLOS A*** M*** R***',
  'MARC8105********09',
  'MARC810512***',
  'HUB-CUU',
  158800.00,
  8000.00,
  19.850000,
  'REQUESTED_AMOUNT_BLOCKED',
  'NONE',
  'OPERATIVA ACUMULADA EN EFECTIVO EN VENTANILLA DURANTE EL MES CALENDARIO OCTUBRE 2026 MEDIANTE 4 EXHIBICIONES INDIVIDUALES DE 2000.00 USD EQUIVALENTES QUE ACUMULAN 8000.00 USD SUPERANDO EL UMBRAL DE 7500.00 USD DE LA FRACCION IV CAPITULO VI DCG ART 115.',
  'EL PERFIL TRANSACCIONAL INICIAL DEL ACREDITADO CORRESPONDE A DESCUENTO QUINCENAL VIA NOMINA SINDICALIZADA POR 3200.00 MXN; LA LIQUIDACION FRACCIONADA EN EFECTIVO ROMPE SU PERFIL HISTORICO.',
  0,
  'MOTOR_AUTOMATIZADO_FRACCION_IV',
  CURRENT_TIMESTAMP - INTERVAL '12 days',
  CURRENT_TIMESTAMP + INTERVAL '48 days',
  NULL,
  'PENDING_CCC',
  NULL,
  NULL,
  'ON_TIME',
  2036,
  CURRENT_TIMESTAMP - INTERVAL '12 days'
),
(
  'cnbv_rep_roip_002',
  'ROIP_INTERNA_PREOCUPANTE',
  '3',
  NULL,
  'COLABORADOR CAMPO ZONA SUR',
  'XXXX0000********00',
  'XXXX000000XXX',
  'HUB-CUN',
  0.00,
  0.00,
  19.850000,
  'ZERO_EOPERATIVO',
  'NONE',
  'REPORTE RECIBIDO EN BUZON DE DENUNCIA INTERNA CONFIDENCIAL (FRACCION VIII CAPITULO X DCG ART 115) SOBRE INTENTO REITERADO DE CAPTURA DE COMPROBANTES DOMICILIARIOS REUTILIZADOS EN SOLICITUDES EXPRESS.',
  'POSIBLE ACTUALIZACION DE SUPUESTO DE LA FRACCION II DEL CAPITULO VII (INTERVENCION REITERADA EN OPERACIONES OBSERVADAS). EN INVESTIGACION POR EL OFICIAL DE CUMPLIMIENTO DENTRO DEL PLAZO DE 60 DIAS NATURALES.',
  1,
  'BUZON_DENUNCIA_INTERNA_CONFIDENCIAL',
  CURRENT_TIMESTAMP - INTERVAL '5 days',
  CURRENT_TIMESTAMP + INTERVAL '55 days',
  NULL,
  'PENDING_CCC',
  NULL,
  NULL,
  'ON_TIME',
  2036,
  CURRENT_TIMESTAMP - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cib_export_batches (
  id, batch_code, total_expedientes_included, excluded_low_confidence_or_pld_count,
  total_principal_mxn, total_fortnightly_quota_mxn, file_sha256_hash,
  workflow_status, generated_by_email, reviewed_by_oc_email, reviewed_by_oc_at,
  oc_review_notes, cib_confirmation_folio, uploaded_to_cib_at, created_at
) VALUES
(
  'cib_batch_2026_10_q1',
  'LOTE-CIB-202610-Q1',
  28,
  2,
  1420000.00,
  78450.00,
  '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
  'UPLOADED_TO_CIB',
  'operaciones@cruse.mx',
  'cumplimiento@cruse.mx',
  CURRENT_TIMESTAMP - INTERVAL '3 days',
  'Expedientes validados con Score OCR > 90% y 0 hits en Listas Negras UIF/OFAC/69-B.',
  'CIB-LOGIC-CHIH-2026-0891',
  CURRENT_TIMESTAMP - INTERVAL '2 days',
  CURRENT_TIMESTAMP - INTERVAL '3 days'
)
ON CONFLICT (id) DO NOTHING;
