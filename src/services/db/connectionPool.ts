/**
 * CONNECTION POOL & GESTOR DE PERSISTENCIA RELACIONAL (POSTGRESQL PRIMARIO + SQLITE FALLBACK)
 *
 * Implementa el expediente CRUSE-APO-2026-023:
 * - Motor primario: PostgreSQL (Azure Database for PostgreSQL - Flexible Server) vía pg.Pool con SSL/TLS.
 * - Guardrail Forense 1: Prohibición absoluta de traductores léxicos o regex de placeholders en runtime.
 *   Todas las consultas parametrizadas utilizan sintaxis nativa posicional ($1, $2, $3...).
 * - Cero credenciales hardcodeadas (Regla 5 SSD) y Cero `any` (Regla 6 SQA).
 */

import path from 'path';
import fs from 'fs';
import { Pool, PoolClient } from 'pg';
import { DatabaseSync } from 'node:sqlite';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export type DbInputValue = string | number | boolean | null | undefined;

function normalizeSqliteParam(v: DbInputValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function buildSqliteDollarDictionary(params: DbInputValue[]): Record<string, string | number | null> {
  const dict: Record<string, string | number | null> = {};
  for (let i = 0; i < params.length; i++) {
    dict[`$${i + 1}`] = normalizeSqliteParam(params[i]);
  }
  return dict;
}

export interface TxHandle {
  readonly isPostgres: boolean;
  query<T = Record<string, unknown>>(sql: string, params?: DbInputValue[]): Promise<QueryResult<T>>;
  execute(sql: string, params?: DbInputValue[]): Promise<{ changes: number }>;
  executeScript(script: string): Promise<void>;
}

class PostgresTxHandle implements TxHandle {
  readonly isPostgres = true;

  constructor(private readonly client: PoolClient) {}

  async query<T = Record<string, unknown>>(sql: string, params: DbInputValue[] = []): Promise<QueryResult<T>> {
    const res = await this.client.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
    };
  }

  async execute(sql: string, params: DbInputValue[] = []): Promise<{ changes: number }> {
    const res = await this.client.query(sql, params);
    return {
      changes: res.rowCount ?? 0,
    };
  }

  async executeScript(script: string): Promise<void> {
    await this.client.query(script);
  }
}

class SqliteTxHandle implements TxHandle {
  readonly isPostgres = false;

  constructor(private readonly sqlite: DatabaseSync) {}

  async query<T = Record<string, unknown>>(sql: string, params: DbInputValue[] = []): Promise<QueryResult<T>> {
    const stmt = this.sqlite.prepare(sql);
    const rows = (
      params.length > 0 ? stmt.all(buildSqliteDollarDictionary(params)) : stmt.all()
    ) as T[];
    return {
      rows,
      rowCount: rows.length,
    };
  }

  async execute(sql: string, params: DbInputValue[] = []): Promise<{ changes: number }> {
    if (params.length === 0) {
      this.sqlite.exec(sql);
      return { changes: 1 };
    }
    const stmt = this.sqlite.prepare(sql);
    const result = stmt.run(buildSqliteDollarDictionary(params));
    return {
      changes: Number(result.changes),
    };
  }

  async executeScript(script: string): Promise<void> {
    this.sqlite.exec(script);
  }
}

class DatabaseConnectionPool {
  private pgPool: Pool | null = null;
  private sqliteDb: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor() {
    const defaultDir = path.join(process.cwd(), 'db', 'data');
    const defaultDbPath = path.join(defaultDir, 'cruse_fintech.db');
    const configuredPath = process.env.CRUSE_DB_PATH?.trim();

    if (configuredPath) {
      const targetDir = path.dirname(configuredPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      if (!fs.existsSync(configuredPath) && fs.existsSync(defaultDbPath)) {
        fs.copyFileSync(defaultDbPath, configuredPath);
      }
      this.dbPath = configuredPath;
    } else {
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }
      this.dbPath = defaultDbPath;
    }
  }

  isPostgres(): boolean {
    return Boolean(process.env.DATABASE_URL?.trim());
  }

  private getPgPool(): Pool {
    if (!this.pgPool) {
      const rawConnectionString = process.env.DATABASE_URL?.trim();
      if (!rawConnectionString) {
        throw new Error('DATABASE_URL no está configurada para inicializar pg.Pool.');
      }
      const isLocalPg =
        rawConnectionString.includes('localhost') || rawConnectionString.includes('127.0.0.1');
      // Strip sslmode query parameter so pg.Pool uses our explicit ssl: { rejectUnauthorized: false } object
      const cleanConnectionString = rawConnectionString.replace(/([?&])sslmode=[^&]+(&|$)/i, '$1').replace(/[?&]$/, '');
      this.pgPool = new Pool({
        connectionString: cleanConnectionString,
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        ssl: isLocalPg ? undefined : { rejectUnauthorized: false },
      });
      this.pgPool.on('error', (err) => {
        console.warn(`[PostgreSQL Pool] Conexión inactiva reciclada por el servidor: ${err.message}`);
        // No llamar a process.exit(). pg.Pool maneja la reconexión automática del cliente afectado.
      });
    }
    return this.pgPool;
  }

  private getSqlite(): DatabaseSync {
    if (!this.sqliteDb) {
      this.sqliteDb = new DatabaseSync(this.dbPath);
      this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
      this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
    }
    return this.sqliteDb;
  }

  /**
   * Ejecuta una transacción ACID atómica (PostgreSQL BEGIN/COMMIT/ROLLBACK o SQLite BEGIN IMMEDIATE).
   */
  async transaction<T>(fn: (tx: TxHandle) => Promise<T> | T): Promise<T> {
    if (this.isPostgres()) {
      const pool = this.getPgPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = new PostgresTxHandle(client);
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const tx = new SqliteTxHandle(sqlite);
      const result = await fn(tx);
      sqlite.exec('COMMIT;');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK;');
      throw error;
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: DbInputValue[] = []
  ): Promise<QueryResult<T>> {
    if (this.isPostgres()) {
      const pool = this.getPgPool();
      const res = await pool.query(sql, params);
      return {
        rows: res.rows as T[],
        rowCount: res.rowCount ?? res.rows.length,
      };
    }
    return this.transaction((tx) => tx.query<T>(sql, params));
  }

  async execute(sql: string, params: DbInputValue[] = []): Promise<{ changes: number }> {
    if (this.isPostgres()) {
      const pool = this.getPgPool();
      const res = await pool.query(sql, params);
      return {
        changes: res.rowCount ?? 0,
      };
    }
    return this.transaction((tx) => tx.execute(sql, params));
  }

  async executeScript(script: string): Promise<void> {
    if (this.isPostgres()) {
      const pool = this.getPgPool();
      await pool.query(script);
      return;
    }
    const sqlite = this.getSqlite();
    sqlite.exec(script);
  }

  async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
    }
  }
}

export const db = new DatabaseConnectionPool();
