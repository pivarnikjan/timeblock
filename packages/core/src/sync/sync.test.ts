import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { SqlDriver, SqlRow, SqlValue } from '../db/driver';
import { isNewDatabase, runMigrations, seedSettings } from '../db/migrate';
import { MIGRATIONS } from '../db/migrations';
import type { DriveApi, DriveFileInfo } from './drive';
import { decodeSyncFile, encodeSyncFile, stateFingerprint } from './file';
import { installSync } from './install';
import { resetFromDrive, StaleDeviceError, syncWithDrive } from './run';
import { exportState, mergeState, readMeta } from './state';

function driver(sqlite: DatabaseSync): SqlDriver {
  return {
    all: <T extends SqlRow>(sql: string, params: SqlValue[] = []) => sqlite.prepare(sql).all(...params) as T[],
    run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
    exec: (sql) => sqlite.exec(sql),
  };
}

/** A device as the apps open one: migrate, seed, install sync. */
function device(name: string, before?: (db: SqlDriver) => void): SqlDriver {
  const db = driver(new DatabaseSync(':memory:'));
  if (before) {
    // A database from before sync: data exists when the sync migration arrives
    // (on a later start), and the runner of its day did not mark new databases.
    runMigrations(db, MIGRATIONS.filter((m) => m.name < '0011'));
    db.run("DELETE FROM __migrations WHERE name = '.created'");
    seedSettings(db);
    before(db);
  }
  runMigrations(db);
  seedSettings(db);
  installSync(db, { newDatabase: isNewDatabase(db), name });
  return db;
}

/**
 * A moment later on `db`: its next edit is stamped after every edit made
 * before this call, on any device. (Edits in one test otherwise share a
 * millisecond, and the device ids would decide.)
 */
let moment = Date.now() + 1_000_000;
function later(db: SqlDriver) {
  moment += 1_000;
  db.run('UPDATE sync_meta SET clock = max(clock, ?) WHERE id = 1', [moment]);
}

const one = <T extends SqlRow>(db: SqlDriver, sql: string, params: SqlValue[] = []) => db.all<T>(sql, params)[0];
const count = (db: SqlDriver, sql: string, params: SqlValue[] = []) => Number(one<{ n: number }>(db, `SELECT count(*) AS n FROM (${sql})`, params).n);
const windows = (db: SqlDriver) => db.all('SELECT id, name, start_time FROM time_windows ORDER BY id');

/** Both ways, like two rounds of sync. */
function exchange(a: SqlDriver, b: SqlDriver) {
  mergeState(b, exportState(a));
  mergeState(a, exportState(b));
}

let nextId = 1_000;
function addTask(db: SqlDriver, title: string, fields: Record<string, SqlValue> = {}): number {
  const id = nextId++;
  const cols = ['id', 'title', ...Object.keys(fields)];
  db.run(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [id, title, ...Object.values(fields)]);
  return id;
}

function addBlock(db: SqlDriver, state: string, taskId: number): { block: number; segment: number } {
  const block = nextId++;
  const segment = nextId++;
  db.run("INSERT INTO blocks (id, date, starts_at, ends_at, state) VALUES (?, '2026-10-01', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z', ?)", [block, state]);
  db.run('INSERT INTO block_segments (id, block_id, task_id, minutes) VALUES (?, ?, ?, 60)', [segment, block, taskId]);
  return { block, segment };
}

