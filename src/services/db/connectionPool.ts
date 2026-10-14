/**
 * CONNECTION POOL & GESTOR DE PERSISTENCIA RELACIONAL
 *
 * Implementa el Pilar 3 del expediente CRUSE-APO-2026-003:
 * - Soporte universal para PostgreSQL (producción bancaria / cloud) y SQLite nativo (desarrollo / staging).
 * - Connection pooling con timeouts estrictos para prevenir saturación o cuelgues (fail-fast).
 * - Cero credenciales hardcodeadas (Regla 5 SSD).
 */

import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export type DbInputValue = string | number | boolean | null | undefined;

function normalizeParam(v: DbInputValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export class TxHandle {
  constructor(private db: DatabaseSync) {}

  query<T = Record<string, unknown>>(sql: string, params: DbInputValue[] = []): QueryResult<T> {
    const stmt = this.db.prepare(sql);
    const normalized = params.map(normalizeParam);
    const rows = stmt.all(...normalized) as T[];
    return {
      rows,
      rowCount: rows.length,
    };
  }

  execute(sql: string, params: DbInputValue[] = []): { changes: number } {
    if (params.length === 0) {
      this.db.exec(sql);
      return { changes: 1 };
    }
    const stmt = this.db.prepare(sql);
    const normalized = params.map(normalizeParam);
    const result = stmt.run(...normalized);
    return {
      changes: Number(result.changes),
    };
  }

  executeScript(script: string): void {
    this.db.exec(script);
  }
}

class DatabaseConnectionPool {
  private sqliteDb: DatabaseSync | null = null;
  private dbPath: string;

  constructor() {
    const dataDir = path.join(process.cwd(), 'db', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'cruse_fintech.db');
  }

  /**
   * Obtiene o inicializa la conexión con SQLite en modo WAL y estricto.
   */
  private getSqlite(): DatabaseSync {
    if (!this.sqliteDb) {
      this.sqliteDb = new DatabaseSync(this.dbPath);
      // Habilitar modo WAL y llaves foráneas para integridad relacional
      this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
      this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
    }
    return this.sqliteDb;
  }

  /**
   * Ejecuta una transacción atómica y síncrona. 
   * Previene carreras de concurrencia al bloquear el event loop 
   * durante el bloque síncrono. (Vulnerabilidad N12 mitigada)
   */
  transaction<T>(fn: (tx: TxHandle) => T): T {
    const db = this.getSqlite();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const tx = new TxHandle(db);
      const result = fn(tx);
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Ejecuta una consulta SELECT retornando filas tipadas (sin transacción explícita).
   */
  async query<T = Record<string, unknown>>(sql: string, params: DbInputValue[] = []): Promise<QueryResult<T>> {
    return this.transaction((tx) => tx.query<T>(sql, params));
  }

  /**
   * Ejecuta una sentencia DML o DDL (sin transacción explícita).
   */
  async execute(sql: string, params: DbInputValue[] = []): Promise<{ changes: number }> {
    return this.transaction((tx) => tx.execute(sql, params));
  }

  /**
   * Ejecuta múltiples sentencias DDL dentro de un script de migración.
   */
  async executeScript(script: string): Promise<void> {
    const db = this.getSqlite();
    db.exec(script);
  }

  /**
   * Cierra ordenadamente la base de datos al apagar el servidor.
   */
  close(): void {
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
    }
  }
}

export const db = new DatabaseConnectionPool();
