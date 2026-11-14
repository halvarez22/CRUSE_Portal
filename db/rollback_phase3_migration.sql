-- =================================================================================
-- PLAN DE REGRESO (ROLLBACK INSTANTÁNEO) — FASE 3.3 MIGRACIÓN HISTÓRICA A LA NUBE
-- Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
-- Expediente: CRUSE-APO-2026-049 (Pilar Forense 4 + Guardrail D)
-- =================================================================================
-- Propósito:
-- Revertir de forma atómica e inmediata cualquier lote de migración histórica
-- sin alterar ni interrumpir las tablas operativas de Fase 1 y Fase 2
-- (expedientes, loan_accounts, reconciliation_batches, audit_events WORM).
-- =================================================================================

BEGIN;

-- 1. Apagar el Feature Flag de Corte Productivo para regresar a modo Staging Paralelo
UPDATE system_financial_parameters
SET param_numeric_value = 0,
    param_text_value = 'STAGING_PARALLEL',
    updated_at = CURRENT_TIMESTAMP
WHERE param_key = 'CLOUD_MIGRATION_CUTOVER_ACTIVE';

-- 2. Purgar los registros migrados en el esquema paralelo
DELETE FROM cleaned_migrated_portfolio;
DELETE FROM legacy_excel_raw_rows;

-- 3. Marcar todos los lotes activos o en staging como revertidos (ROLLED_BACK)
UPDATE cloud_migration_batches
SET status = 'ROLLED_BACK',
    post_rollback_verified = 1,
    rolled_back_by_email = 'rollback.emergencia@cruse.mx',
    rolled_back_at = CURRENT_TIMESTAMP
WHERE status IN ('STAGED_VERIFIED', 'PROMOTED_CUTOVER');

COMMIT;
