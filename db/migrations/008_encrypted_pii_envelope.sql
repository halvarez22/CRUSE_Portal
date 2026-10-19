-- ==============================================================================
-- MIGRACIÓN 008: Sobre Criptográfico de PII en Reposo (CRUSE-APO-2026-015)
-- Agrega encrypted_pii_payload TEXT a expedientes para almacenar el JSON de PII
-- cifrado mediante Envelope Encryption (AES-GCM-256 + DEK envuelta por KEK).
-- ==============================================================================

ALTER TABLE expedientes ADD COLUMN encrypted_pii_payload TEXT;
