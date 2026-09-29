import { transaction, type SqlDriver } from '../db/driver';
import { nextStamp, STAMP_SQL, TICK_SQL } from './stamp';
import { q, SYNC_TABLES, type SyncTable } from './tables';

/** Columns of `table` as the database has them now; empty when the table does not exist. */
export function liveColumns(db: SqlDriver, table: string): string[] {
  return db.all<{ name: string }>(`PRAGMA table_info(${q(table)})`).map((c) => c.name);
}

/** Columns whose changes sync: all but the key and the device's own. */
export function syncedColumns(db: SqlDriver, spec: SyncTable): string[] {
  return liveColumns(db, spec.table).filter((c) => c !== spec.key && !spec.local?.includes(c));
}

/**
 * The three triggers that record every change to a synced table: an insert
 * stamps the row, an update stamps each column that changed, a delete leaves a
 * tombstone. They stay quiet while a merge is writing another device's
 * changes (`applying`), which carry their own stamps.
 */
export function triggerSql(spec: SyncTable, columns: string[]): Map<string, string> {
  const t = spec.table;
  const tbl = `'${t}'`;
  const quiet = 'WHEN (SELECT applying FROM sync_meta WHERE id = 1) = 0';
  const rowOf = (ref: 'NEW' | 'OLD') => `CAST(${ref}.${q(spec.key)} AS TEXT)`;
  const changed = columns
    .map((c) => `SELECT '${c}' AS col WHERE OLD.${q(c)} IS NOT NEW.${q(c)}`)
    .join('\n      UNION ALL ');
  const tombstone = spec.tombstoneWhen ? `${quiet} AND ${spec.tombstoneWhen}` : quiet;

  return new Map([
    [
      `sync_ins_${t}`,
      `CREATE TRIGGER sync_ins_${t} AFTER INSERT ON ${q(t)} ${quiet}
BEGIN
  ${TICK_SQL};
  DELETE FROM sync_tombstones WHERE tbl = ${tbl} AND row_id = ${rowOf('NEW')};
  DELETE FROM sync_stamps WHERE tbl = ${tbl} AND row_id = ${rowOf('NEW')};
  INSERT INTO sync_stamps (tbl, row_id, col, stamp) VALUES (${tbl}, ${rowOf('NEW')}, '*', ${STAMP_SQL});
END`,
    ],
    [
      `sync_upd_${t}`,
      `CREATE TRIGGER sync_upd_${t} AFTER UPDATE ON ${q(t)} ${quiet}
BEGIN
  ${TICK_SQL};
  INSERT OR REPLACE INTO sync_stamps (tbl, row_id, col, stamp)
    SELECT ${tbl}, ${rowOf('NEW')}, col, ${STAMP_SQL} FROM (
      ${changed}
    );
END`,
    ],
    [
      // Deletes that leave no tombstone (drafts) are not stamped either: they never left the device.
      `sync_del_${t}`,
      `CREATE TRIGGER sync_del_${t} AFTER DELETE ON ${q(t)} ${quiet}
BEGIN
  DELETE FROM sync_stamps WHERE tbl = ${tbl} AND row_id = ${rowOf('OLD')};
END`,
    ],
    [
      `sync_tomb_${t}`,
      `CREATE TRIGGER sync_tomb_${t} AFTER DELETE ON ${q(t)} ${tombstone}
BEGIN
  ${TICK_SQL};
  INSERT OR REPLACE INTO sync_tombstones (tbl, row_id, stamp) VALUES (${tbl}, ${rowOf('OLD')}, ${STAMP_SQL});
END`,
    ],
  ]);
}

/**
 * Brings the sync triggers in line with the tables as they are now. Run on
 * every open: a migration that rebuilds a table drops its triggers, and a new
 * column must be stamped too — so they are derived from the live schema
 * rather than written into a migration once.
 */
export function ensureTriggers(db: SqlDriver): void {
  const live = new Map(
    db
      .all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync\\_%' ESCAPE '\\'")
      .map((r) => [r.name, r.sql.trim()]),
  );
  const wanted = new Map<string, string>();
  for (const spec of SYNC_TABLES) {
    const columns = syncedColumns(db, spec);
    if (columns.length === 0) continue;
    for (const [name, sql] of triggerSql(spec, columns)) wanted.set(name, sql);
  }

  for (const name of live.keys()) if (!wanted.has(name)) db.exec(`DROP TRIGGER ${q(name)}`);
  for (const [name, sql] of wanted) {
    if (live.get(name) === sql) continue;
    db.exec(`DROP TRIGGER IF EXISTS ${q(name)}`);
    db.exec(sql);
  }
}

/**
 * Makes a database ready to sync. The first time, it gets its device id; a
 * database that already held data (created before sync existed) has every row
 * stamped as of now, so its data outranks a fresh device's defaults. A new
 * database is left unstamped: what its migrations and seeding put there is a
 * default, which the first merge replaces with the other devices' real data.
 */
export function installSync(db: SqlDriver, options: { newDatabase: boolean; name?: string }): void {
  transaction(db, () => {
    const exists = db.all('SELECT 1 FROM sync_meta WHERE id = 1').length > 0;
    if (!exists) {
      db.run("INSERT INTO sync_meta (id, device, name) VALUES (1, lower(hex(randomblob(6))), ?)", [options.name ?? '']);
      if (!options.newDatabase) {
        const stamp = nextStamp(db);
        for (const spec of SYNC_TABLES) {
          if (liveColumns(db, spec.table).length === 0) continue;
          db.run(
            `INSERT OR IGNORE INTO sync_stamps (tbl, row_id, col, stamp)
             SELECT ?, CAST(${q(spec.key)} AS TEXT), '*', ? FROM ${q(spec.table)}`,
            [spec.table, stamp],
          );
        }
      }
    }
    // A merge interrupted by a crash rolls back with its transaction, but be sure.
    db.run('UPDATE sync_meta SET applying = 0 WHERE id = 1 AND applying <> 0');
    ensureTriggers(db);
  });
}
