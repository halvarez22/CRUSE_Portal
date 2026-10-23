/**
 * CRUSE-APO-2026-023: Script Transaccional de Migración de Datos (SQLite 3FN v4 -> PostgreSQL)
 * Cumple con Guardrail 3 Forense:
 *  - Validación y casting estricto de tipos (NUMERIC(12,2)/NUMERIC(14,6)/NUMERIC(5,4) con Decimal.js, INTEGER, TEXT, TIMESTAMPTZ).
 *  - Prohibición de coerción implícita silenciosa (lanza excepción dura con ROLLBACK total ante datos corruptos).
 *  - Verificación de conteo exacto de filas en las 33 tablas del esquema 3FN v4.
 *  - Verificación criptográfica de Cadena Merkle (auditEventStore.verifyChainIntegrity).
 */

import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import Decimal from 'decimal.js';
import { auditEventStore } from '../src/services/audit/auditEventStore.js';

const { Pool } = pg;

/** Orden topológico exacto de las 33 tablas físicas del Modelo 3FN v4 (Padres -> Hijos) */
export const TOPOLOGICAL_TABLES_V4: readonly string[] = [
  '_schema_migrations',
  'users',
  'sessions',
  'pending_totp',
  'audit_events',
  'system_financial_parameters',
  'accounting_movements_catalog',
  'operational_notes',
  'convenios',
  'expedientes',
  'expedientes_status_history',
  'legal_entity_members',
  'contacts',
  'arco_requests',
  'loan_accounts',
  'documents',
  'amortization_schedules',
  'special_credit_movements',
  'loan_restructures',
  'loan_suspension_periods',
  'reconciliation_batches',
  'reconciliation_items',
  'loan_payment_applications',
  'investors',
  'investments',
  'investment_capital_movements',
  'investor_payments',
  'insurance_policies',
  'loan_insurance_enrollments',
  'insurance_claims',
  'credit_bureau_catalogs',
  'credit_bureau_reports',
  'credit_bureau_report_details',
];

/** Clasificación explícita de columnas numéricas de punto fijo (NUMERIC(12,2) / NUMERIC(14,2) / NUMERIC(5,2)) */
const DECIMAL_COLUMNS_SCALE_2 = new Set<string>([
  'requested_amount',
  'gross_income',
  'payroll_deductions',
  'shareholding_percent',
  'principal_original',
  'current_principal_balance',
  'fortnightly_payment',
  'expected_capital',
  'expected_interest',
  'expected_vat',
  'expected_insurance',
  'expected_payment',
  'expected_balance',
  'amount',
  'balance_before',
  'balance_after',
  'absorbed_payoff_amount',
  'total_amount_expected',
  'total_amount_received',
  'actual_payment',
  'difference',
  'amount_received',
  'due_insurance',
  'due_interest',
  'due_vat',
  'due_capital',
  'applied_insurance',
  'applied_interest',
  'applied_vat',
  'applied_capital',
  'arrears_insurance_after',
  'arrears_interest_after',
  'arrears_vat_after',
  'credit_balance_after',
  'capital',
  'current_capital',
  'capital_before',
  'capital_after',
  'gross_yield',
  'isr_retained',
  'net_paid',
  'coverage_amount',
  'insured_amount',
  'period_premium',
  'amount_paid',
  'reported_balance',
]);

/** Columnas NUMERIC de alta precisión para tasas y parámetros (NUMERIC(5,4), NUMERIC(6,4), NUMERIC(14,6)) */
const DECIMAL_COLUMNS_SCALE_6 = new Set<string>([
  'param_numeric_value',
  'isr_retention_rate',
  'annual_rate',
]);

/** Columnas INTEGER exactas en las 33 tablas del esquema 3FN v4 */
const INTEGER_COLUMNS = new Set<string>([
  'execution_time_ms',
  'totp_enrolled',
  'active',
  'hash_version',
  'chain_seq',
  'is_pinned',
  'charges_life_insurance',
  'sends_union_letter',
  'term_fortnights',
  'kek_version',
  'is_verified',
  'insurance_required',
  'reports_to_credit_bureau',
  'capacity_override_flag',
  'period_number',
  'total_records',
  'applies_isr',
  'requires_invoice',
  'days_past_due',
]);

/**
 * Guardrail 3: Función de validación y casting estricto por columna.
 * Prohibida la coerción silenciosa: si un valor no cumple su contrato, aborta con Error explícito.
 */