describe('installing sync', () => {
  it('stamps the data of a database that existed before sync, and nothing of a new one', () => {
    const desktop = device('Desktop', (db) => {
      db.run("INSERT INTO tasks (title) VALUES ('Written before sync')");
    });
    const phone = device('Phone');

    expect(count(desktop, 'SELECT * FROM sync_stamps WHERE tbl = ?', ['tasks'])).toBe(1);
    expect(count(desktop, "SELECT * FROM sync_stamps WHERE tbl = 'time_windows'")).toBe(2);
    expect(count(phone, 'SELECT * FROM sync_stamps')).toBe(0);
    expect(readMeta(phone).device).toMatch(/^[0-9a-f]{12}$/);
    expect(readMeta(phone).device).not.toBe(readMeta(desktop).device);
  });

  it('still knows a new database for new after a first start that failed half-way', () => {
    const db = driver(new DatabaseSync(':memory:'));
    runMigrations(db);
    seedSettings(db);
    // …the app died here, before sync was installed. Next start:
    expect(runMigrations(db)).toEqual([]);
    installSync(db, { newDatabase: isNewDatabase(db), name: 'Phone' });
    expect(count(db, 'SELECT * FROM sync_stamps')).toBe(0);
  });

  it('stamps inserts, changed columns and deletions — but nothing a merge writes', () => {
    const db = device('Desktop');
    const id = addTask(db, 'Read chapter 1');
    expect(one(db, "SELECT col FROM sync_stamps WHERE tbl = 'tasks' AND row_id = ?", [String(id)])).toEqual({ col: '*' });

    db.run('UPDATE tasks SET title = ?, priority = priority WHERE id = ?', ['Read chapter 2', id]);
    expect(db.all("SELECT col FROM sync_stamps WHERE tbl = 'tasks' AND row_id = ? ORDER BY col", [String(id)])).toEqual([
      { col: '*' },
      { col: 'title' },
    ]);

    db.run('DELETE FROM tasks WHERE id = ?', [id]);
    expect(count(db, "SELECT * FROM sync_stamps WHERE tbl = 'tasks'")).toBe(0);
    expect(count(db, "SELECT * FROM sync_tombstones WHERE tbl = 'tasks' AND row_id = ?", [String(id)])).toBe(1);

    db.run('UPDATE sync_meta SET applying = 1');
    addTask(db, 'Written by a merge');
    expect(count(db, "SELECT * FROM sync_stamps WHERE tbl = 'tasks'")).toBe(0);
  });

  it('keeps drafts on the device: never exported, and deleting one leaves no tombstone', () => {
    const db = device('Desktop');
    const task = addTask(db, 'Plan me');
    const draft = addBlock(db, 'draft', task);
    const committed = addBlock(db, 'synced', task);

    const file = exportState(db);
    const ids = (t: string) => file.tables[t].rows.map((r) => r.v[file.tables[t].columns.indexOf('id')]);
    expect(ids('blocks')).toEqual([committed.block]);
    expect(ids('block_segments')).toEqual([committed.segment]);

    db.run('DELETE FROM block_segments WHERE block_id = ?', [draft.block]);
    db.run('DELETE FROM blocks WHERE id = ?', [draft.block]);
    expect(count(db, 'SELECT * FROM sync_tombstones')).toBe(0);

    db.run("UPDATE blocks SET state = 'synced' WHERE id = ?", [committed.block]);
    db.run('DELETE FROM block_segments WHERE block_id = ?', [committed.block]);
    db.run('DELETE FROM blocks WHERE id = ?', [committed.block]);
    expect(count(db, 'SELECT * FROM sync_tombstones')).toBe(2);
  });

  it('keeps the default Calendar view per device', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    desktop.run("UPDATE settings SET calendar_view = 'month', timezone = 'Europe/Bratislava'");
    exchange(desktop, phone);
    expect(one(phone, 'SELECT calendar_view, timezone FROM settings')).toEqual({ calendar_view: 'week', timezone: 'Europe/Bratislava' });
  });
});

