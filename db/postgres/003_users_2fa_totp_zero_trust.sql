-- ============================================================================
-- MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.
-- MIGRACIÓN 003 (POSTGRESQL 16+): GESTIÓN DE USUARIOS ZERO-TRUST & 2FA TOTP AUTÓNOMO
-- Expediente: CRUSE-APO-2026-028 (100% Idempotente)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0;
