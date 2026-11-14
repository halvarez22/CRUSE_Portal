-- =================================================================================
-- MIGRACIÓN 014 (SQLite): SPRINT FASE 3.1 — APP CRUSE CLIENTE, SUBIDA CIFRADA
-- ZERO-EXIF, CADENA DE CUSTODIA EN SOBRESCRITURAS Y BLOQUEO TEMPORAL DE 2 HORAS
-- Expediente: CRUSE-APO-2026-047
-- =================================================================================

CREATE TABLE IF NOT EXISTS client_digital_documents (
  id TEXT PRIMARY KEY,
  pre_application_id TEXT NOT NULL,
  folio TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('INE_FRONT', 'INE_BACK', 'PAYSTUB', 'PROOF_OF_ADDRESS')),
  document_sha256 TEXT NOT NULL,
  previous_document_sha256 TEXT,
  is_overwrite INTEGER NOT NULL DEFAULT 0 CHECK (is_overwrite IN (0, 1)),
  exif_stripped INTEGER NOT NULL DEFAULT 1 CHECK (exif_stripped IN (0, 1)),
  encrypted_extracted_summary TEXT NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  ocr_confidence_score TEXT NOT NULL DEFAULT '0.00',
  ocr_status TEXT NOT NULL DEFAULT 'VALIDATED' CHECK (ocr_status IN ('VALIDATED', 'REQUIRES_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXCEPTION', 'DUPLICATE_DETECTED', 'MANUAL_CORRECTED')),
  created_at TEXT NOT NULL,
  UNIQUE (pre_application_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_client_digital_docs_folio
  ON client_digital_documents (folio, doc_type);

CREATE INDEX IF NOT EXISTS idx_client_digital_docs_sha256
  ON client_digital_documents (document_sha256);

CREATE TABLE IF NOT EXISTS client_app_folio_locks (
  folio TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_failed_phone_blind_index TEXT NOT NULL,
  last_failed_at TEXT NOT NULL,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_app_locks_blind_phone
  ON client_app_folio_locks (last_failed_phone_blind_index);