describe('merging', () => {
  it('gives a new device the desktop’s data in place of its own defaults', () => {
    const desktop = device('Desktop', (db) => {
      // Before sync existed: Learning moved, Work deleted, a new window made.
      db.run("UPDATE time_windows SET start_time = '09:00' WHERE name = 'Learning'");
      db.run("DELETE FROM time_windows WHERE name = 'Work'");
      db.run("INSERT INTO time_windows (name, start_time, end_time) VALUES ('Family', '18:00', '20:00')");
      db.run("UPDATE settings SET timezone = 'Europe/Bratislava', buffer_min = 10");
    });
    const phone = device('Phone');

    exchange(desktop, phone);

    expect(windows(phone)).toEqual(windows(desktop));
    expect(windows(phone).map((w) => w.name)).toEqual(['Learning', 'Family']);
    expect(one(phone, 'SELECT timezone, buffer_min FROM settings')).toEqual({ timezone: 'Europe/Bratislava', buffer_min: 10 });
    // Nothing flowed back: the desktop still has exactly what it had.
    expect(windows(desktop).map((w) => w.name)).toEqual(['Learning', 'Family']);
  });

  it('keeps edits of different fields from both devices, and the later edit of the same field', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    const id = addTask(desktop, 'Write report', { priority: 3, notes: null });
    exchange(desktop, phone);

    desktop.run('UPDATE tasks SET priority = 1 WHERE id = ?', [id]);
    phone.run("UPDATE tasks SET notes = 'from the train' WHERE id = ?", [id]);
    later(desktop);
    desktop.run("UPDATE tasks SET title = 'Write the report' WHERE id = ?", [id]);
    later(phone);
    phone.run("UPDATE tasks SET title = 'Write the Q3 report' WHERE id = ?", [id]); // later: wins
    exchange(desktop, phone);

    const want = { title: 'Write the Q3 report', priority: 1, notes: 'from the train' };
    expect(one(desktop, 'SELECT title, priority, notes FROM tasks WHERE id = ?', [id])).toEqual(want);
    expect(one(phone, 'SELECT title, priority, notes FROM tasks WHERE id = ?', [id])).toEqual(want);
  });

  it('is idempotent: the same file merged again changes nothing', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    addTask(desktop, 'Once');
    const file = exportState(desktop);

    expect(mergeState(phone, file).inserted).toBe(1);
    expect(mergeState(phone, file)).toEqual({ inserted: 0, updated: 0, deleted: 0, kept: 0 });
    expect(stateFingerprint(exportState(phone))).toBe(stateFingerprint(exportState(phone)));
  });

  it('deletes a row deleted elsewhere, unless it was changed here since', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    const dropped = addTask(desktop, 'Drop me');
    const edited = addTask(desktop, 'Edit me');
    exchange(desktop, phone);

    later(desktop);
    desktop.run('DELETE FROM tasks WHERE id IN (?, ?)', [dropped, edited]);
    later(phone);
    phone.run("UPDATE tasks SET title = 'Still wanted' WHERE id = ?", [edited]); // after the delete
    exchange(desktop, phone);
    exchange(desktop, phone);

    for (const db of [desktop, phone]) {
      expect(db.all('SELECT id, title FROM tasks ORDER BY id')).toEqual([{ id: edited, title: 'Still wanted' }]);
    }
  });

  it('never loses work ticked off on one device to a re-plan on the other', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    const task = addTask(desktop, 'Workout');
    const { block, segment } = addBlock(desktop, 'synced', task);
    exchange(desktop, phone);

    // Ticked off on the phone; meanwhile the desktop, not knowing, retires the block.
    later(phone);
    phone.run("UPDATE block_segments SET done_at = '2026-10-01T09:00:00Z' WHERE id = ?", [segment]);
    later(desktop);
    desktop.run('DELETE FROM block_segments WHERE id = ?', [segment]);
    desktop.run('DELETE FROM blocks WHERE id = ?', [block]);
    // The desktop hears first, from the phone's stale-looking file, then both converge.
    mergeState(desktop, exportState(phone));
    const report = mergeState(phone, exportState(desktop));
    exchange(desktop, phone);

    expect(report.kept).toBe(2);
    for (const db of [desktop, phone]) {
      expect(one(db, 'SELECT done_at FROM block_segments WHERE id = ?', [segment])).toEqual({ done_at: '2026-10-01T09:00:00Z' });
      expect(count(db, 'SELECT * FROM blocks WHERE id = ?', [block])).toBe(1);
    }
  });

  it('lets finished work go when its task is deleted', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    const task = addTask(desktop, 'Abandoned');
    const { block, segment } = addBlock(desktop, 'done', task);
    desktop.run("UPDATE block_segments SET done_at = '2026-10-01T09:00:00Z' WHERE id = ?", [segment]);
    exchange(desktop, phone);

    desktop.run('DELETE FROM block_segments WHERE task_id = ?', [task]);
    desktop.run('DELETE FROM blocks WHERE id = ?', [block]);
    desktop.run('DELETE FROM tasks WHERE id = ?', [task]);
    exchange(desktop, phone);

    for (const db of [desktop, phone]) expect(count(db, 'SELECT * FROM block_segments')).toBe(0);
  });

  it('keeps one ritual record when both devices mark the same period done', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    desktop.run("INSERT INTO ritual_log (id, kind, for_period) VALUES (5000, 'weekly', '2026-W40')");
    phone.run("INSERT INTO ritual_log (id, kind, for_period) VALUES (4000, 'weekly', '2026-W40')");
    exchange(desktop, phone);
    exchange(desktop, phone);

    for (const db of [desktop, phone]) expect(db.all('SELECT id FROM ritual_log')).toEqual([{ id: 4000 }]);
  });

  it('ignores columns this device does not know yet', () => {
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    addTask(desktop, 'From a newer app');
    const file = exportState(desktop);
    const tasks = file.tables.tasks;
    tasks.columns.push('colour_of_the_future');
    for (const row of tasks.rows) row.v.push('teal');

    expect(mergeState(phone, file).inserted).toBe(1);
    expect(one(phone, 'SELECT title FROM tasks')).toEqual({ title: 'From a newer app' });
  });

  it('forgets deletions after the retention period', () => {
    const db = device('Desktop', () => {});
    db.run("INSERT INTO sync_tombstones (tbl, row_id, stamp) VALUES ('tasks', '1', '000001000000000@old')");
    db.run('DELETE FROM tasks WHERE id = ?', [addTask(db, 'Recent')]);
    expect(Object.keys(exportState(db).tombstones.tasks)).toHaveLength(1);
    expect(count(db, 'SELECT * FROM sync_tombstones')).toBe(1);
  });

  it('round-trips through the gzip file format', () => {
    const db = device('Desktop', () => {});
    addTask(db, 'Ünïcode ✓ and "quotes"');
    const file = exportState(db);
    expect(decodeSyncFile(encodeSyncFile(file))).toEqual(file);
  });
});

