-- ==============================================================================
-- MIGRACIÓN 002: Triggers WORM Nativos a Nivel de Motor de Base de Datos
-- Impide cualquier UPDATE o DELETE sobre audit_events
-- Cumplimiento: Art. 95 Bis LGOAAC (CNBV PLD/FT) y LFPDPPP
-- ==============================================================================

-- Trigger ineludible: Bloqueo de UPDATE
CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: La bitácora forense de Microfinanciera Cruse es estrictamente inmutable.');
END;

-- Trigger ineludible: Bloqueo de DELETE
CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'VIOLACIÓN FATAL DE INTEGRIDAD WORM: Prohibido eliminar registros de auditoría CNBV.');
END;
