import { DatabaseSync } from 'node:sqlite';
import { createDb, type Db } from './client';
import { runMigrations, seedSettings } from './migrate';

/**
 * A fully migrated in-memory database. Every test gets its own, so nothing
 * touches the real %LOCALAPPDATA% file.
 */
export function testDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  runMigrations(sqlite);
  seedSettings(sqlite);
  return { db: createDb(sqlite), sqlite };
}
