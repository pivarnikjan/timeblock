import { transaction, type SqlDriver } from './driver';
import { MIGRATIONS, type Migration } from './migrations';

/**
 * A ledger entry that is not a migration: this runner built the database from
 * nothing, so what the migrations put there are defaults, not anyone's data.
 * Written with the first migration, so an interrupted first start cannot lose
 * it. Sorts before every migration name.
 */
const CREATED = '.created';

/**
 * Applies any `drizzle-kit generate` output that this database has not seen yet.
 * Drizzle's own migrator targets real drivers, and both apps run on bridges
 * (node:sqlite on the desktop, expo-sqlite on the phone), so the generated SQL
 * is applied here and the ledger kept in `__migrations`. Returns the names applied.
 */
export function runMigrations(db: SqlDriver, migrations: readonly Migration[] = MIGRATIONS): string[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS __migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set(db.all<{ name: string }>('SELECT name FROM __migrations').map((r) => r.name));
  const building = applied.size === 0;

  const fresh: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    try {
      transaction(db, () => {
        for (const statement of migration.statements) db.exec(statement);
        const now = new Date().toISOString();
        db.run('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)', [migration.name, now]);
        if (building && fresh.length === 0) db.run('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)', [CREATED, now]);
      });
    } catch (error) {
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, { cause: error });
    }
    fresh.push(migration.name);
  }
  return fresh;
}

/**
 * Whether this database was built from nothing by this runner — true for good,
 * not only on the start that built it. (Databases created before the runner
 * kept this mark hold real data, and read as not new.)
 */
export function isNewDatabase(db: SqlDriver): boolean {
  return db.all('SELECT 1 FROM __migrations WHERE name = ?', [CREATED]).length > 0;
}

/**
 * The settings row is a singleton pinned to id 1. On a fresh install it is
 * created here, after the migrations — so the default window has to be set at
 * creation too; the migration's own UPDATE only reaches rows that already existed.
 */
export function seedSettings(db: SqlDriver): void {
  db.exec(
    `INSERT OR IGNORE INTO settings (id, default_window_id)
     VALUES (1, (SELECT id FROM time_windows WHERE name = 'Work' ORDER BY id LIMIT 1))`,
  );
}
