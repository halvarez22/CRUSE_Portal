-- =================================================================================
-- MIGRACIÓN 017 (SQLite): SPRINT FASE 3.4 — TABLERO WEB DE OPERACIONES UNIFICADO,
-- HUB DE INTEGRACIÓN POR LAYOUTS (TRIBUNAL / PATRONES) Y CONECTORES ZERO-TRUST
-- Expediente: CRUSE-APO-2026-050
-- =================================================================================

CREATE TABLE IF NOT EXISTS integration_connectors (
  id TEXT PRIMARY KEY,
  connector_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  institution_or_system TEXT NOT NULL,
  hub_region TEXT NOT NULL CHECK (hub_region IN ('CHIHUAHUA', 'LEON', 'CANCUN', 'NACIONAL')),
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('HYBRID_LAYOUT_AND_WEBHOOK', 'LAYOUT_FILE_ONLY', 'INTERNAL_MTLS_HMAC_BUS')),
  default_layout_format TEXT NOT NULL CHECK (default_layout_format IN ('FIXED_WIDTH_TXT', 'CSV_PIPE')),
  expected_mtls_thumbprint_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ONLINE_READY' CHECK (status IN ('ONLINE_READY', 'MAINTENANCE', 'DISABLED')),
  last_sync_at TEXT,
  total_exchanges_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO integration_connectors (
  id, connector_code, display_name, institution_or_system, hub_region,
  transport_mode, default_layout_format, expected_mtls_thumbprint_sha256, status
) VALUES
  (
    'conn_stj_chih',
    'CONN-STJ-CHIH',
    'Conector Híbrido Supremo Tribunal de Justicia (Ancho Fijo / Webhook)',
    'Supremo Tribunal de Justicia del Estado de Chihuahua',
    'CHIHUAHUA',
    'HYBRID_LAYOUT_AND_WEBHOOK',
    'FIXED_WIDTH_TXT',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'ONLINE_READY'
  ),
  (
    'conn_stsgech_nom',
    'CONN-STSGECH-NOM',
    'Conector Sindical STSGECH Retenciones Quincenales (CSV Pipe)',
    'Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH)',
    'CHIHUAHUA',
    'LAYOUT_FILE_ONLY',
    'CSV_PIPE',
    '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    'ONLINE_READY'
  ),
  (
    'conn_pj_gto_leon',
    'CONN-PJ-GTO-LEON',
    'Conector Poder Judicial Guanajuato — Hub Bajío (Ancho Fijo)',
    'Poder Judicial del Estado de Guanajuato (Hub León)',
    'LEON',
    'LAYOUT_FILE_ONLY',
    'FIXED_WIDTH_TXT',
    '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    'ONLINE_READY'
  ),
  (
    'conn_erp_core_bus',
    'CONN-ERP-SAP-CORE',
    'Bus Interno Zero-Trust ERP Contable & Dispersión SPEI (mTLS + HMAC-SHA256)',
    'Core Contable y Tesorería Interna Cruse Fintech',
    'NACIONAL',
    'INTERNAL_MTLS_HMAC_BUS',
    'CSV_PIPE',
    '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    'ONLINE_READY'
  )
ON CONFLICT(connector_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS institutional_layout_exchanges (
  id TEXT PRIMARY KEY,
  batch_folio TEXT NOT NULL UNIQUE,
  connector_code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('OUTBOUND_DISCOUNT_LAYOUT', 'INBOUND_PAYROLL_RESPONSE')),
  layout_format TEXT NOT NULL CHECK (layout_format IN ('FIXED_WIDTH_TXT', 'CSV_PIPE')),
  hub_region TEXT NOT NULL CHECK (hub_region IN ('CHIHUAHUA', 'LEON', 'CANCUN', 'NACIONAL')),
  period_code TEXT NOT NULL,
  valid_rows_count INTEGER NOT NULL DEFAULT 0,
  rejected_rows_count INTEGER NOT NULL DEFAULT 0,
  declared_total_mxn TEXT NOT NULL,
  verified_total_mxn TEXT NOT NULL,
  discrepancy_mxn TEXT NOT NULL DEFAULT '0.00',
  payload_sha256 TEXT NOT NULL,
  encrypted_layout_envelope TEXT NOT NULL,
  rejected_rows_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('VERIFIED_SEALED', 'PARTIAL_WITH_REJECTIONS', 'ABORTED_DISCREPANCY')),
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inst_layout_exchanges_hub
  ON institutional_layout_exchanges (hub_region, created_at DESC);
