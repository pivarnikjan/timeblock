import type { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlRow } from '@timeblock/core/db/driver';

/** The desktop's SQLite connection in the shape core's migrations and sync expect. */
export function nodeDriver(sqlite: DatabaseSync): SqlDriver {
  return {
    all: <T extends SqlRow>(sql: string, params: SqlRow[string][] = []) => sqlite.prepare(sql).all(...params) as T[],
    run: (sql, params = []) => {
      sqlite.prepare(sql).run(...params);
    },
    exec: (sql) => sqlite.exec(sql),
  };
}
