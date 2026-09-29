import { transaction, type SqlDriver } from './driver';
import { MIGRATIONS, type Migration } from './migrations';

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

  const fresh: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    try {
      transaction(db, () => {
        for (const statement of migration.statements) db.exec(statement);
        db.run('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)', [migration.name, new Date().toISOString()]);
      });
    } catch (error) {
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, { cause: error });
    }
    fresh.push(migration.name);
  }
  return fresh;
}

/** True when `applied` (what `runMigrations` just did) built the database from nothing. */
export function isNewDatabase(applied: string[], migrations: readonly Migration[] = MIGRATIONS): boolean {
  return migrations.length > 0 && applied.includes(migrations[0].name);
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
