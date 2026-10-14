/**
 * RUNNER DE MIGRACIONES CON VALIDACIÓN CRIPTOGRÁFICA DE CHECKSUMS (SHA-256)
 *
 * Implementa el Pilar 2 del expediente CRUSE-APO-2026-003:
 * - Detección automática de alteraciones en scripts de migración ya aplicados.
 * - Ejecución atómica y secuencial versionada.
 * - Registro en la tabla de control _schema_migrations.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from './connectionPool';

export interface MigrationStatus {
  appliedCount: number;
  skippedCount: number;
  details: string[];
}

export async function runMigrations(): Promise<MigrationStatus> {
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Directorio de migraciones no encontrado: ${migrationsDir}`);
  }

  // 1. Asegurar tabla de control de migraciones
  await db.executeScript(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum CHAR(64) NOT NULL,
      execution_time_ms INTEGER NOT NULL
    );
  `);

  // 2. Leer archivos .sql ordenados alfabéticamente
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  let skippedCount = 0;
  const details: string[] = [];

  for (const file of files) {
    const version = file.split('_')[0]!;
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Calcular checksum SHA-256 del contenido exacto del archivo
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    // Verificar si ya fue aplicada
    const res = await db.query<{ checksum: string; version: string }>(
      'SELECT version, checksum FROM _schema_migrations WHERE version = ?',
      [version]
    );

    if (res.rowCount > 0) {
      const existing = res.rows[0]!;
      if (existing.checksum !== checksum) {
        throw new Error(
          `ALERTA DE SEGURIDAD FORENSE: El script de migración '${file}' fue alterado después de ser aplicado. Checksum registrado: ${existing.checksum}, actual: ${checksum}`
        );
      }
      skippedCount++;
      details.push(`[Omitido] ${file} (Ya aplicado con checksum verificado)`);
      continue;
    }

    // Ejecutar migración y medir tiempo en transacción atómica
    const startTime = Date.now();
    
    // Si la migración es la 006 (u otra que requiera DROP/ALTER de tablas con FK),
    // desactivar llaves foráneas temporalmente ANTES de la transacción (requerimiento de SQLite).
    const needsFkDisabled = file.includes('remediation_schema');
    
    if (needsFkDisabled) {
      await db.executeScript('PRAGMA foreign_keys = OFF;');
    }
    
    try {
      db.transaction((tx) => {
        tx.executeScript(content);
        
        // Verificar que no se hayan roto foreign keys si fueron deshabilitadas
        if (needsFkDisabled) {
          const fkCheck = tx.query<{ table: string; rowid: number; parent: string; fkid: number }>('PRAGMA foreign_key_check;');
          if (fkCheck.rowCount > 0) {
            throw new Error(`Violación de llaves foráneas detectada durante la migración ${file}.`);
          }
        }
        
        tx.execute(
          `INSERT INTO _schema_migrations (version, name, checksum, execution_time_ms)
           VALUES (?, ?, ?, ?);`,
          [version, file, checksum, Date.now() - startTime]
        );
      });
    } finally {
      if (needsFkDisabled) {
        await db.executeScript('PRAGMA foreign_keys = ON;');
      }
    }
    
    const executionTimeMs = Date.now() - startTime;
    appliedCount++;
    details.push(`[Aplicado] ${file} (${executionTimeMs} ms)`);
  }

  return {
    appliedCount,
    skippedCount,
    details,
  };
}
