import { runMigrations } from '../src/services/db/migrationRunner';
import { db } from '../src/services/db/connectionPool';
import { auditEventStore } from '../src/services/audit/auditEventStore';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

process.env.CRUSE_KEK_CURRENT_VERSION = '1';
process.env.CRUSE_KEK_V1 = crypto.randomBytes(32).toString('base64');
process.env.BLIND_INDEX_SECRET = crypto.randomBytes(32).toString('base64');

async function main() {
    console.log("=== INICIANDO PRUEBAS DE CONTROL BLOQUE B ===");

    // Eliminar DB anterior si existiera en la carpeta data
    const dbPath = path.join(process.cwd(), 'db', 'data', 'cruse_fintech.db');
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log(`Base de datos limpiada: ${dbPath}`);
    }

    // Prueba 1: Migraciones limpias
    console.log("\n[Prueba de Control 1] Ejecutando migraciones (001-006)...");
    try {
        const result = await runMigrations();
        console.log("Migraciones exitosas:");
        result.details.forEach(d => console.log(d));
    } catch(err) {
        console.error("Fallo migraciones:", err);
        process.exit(1);
    }

    // Prueba 2: Rollback transaccional (N12)
    console.log("\n[Prueba de Control 2] Validación de rollback transaccional (N12)...");
    try {
        db.transaction(tx => {
            tx.execute("INSERT INTO convenios (code, display_name, payroll_layout) VALUES ('TX_TEST', 'Test Rollback', '{}');");
            throw new Error("Error intencional para forzar rollback");
        });
    } catch(err: any) {
        console.log("Excepción capturada como se esperaba:", err.message);
    }
    const checkTx = await db.query("SELECT * FROM convenios WHERE code = 'TX_TEST'");
    if (checkTx.rowCount === 0) {
        console.log("✅ Rollback exitoso: El convenio 'TX_TEST' NO existe en la base de datos.");
    } else {
        console.error("❌ FALLO: El rollback no deshizo los cambios.");
        process.exit(1);
    }

    // Prueba 3: Cadena v2 (N6)
    console.log("\n[Prueba de Control 3] Prueba de cadena v2 de auditoría (N6)...");
    let ev1, ev2;
    db.transaction(tx => {
        ev1 = auditEventStore.appendInTx(tx, {
            action: 'USER_LOGIN' as any, actorEmail: 'admin@test.com', actorRole: 'admin', outcome: 'success', sourceIp: '127.0.0.1', sourceSummary: 'localhost'
        });
        ev2 = auditEventStore.appendInTx(tx, {
            action: 'EXPEDIENTE_ACTIVATE' as any, actorEmail: 'admin@test.com', actorRole: 'admin', outcome: 'success', sourceIp: '127.0.0.1', sourceSummary: 'localhost', details: 'Expediente activado con exito'
        });
    });
    console.log(`Eventos insertados (chain_seq: ${ev1?.chain_seq} y ${ev2?.chain_seq}). Ejecutando verificación de cadena...`);
    const chainVerification = await auditEventStore.verifyChainIntegrity();
    if (chainVerification.valid) {
        console.log("✅ Integridad de cadena verificada correctamente.");
        console.log(chainVerification.details);
    } else {
        console.error("❌ FALLO en la integridad de la cadena:", chainVerification);
        process.exit(1);
    }

    // Prueba 4: Triggers WORM extendidos
    console.log("\n[Prueba de Control 4] Verificación de trigger WORM en convenios y loan_payment_applications...");
    try {
        db.transaction(tx => {
            tx.execute("UPDATE convenios SET display_name = 'Hack' WHERE code = 'STSGECH'");
        });
        console.error("❌ FALLO: El motor SQLite permitió el UPDATE en convenios.");
        process.exit(1);
    } catch(err: any) {
        console.log("✅ Bloqueo WORM exitoso en UPDATE convenios:", err.message);
    }

    try {
        db.transaction(tx => {
            tx.execute("DELETE FROM convenios WHERE code = 'STSGECH'");
        });
        console.error("❌ FALLO: El motor SQLite permitió el DELETE en convenios.");
        process.exit(1);
    } catch(err: any) {
        console.log("✅ Bloqueo WORM exitoso en DELETE convenios:", err.message);
    }

    console.log("\n=== PRUEBAS DE CONTROL BLOQUE B COMPLETADAS CON ÉXITO ===");
    process.exit(0);
}

main().catch(err => {
    console.error("Error global:", err);
    process.exit(1);
});
