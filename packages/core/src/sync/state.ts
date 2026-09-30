import type { SqlDriver, SqlRow, SqlValue } from '../db/driver';
import { transaction } from '../db/driver';
import type { SyncFile, SyncRow, SyncTableData } from './file';
import { liveColumns } from './install';
import { formatStamp, latest, nextStamp, witness } from './stamp';
import { q, SYNC_TABLES, type SyncTable } from './tables';

/**
 * How long a deletion is remembered. A device that has not synced for longer
 * could bring a deleted row back, so such a device is asked to start over
 * from Drive instead (see StaleDeviceError).
 */
export const RETENTION_DAYS = 90;

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export interface SyncMetaRow {
  device: string;
  name: string;
  clock: number;
  fileId: string | null;
  uploadedHash: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export function readMeta(db: SqlDriver): SyncMetaRow {
  const row = db.all<{
    device: string;
    name: string;
    clock: number;
    file_id: string | null;
    uploaded_hash: string | null;
    last_sync_at: string | null;
    last_error: string | null;
  }>('SELECT device, name, clock, file_id, uploaded_hash, last_sync_at, last_error FROM sync_meta WHERE id = 1')[0];
  if (!row) throw new Error('Sync is not installed on this database (installSync was not run).');
  return {
    device: row.device,
    name: row.name,
    clock: Number(row.clock),
    fileId: row.file_id,
    uploadedHash: row.uploaded_hash,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  };
}

/** The key as SQL sees it: numbers for integer ids, text for text keys. */
const keyParam = (spec: SyncTable, id: string): SqlValue => (spec.key === 'id' ? Number(id) : id);

function stampsOf(db: SqlDriver, table: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const r of db.all<{ row_id: string; col: string; stamp: string }>(
    'SELECT row_id, col, stamp FROM sync_stamps WHERE tbl = ?',
    [table],
  )) {
    let row = out.get(r.row_id);
    if (!row) out.set(r.row_id, (row = new Map()));
    row.set(r.col, r.stamp);
  }
  return out;
}

function tombstonesOf(db: SqlDriver, table: string): Map<string, string> {
  return new Map(
    db.all<{ row_id: string; stamp: string }>('SELECT row_id, stamp FROM sync_tombstones WHERE tbl = ?', [table]).map((r) => [
      r.row_id,
      r.stamp,
    ]),
  );
}

/**
 * This device's state as a sync file. Rows nobody ever changed here (a new
 * database's defaults) are left out, as are drafts; deletions older than the
 * retention period are forgotten.
 */
export function exportState(db: SqlDriver, now: Date = new Date()): SyncFile {
  return transaction(db, () => {
    db.run('DELETE FROM sync_tombstones WHERE stamp < ?', [formatStamp(retentionCutoff(now).getTime(), '')]);
    const meta = readMeta(db);
    const tables: Record<string, SyncTableData> = {};
    const tombstones: Record<string, Record<string, string>> = {};

    for (const spec of SYNC_TABLES) {
      const columns = liveColumns(db, spec.table).filter((c) => !spec.local?.includes(c));
      if (columns.length === 0) continue;
      const stamps = stampsOf(db, spec.table);
      const rows: SyncRow[] = [];
      const where = spec.exportWhere ? ` WHERE ${spec.exportWhere}` : '';
      for (const r of db.all<SqlRow>(`SELECT ${columns.map(q).join(', ')} FROM ${q(spec.table)}${where}`)) {
        const own = stamps.get(String(r[spec.key]));
        if (!own) continue;
        const s = own.get('*') ?? '';
        const o: Record<string, string> = {};
        for (const [col, stamp] of own) if (col !== '*' && stamp !== s && columns.includes(col)) o[col] = stamp;
        rows.push(Object.keys(o).length > 0 ? { v: columns.map((c) => r[c]), s, o } : { v: columns.map((c) => r[c]), s });
      }
      tables[spec.table] = { columns, rows };
      const gone = tombstonesOf(db, spec.table);
      if (gone.size > 0) tombstones[spec.table] = Object.fromEntries(gone);
    }

    return {
      app: 'timeblock',
      format: 1,
      device: meta.device,
      name: meta.name,
      migration: db.all<{ name: string }>('SELECT name FROM __migrations ORDER BY name DESC LIMIT 1')[0]?.name ?? null,
      clock: meta.clock,
      writtenAt: now.toISOString(),
      tables,
      tombstones,
    };
  });
}

