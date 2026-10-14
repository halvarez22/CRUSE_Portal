-- ==============================================================================
-- MIGRACIÓN 003: Inserción del Bloque Génesis Institucional Sellado
-- Hash Chaining Génesis: 0000000000000000000000000000000000000000000000000000000000000000
-- ==============================================================================

INSERT OR IGNORE INTO audit_events (
    id,
    ts,
    actor_email,
    actor_role,
    action,
    outcome,
    source_ip,
    source_summary,
    details,
    prev_hash,
    record_hash
) VALUES (
    'cruse_audit_genesis_000',
    '2026-01-01 00:00:00',
    'sistema@cruse.com.mx',
    'sistema',
    'SCREEN_VIEW',
    'success',
    '127.0.0.1',
    'Sistema Central · Génesis SOFOM Cruse',
    'Bloque génesis inmutable inicializado para retención regulatoria de 5 años',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
);
