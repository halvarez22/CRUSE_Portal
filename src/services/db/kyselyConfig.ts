import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, DummyDriver } from 'kysely';
import { Database } from '../../types/database';
import { db } from './connectionPool';

/**
 * Instancia de Kysely como Query Builder puro (sin driver de conexión activo),
 * para coexistir pacíficamente con la capa SQL Pura de node:sqlite del Expediente 005.
 * Regla de Auditoría 006 (O-3): Kysely solo para tablas nuevas, ejecutado vía db.query.
 */
export const kyselyBuilder = new Kysely<Database>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db: any) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

/**
 * Función auxiliar para ejecutar una consulta compilada por Kysely en nuestro pool.
 */
export async function executeKyselyQuery<T>(compiledQuery: { sql: string; parameters: readonly unknown[] }) {
  return db.query<T>(compiledQuery.sql, compiledQuery.parameters as any[]);
}

export async function executeKyselyMutation(compiledQuery: { sql: string; parameters: readonly unknown[] }) {
  return db.execute(compiledQuery.sql, compiledQuery.parameters as any[]);
}