export interface MergeReport {
  inserted: number;
  updated: number;
  deleted: number;
  /** Rows the other device deleted that are kept here: finished work, or edited here since. */
  kept: number;
}

export const emptyReport = (): MergeReport => ({ inserted: 0, updated: 0, deleted: 0, kept: 0 });

/**
 * Takes in another device's file. Per value, the later stamp wins; a deletion
 * wins over a row not changed since. Finished work is the exception: a ticked
 * segment is never deleted by another device's re-plan it had not seen, and
 * neither is its block. Merging the same file twice changes nothing.
 */
export function mergeState(db: SqlDriver, file: SyncFile): MergeReport {
  return transaction(db, () => {
    const report = emptyReport();
    db.run('UPDATE sync_meta SET applying = 1 WHERE id = 1');
    witness(db, file.clock);
    for (const spec of SYNC_TABLES) {
      const data = file.tables[spec.table];
      if (data) mergeRows(db, spec, data, report);
    }
    // Table order matters here: tasks before segments before blocks, so that
    // whether finished work survives is decided with its task and segments settled.
    for (const spec of SYNC_TABLES) {
      const gone = file.tombstones[spec.table];
      if (gone) mergeTombstones(db, spec, gone, report);
    }
    db.run('UPDATE sync_meta SET applying = 0 WHERE id = 1');
    return report;
  });
}

function mergeRows(db: SqlDriver, spec: SyncTable, data: SyncTableData, report: MergeReport): void {
  const local = new Set(liveColumns(db, spec.table));
  const keyAt = data.columns.indexOf(spec.key);
  if (local.size === 0 || keyAt < 0) return;
  // Columns this device does not have yet (a newer app on the other side) are left out.
  const usable = data.columns
    .map((col, at) => ({ col, at }))
    .filter(({ col }) => col !== spec.key && local.has(col) && !spec.local?.includes(col));

  const stamps = stampsOf(db, spec.table);
  const tombstones = tombstonesOf(db, spec.table);
  const existing = new Set(
    db.all<{ id: string }>(`SELECT CAST(${q(spec.key)} AS TEXT) AS id FROM ${q(spec.table)}`).map((r) => r.id),
  );
  const seen = new Set<string>();

  for (const row of data.rows) {
    const key = row.v[keyAt];
    const id = String(key);
    seen.add(id);
    const theirs = (col: string) => row.o?.[col] ?? row.s;

    const deletedAt = tombstones.get(id);
    if (deletedAt !== undefined) {
      if (deletedAt >= latest([row.s, ...Object.values(row.o ?? {})])) continue;
      // Changed there after it was deleted here: it comes back.
      db.run('DELETE FROM sync_tombstones WHERE tbl = ? AND row_id = ?', [spec.table, id]);
    }

    if (existing.has(id)) {
      const mine = stamps.get(id);
      const ours = (col: string) => mine?.get(col) ?? mine?.get('*') ?? '';
      const newer = usable.filter(({ col }) => theirs(col) > ours(col));
      if (newer.length === 0) continue;
      db.run(
        `UPDATE ${q(spec.table)} SET ${newer.map(({ col }) => `${q(col)} = ?`).join(', ')} WHERE ${q(spec.key)} = ?`,
        [...newer.map(({ at }) => row.v[at]), key],
      );
      for (const { col } of newer) {
        db.run('INSERT OR REPLACE INTO sync_stamps (tbl, row_id, col, stamp) VALUES (?, ?, ?, ?)', [spec.table, id, col, theirs(col)]);
      }
      report.updated += 1;
      continue;
    }

    if (spec.singleton) continue;
    if (spec.unique && !claimUnique(db, spec, data, row, existing)) continue;
    db.run(
      `INSERT INTO ${q(spec.table)} (${[spec.key, ...usable.map((u) => u.col)].map(q).join(', ')})
       VALUES (${['?', ...usable.map(() => '?')].join(', ')})`,
      [key, ...usable.map(({ at }) => row.v[at])],
    );
    db.run('INSERT OR REPLACE INTO sync_stamps (tbl, row_id, col, stamp) VALUES (?, ?, ?, ?)', [spec.table, id, '*', row.s]);
    for (const [col, stamp] of Object.entries(row.o ?? {})) {
      if (local.has(col)) {
        db.run('INSERT OR REPLACE INTO sync_stamps (tbl, row_id, col, stamp) VALUES (?, ?, ?, ?)', [spec.table, id, col, stamp]);
      }
    }
    existing.add(id);
    report.inserted += 1;
  }

  // A new device's defaults (never stamped) that the other device does not
  // have: nobody chose them, and the other device's data replaces them.
  if (spec.singleton || data.rows.length === 0) return;
  for (const id of existing) {
    if (seen.has(id) || stamps.has(id)) continue;
    db.run(`DELETE FROM ${q(spec.table)} WHERE ${q(spec.key)} = ?`, [keyParam(spec, id)]);
    report.deleted += 1;
  }
}

