import { DatabaseSync } from 'node:sqlite';
import { createDb, type Db } from './client';
import { isNewDatabase, runMigrations, seedSettings } from '@timeblock/core/db/migrate';
import { installSync } from '@timeblock/core/sync/install';
import { nodeDriver } from './driver';

/**
 * A fully migrated in-memory database. Every test gets its own, so nothing
 * touches the real %LOCALAPPDATA% file.
 */
export function testDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const driver = nodeDriver(sqlite);
  runMigrations(driver);
  seedSettings(driver);
  installSync(driver, { newDatabase: isNewDatabase(driver), name: 'Test' });
  return { db: createDb(sqlite), sqlite };
}
