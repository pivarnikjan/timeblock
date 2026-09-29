import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { isNewDatabase, runMigrations, seedSettings } from '@timeblock/core/db/migrate';
import { installSync } from '@timeblock/core/sync/install';
import { nodeDriver } from './driver';
import { dbPath } from './paths';
import * as schema from '@timeblock/core/db/schema';

type ProxyMethod = 'all' | 'run' | 'get' | 'values';
type Bindable = null | number | bigint | string | Uint8Array;

/**
 * node:sqlite only binds primitives. Drizzle hands us plain JS values, so
 * anything it cannot bind directly (booleans, undefined, Date) is normalised
 * here rather than surfacing as an opaque bind error at the call site.
 */
function toBindable(value: unknown): Bindable {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string' ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function openDatabase(): DatabaseSync {
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  // Single-user local app: migrating on open is cheaper than remembering to run
  // a CLI step, and it keeps the schema honest after a `git pull`.
  const driver = nodeDriver(db);
  const applied = runMigrations(driver);
  seedSettings(driver);
  // After seeding, so a new database's defaults stay unstamped and lose to real data on the first sync.
  installSync(driver, { newDatabase: isNewDatabase(applied), name: 'Desktop' });
  return db;
}

/**
 * Drizzle has no first-party driver for node:sqlite, so we bridge through its
 * sqlite-proxy driver. The proxy contract is: return `rows` as arrays of column
 * values — a flat array for `get`, an array of arrays for `all`/`values`.
 */
export function createDb(sqlite: DatabaseSync) {
  const db = drizzle(
    async (query, params, method: ProxyMethod) => {
      const bound = params.map(toBindable);
      const stmt: StatementSync = sqlite.prepare(query);

      if (method === 'run') {
        stmt.run(...bound);
        return { rows: [] };
      }

      // setReturnArrays flips the row shape to positional arrays, which the
      // node:sqlite types do not model — hence the cast.
      stmt.setReturnArrays(true);
      const rows = stmt.all(...bound) as unknown as unknown[][];
      // For `get`, "no row" must be undefined: an empty array would be mapped
      // by drizzle into an object of undefined fields, and `.get()` would never
      // report "not found".
      return method === 'get' ? { rows: rows[0] as unknown as unknown[] } : { rows };
    },
    { schema },
  );
  return db;
}

export type Db = ReturnType<typeof createDb>;

// Next dev reloads modules on every edit; without this the process would leak a
// new SQLite handle (and a new WAL reader) per hot reload.
const globalForDb = globalThis as unknown as { __timeblockSqlite?: DatabaseSync; __timeblockDb?: Db };

export function sqlite(): DatabaseSync {
  globalForDb.__timeblockSqlite ??= openDatabase();
  return globalForDb.__timeblockSqlite;
}

export function db(): Db {
  globalForDb.__timeblockDb ??= createDb(sqlite());
  return globalForDb.__timeblockDb;
}