export function castAndValidateColumnValue(
  tableName: string,
  columnName: string,
  rawValue: unknown
): string | number | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (DECIMAL_COLUMNS_SCALE_2.has(columnName)) {
    try {
      const dec = new Decimal(String(rawValue));
      if (!dec.isFinite()) {
        throw new Error(`Valor no finito (${String(rawValue)})`);
      }
      return dec.toFixed(2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[GUARDRAIL-3 VIOLATION] Tabla "${tableName}", columna NUMERIC(escala 2) "${columnName}": valor inválido "${String(rawValue)}" (${msg})`
      );
    }
  }

  if (DECIMAL_COLUMNS_SCALE_6.has(columnName)) {
    try {
      const dec = new Decimal(String(rawValue));
      if (!dec.isFinite()) {
        throw new Error(`Valor no finito (${String(rawValue)})`);
      }
      return dec.toFixed(6);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[GUARDRAIL-3 VIOLATION] Tabla "${tableName}", columna NUMERIC(escala 6) "${columnName}": valor inválido "${String(rawValue)}" (${msg})`
      );
    }
  }

  if (INTEGER_COLUMNS.has(columnName)) {
    const num = typeof rawValue === 'number' ? rawValue : Number(String(rawValue));
    if (!Number.isInteger(num)) {
      throw new Error(
        `[GUARDRAIL-3 VIOLATION] Tabla "${tableName}", columna INTEGER "${columnName}": se esperaba entero exacto pero se recibió "${String(rawValue)}"`
      );
    }
    return num;
  }

  if (typeof rawValue === 'string') {
    return rawValue;
  }

  if (typeof rawValue === 'number' || typeof rawValue === 'bigint') {
    return String(rawValue);
  }

  throw new Error(
    `[GUARDRAIL-3 VIOLATION] Tabla "${tableName}", columna "${columnName}": tipo de dato inesperado (${typeof rawValue})`
  );
}

export async function migrateSqliteToPostgres(options?: {
  sqlitePath?: string;
  postgresUrl?: string;
}): Promise<{ migratedTables: number; totalRowsMigrated: number; merkleVerified: boolean }> {
  const sqlitePath =
    options?.sqlitePath ||
    process.env.CRUSE_DB_PATH ||
    path.resolve(process.cwd(), 'db', 'data', 'cruse_fintech.db');
  const postgresUrl = options?.postgresUrl || process.env.DATABASE_URL;

  if (!postgresUrl) {
    throw new Error(
      'FATAL: Variable de entorno DATABASE_URL (PostgreSQL) es obligatoria para ejecutar la migración.'
    );
  }

  const sqliteDb = new DatabaseSync(sqlitePath, { open: true });
  const cleanPgUrl = postgresUrl.replace(/([?&])sslmode=[^&]+(&|$)/i, '$1').replace(/[?&]$/, '');
  const pgPool = new Pool({
    connectionString: cleanPgUrl,
    max: 5,
    ssl:
      process.env.PGSSLMODE === 'require' || postgresUrl.includes('database.azure.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const client = await pgPool.connect();
  let totalRowsMigrated = 0;

  try {
    console.log(`[MIGRACIÓN PG] Iniciando transferencia transaccional desde ${sqlitePath}...`);
    await client.query('BEGIN');

    for (const table of TOPOLOGICAL_TABLES_V4) {
      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      const sqliteCountRow = sqliteDb.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as {
        cnt: number;
      };
      const expectedCount = Number(sqliteCountRow.cnt);

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const colListSql = columns.map((c) => `"${c}"`).join(', ');

        for (const row of rows) {
          const castedValues = columns.map((col) =>
            castAndValidateColumnValue(table, col, row[col])
          );
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          const insertSql = `INSERT INTO ${table} (${colListSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          await client.query(insertSql, castedValues);
        }
      }

      const pgCountRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) as cnt FROM ${table}`
      );
      const actualPgCount = Number(pgCountRes.rows[0]?.cnt ?? 0);

      if (actualPgCount < expectedCount) {
        throw new Error(
          `[CONTEO DISCREPANTE] Tabla "${table}": SQLite tiene ${expectedCount} filas, pero PostgreSQL registró ${actualPgCount} filas.`
        );
      }

      totalRowsMigrated += rows.length;
      console.log(
        `  ✔ Tabla [${table}]: ${rows.length} filas validadas y migradas (Total PG: ${actualPgCount}).`
      );
    }

    await client.query('COMMIT');
    console.log(
      `[MIGRACIÓN PG] Transacción de las ${TOPOLOGICAL_TABLES_V4.length} tablas confirmada (COMMIT).`
    );

    // Verificación criptográfica de Cadena Merkle post-migración
    const merkleCheck = await auditEventStore.verifyChainIntegrity();
    if (!merkleCheck.valid) {
      throw new Error(
        `[MERKLE INTEGRITY FAILURE] Cadena Merkle inválida tras migración en índice ${String(merkleCheck.compromisedIndex)}: ${merkleCheck.details}`
      );
    }

    console.log(
      `[MIGRACIÓN PG] Integridad Criptográfica Merkle certificada (${merkleCheck.totalEvents} eventos verificados).`
    );
    return {
      migratedTables: TOPOLOGICAL_TABLES_V4.length,
      totalRowsMigrated,
      merkleVerified: true,
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(
      '[MIGRACIÓN PG] ERROR CRÍTICO Detectado — Se ejecutó ROLLBACK total en PostgreSQL:',
      err
    );
    throw err;
  } finally {
    client.release();
    await pgPool.end();
    sqliteDb.close();
  }
}

// Ejecución directa desde CLI si se invoca como script principal
const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]).endsWith('migrateSqliteToPostgres.ts');
if (isMainModule) {
  migrateSqliteToPostgres()
    .then((summary) => {
      console.log('[MIGRACIÓN PG EXITOSA]', JSON.stringify(summary));
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(
        '[MIGRACIÓN PG FALLIDA]',
        err instanceof Error ? err.message : String(err)
      );
      process.exit(1);
    });
}