/**
 * Two devices recorded the same unique thing (the same ritual for the same
 * period) under different ids: both keep the one with the smaller id. Returns
 * whether the incoming row should be inserted.
 */
function claimUnique(db: SqlDriver, spec: SyncTable, data: SyncTableData, row: SyncRow, existing: Set<string>): boolean {
  const cols = spec.unique!;
  const clash = db.all<{ k: SqlValue }>(
    `SELECT ${q(spec.key)} AS k FROM ${q(spec.table)} WHERE ${cols.map((c) => `${q(c)} IS ?`).join(' AND ')}`,
    cols.map((c) => row.v[data.columns.indexOf(c)] ?? null),
  )[0];
  if (!clash) return true;
  const theirs = row.v[data.columns.indexOf(spec.key)];
  if (Number(clash.k) <= Number(theirs)) return false;
  // Not a deletion — the same record, under the id both devices will keep.
  db.run(`DELETE FROM ${q(spec.table)} WHERE ${q(spec.key)} = ?`, [clash.k]);
  db.run('DELETE FROM sync_stamps WHERE tbl = ? AND row_id = ?', [spec.table, String(clash.k)]);
  existing.delete(String(clash.k));
  return true;
}

/** Finished work, which a deletion made without knowing about it must not erase. */
const KEEP: Record<string, string> = {
  block_segments: 'done_at IS NOT NULL AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id = block_segments.task_id)',
  blocks: 'EXISTS (SELECT 1 FROM block_segments WHERE block_segments.block_id = blocks.id)',
};

function mergeTombstones(db: SqlDriver, spec: SyncTable, gone: Record<string, string>, report: MergeReport): void {
  if (spec.singleton || liveColumns(db, spec.table).length === 0) return;
  const known = tombstonesOf(db, spec.table);
  const stamps = stampsOf(db, spec.table);

  for (const [id, deletedAt] of Object.entries(gone)) {
    const current = known.get(id);
    if (current !== undefined && current >= deletedAt) continue;

    const key = keyParam(spec, id);
    const exists = db.all(`SELECT 1 FROM ${q(spec.table)} WHERE ${q(spec.key)} = ?`, [key]).length > 0;
    if (exists) {
      // Changed here after it was deleted there: it stays, and brings itself back there.
      if (latest(stamps.get(id)?.values() ?? []) >= deletedAt) continue;
      const keep = KEEP[spec.table];
      if (keep && db.all(`SELECT 1 FROM ${q(spec.table)} WHERE ${q(spec.key)} = ? AND (${keep})`, [key]).length > 0) {
        // Stamped anew, so the other device takes it back rather than deleting it again.
        const stamp = nextStamp(db);
        db.run('DELETE FROM sync_stamps WHERE tbl = ? AND row_id = ?', [spec.table, id]);
        db.run("INSERT INTO sync_stamps (tbl, row_id, col, stamp) VALUES (?, ?, '*', ?)", [spec.table, id, stamp]);
        report.kept += 1;
        continue;
      }
      db.run(`DELETE FROM ${q(spec.table)} WHERE ${q(spec.key)} = ?`, [key]);
      db.run('DELETE FROM sync_stamps WHERE tbl = ? AND row_id = ?', [spec.table, id]);
      report.deleted += 1;
    }
    db.run('INSERT OR REPLACE INTO sync_tombstones (tbl, row_id, stamp) VALUES (?, ?, ?)', [spec.table, id, deletedAt]);
  }
}