/** Drive's app data folder, in memory. */
function fakeDrive() {
  const files = new Map<string, DriveFileInfo & { content: Uint8Array }>();
  let n = 0;
  const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');
  const info = (f: DriveFileInfo): DriveFileInfo => ({ id: f.id, name: f.name, md5Checksum: f.md5Checksum, appProperties: f.appProperties });
  const api: DriveApi & { downloads: number; files: typeof files } = {
    downloads: 0,
    files,
    async list() {
      return [...files.values()].map(info);
    },
    async download(id) {
      api.downloads += 1;
      return files.get(id)!.content;
    },
    async create(name, content, appProperties) {
      const id = `f${++n}`;
      files.set(id, { id, name, content, appProperties, md5Checksum: md5(content) });
      return info(files.get(id)!);
    },
    async update(id, content, appProperties) {
      files.set(id, { ...files.get(id)!, content, appProperties, md5Checksum: md5(content) });
      return info(files.get(id)!);
    },
  };
  return api;
}

describe('syncing through Drive', () => {
  it('shares both ways, skipping unchanged files and unchanged uploads', async () => {
    const drive = fakeDrive();
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    const id = addTask(desktop, 'Plan the week');

    expect((await syncWithDrive(desktop, drive)).uploaded).toBe(true);
    const first = await syncWithDrive(phone, drive);
    expect(first.merged).toEqual([{ device: readMeta(desktop).device, name: 'Desktop', changes: expect.objectContaining({ inserted: expect.any(Number) }) }]);
    expect(one(phone, 'SELECT title FROM tasks WHERE id = ?', [id])).toEqual({ title: 'Plan the week' });

    phone.run("UPDATE tasks SET status = 'done' WHERE id = ?", [id]);
    await syncWithDrive(phone, drive);
    await syncWithDrive(desktop, drive);
    expect(one(desktop, 'SELECT status FROM tasks WHERE id = ?', [id])).toEqual({ status: 'done' });

    const downloads = drive.downloads;
    const quiet = await syncWithDrive(desktop, drive);
    expect(quiet).toMatchObject({ merged: [], unchanged: 1, uploaded: false });
    expect(drive.downloads).toBe(downloads);
    expect(drive.files.size).toBe(2);
  });

  it('asks a device away for too long to start over, and can start it over', async () => {
    const drive = fakeDrive();
    const desktop = device('Desktop', () => {});
    const phone = device('Phone');
    addTask(desktop, 'Kept on the desktop');
    await syncWithDrive(desktop, drive);
    await syncWithDrive(phone, drive);
    addTask(phone, 'Old phone-only task');
    phone.run("UPDATE sync_meta SET last_sync_at = '2020-01-01T00:00:00.000Z'");

    await expect(syncWithDrive(phone, drive)).rejects.toBeInstanceOf(StaleDeviceError);
    await resetFromDrive(phone, drive);
    expect(phone.all('SELECT title FROM tasks')).toEqual([{ title: 'Kept on the desktop' }]);
    expect(windows(phone)).toEqual(windows(desktop));
  });
});
