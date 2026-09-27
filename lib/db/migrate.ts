import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

/**
 * Applies any `drizzle-kit generate` output that this database has not seen yet.
 * Drizzle's own migrator targets real drivers, and we run on the sqlite-proxy
 * bridge, so we apply the generated SQL ourselves and keep the ledger here.
 */
export function runMigrations(sqlite: DatabaseSync): string[] {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS __migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set(
    (sqlite.prepare('SELECT name FROM __migrations').all() as { name: string }[]).map((r) => r.name),
  );

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    return []; // No migrations generated yet.
  }

  const fresh: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    sqlite.exec('BEGIN');
    try {
      for (const statement of statements) sqlite.exec(statement);
      sqlite
        .prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)')
        .run(file, new Date().toISOString());
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
    fresh.push(file);
  }
  return fresh;
}

/**
 * The settings row is a singleton pinned to id 1. On a fresh install it is
 * created here, after the migrations — so the default window has to be set at
 * creation too; the migration's own UPDATE only reaches rows that already existed.
 */
export function seedSettings(sqlite: DatabaseSync): void {
  sqlite.exec(
    `INSERT OR IGNORE INTO settings (id, default_window_id)
     VALUES (1, (SELECT id FROM time_windows WHERE name = 'Work' ORDER BY id LIMIT 1))`,
  );
}
