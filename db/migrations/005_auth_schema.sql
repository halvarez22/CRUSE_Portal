-- ==============================================================================
-- MIGRACIÓN 005: Esquema de Autenticación (CRUSE-APO-2026-005, Bloque A.2 / A.3)
-- - users:        credenciales con hash scrypt y secreto TOTP cifrado (envelope AES-GCM-256)
-- - sessions:     tokens opacos de sesión; solo se persiste SHA-256(token)
-- - pending_totp: desafíos 2FA temporales; solo se persiste SHA-256(tempToken)
-- Ninguna columna almacena secretos en claro (Regla 5 SSD).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS users (
    id               VARCHAR(64)  PRIMARY KEY,
    email            VARCHAR(255) NOT NULL UNIQUE,
    name             VARCHAR(255) NOT NULL,
    role             VARCHAR(30)  NOT NULL CHECK (role IN ('admin', 'oficial_cumplimiento', 'promotor')),
    password_hash    TEXT         NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
    totp_secret_enc  TEXT         NOT NULL,
    totp_enrolled    INTEGER      NOT NULL DEFAULT 0 CHECK (totp_enrolled IN (0, 1)),
    active           INTEGER      NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id          VARCHAR(64) PRIMARY KEY,
    token_hash  CHAR(64)    NOT NULL UNIQUE,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMP   NOT NULL,
    expires_at  TIMESTAMP   NOT NULL,
    revoked_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS pending_totp (
    token_hash  CHAR(64)    PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at  TIMESTAMP   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_totp_user ON pending_totp (user_id);
