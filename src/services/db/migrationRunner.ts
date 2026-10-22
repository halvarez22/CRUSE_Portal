/**
 * RUNNER DE MIGRACIONES CON VALIDACIÓN CRIPTOGRÁFICA DE CHECKSUMS (SHA-256)
 *
 * Implementa el Pilar 2 de CRUSE-APO-2026-003 y la Migración PostgreSQL CRUSE-APO-2026-023:
 * - En modo PostgreSQL (DATABASE_URL activo): ejecuta los scripts idempotentes de `db/postgres/`.
 * - En modo SQLite local: ejecuta los scripts de `db/migrations/`.
 * - Parametrización posicional nativa ($1, $2, $3, $4) conforme al Guardrail Forense 1.
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
  const isPg = db.isPostgres();
  const migrationsDir = isPg
    ? path.join(process.cwd(), 'db', 'postgres')
    : path.join(process.cwd(), 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Directorio de migraciones no encontrado: ${migrationsDir}`);
  }

  await db.executeScript(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum CHAR(64) NOT NULL,
      execution_time_ms INTEGER NOT NULL
    );
  `);

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
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const res = await db.query<{ checksum: string; version: string }>(
      'SELECT version, checksum FROM _schema_migrations WHERE version = $1',
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

    const startTime = Date.now();
    const needsSqliteFkDisabled =
      !isPg && (file.includes('remediation_schema') || file.includes('definitive_business_model'));

    if (needsSqliteFkDisabled) {
      await db.executeScript('PRAGMA foreign_keys = OFF;');
    }

    try {
      await db.transaction(async (tx) => {
        await tx.executeScript(content);

        if (needsSqliteFkDisabled) {
          const fkCheck = await tx.query<{
            table: string;
            rowid: number;
            parent: string;
            fkid: number;
          }>('PRAGMA foreign_key_check;');
          if (fkCheck.rowCount > 0) {
            throw new Error(`Violación de llaves foráneas detectada durante la migración ${file}.`);
          }
        }

        await tx.execute(
          `INSERT INTO _schema_migrations (version, name, checksum, execution_time_ms)
           VALUES ($1, $2, $3, $4);`,
          [version, file, checksum, Date.now() - startTime]
        );
      });
    } finally {
      if (needsSqliteFkDisabled) {
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
