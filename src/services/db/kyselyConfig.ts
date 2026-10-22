import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  DummyDriver,
} from 'kysely';
import { Database } from '../../types/database';
import { db, DbInputValue } from './connectionPool';

/**
 * Instancia de Kysely configurada con el compilador y adaptador nativo de PostgreSQL ($1, $2, ...),
 * cumpliendo el Guardrail Forense 1 de CRUSE-APO-2026-023 (Cero reemplazo léxico de placeholders)
 * y Regla 6 SQA (Cero any).
 */
export const kyselyBuilder = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (dbInstance: Kysely<unknown>) => new PostgresIntrospector(dbInstance),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function toSafeDbParams(parameters: readonly unknown[]): DbInputValue[] {
  return parameters.map((p): DbInputValue => {
    if (
      p === null ||
      p === undefined ||
      typeof p === 'string' ||
      typeof p === 'number' ||
      typeof p === 'boolean'
    ) {
      return p;
    }
    if (p instanceof Date) {
      return p.toISOString();
    }
    return String(p);
  });
}

export async function executeKyselyQuery<T>(compiledQuery: {
  sql: string;
  parameters: readonly unknown[];
}) {
  return db.query<T>(compiledQuery.sql, toSafeDbParams(compiledQuery.parameters));
}

export async function executeKyselyMutation(compiledQuery: {
  sql: string;
  parameters: readonly unknown[];
}) {
  return db.execute(compiledQuery.sql, toSafeDbParams(compiledQuery.parameters));
}
