import { transaction, type SqlDriver } from '../db/driver';
import type { DriveApi } from './drive';
import { decodeSyncFile, encodeSyncFile, fileNameFor, stateFingerprint, SyncFormatError } from './file';
import { liveColumns } from './install';
import { exportState, mergeState, readMeta, retentionCutoff, RETENTION_DAYS, type MergeReport } from './state';
import { q, SYNC_TABLES } from './tables';

export interface PeerRow {
  fileId: string;
  device: string;
  name: string;
  md5: string | null;
  clock: number;
  writtenAt: string | null;
  mergedAt: string | null;
}

export function readPeers(db: SqlDriver): PeerRow[] {
  return db
    .all<{
      file_id: string;
      device: string;
      name: string;
      md5: string | null;
      clock: number;
      written_at: string | null;
      merged_at: string | null;
    }>('SELECT file_id, device, name, md5, clock, written_at, merged_at FROM sync_peers ORDER BY written_at DESC')
    .map((r) => ({
      fileId: r.file_id,
      device: r.device,
      name: r.name,
      md5: r.md5,
      clock: Number(r.clock),
      writtenAt: r.written_at,
      mergedAt: r.merged_at,
    }));
}

function savePeer(db: SqlDriver, peer: PeerRow): void {
  db.run(
    `INSERT OR REPLACE INTO sync_peers (file_id, device, name, md5, clock, written_at, merged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [peer.fileId, peer.device, peer.name, peer.md5, peer.clock, peer.writtenAt, peer.mergedAt],
  );
}

/** Names this device for the others ("Desktop", "Phone"). Takes effect with the next upload. */
export function setDeviceName(db: SqlDriver, name: string): void {
  db.run('UPDATE sync_meta SET name = ?, uploaded_hash = NULL WHERE id = 1', [name.trim()]);
}

export function recordSyncError(db: SqlDriver, message: string): void {
  db.run('UPDATE sync_meta SET last_error = ? WHERE id = 1', [message]);
}

/**
 * This device last synced longer ago than deletions are remembered: merging
 * now could bring back rows another device has since deleted. Start over from
 * Drive (`resetFromDrive`), or sync anyway (`allowStale`).
 */
export class StaleDeviceError extends Error {
  constructor(readonly lastSyncAt: string) {
    super(
      `This device last synced on ${lastSyncAt.slice(0, 10)}, more than ${RETENTION_DAYS} days ago. Replace its data with the copy in Google Drive, or sync anyway (things deleted elsewhere since may come back).`,
    );
    this.name = 'StaleDeviceError';
  }
}

export interface SyncReport {
  merged: { device: string; name: string; changes: MergeReport }[];
  /** Other devices' files that had not changed since they were last merged. */
  unchanged: number;
  uploaded: boolean;
  warnings: string[];
}

export interface SyncOptions {
  now?: () => Date;
  /** Merge even though this device has not synced for longer than deletions are remembered. */
  allowStale?: boolean;
}

/**
 * One round of sync: take in every other device's file that changed, then
 * upload this device's state if it changed. Safe to run at any time and as
 * often as wanted; an interrupted round is simply repeated next time.
 */
export async function syncWithDrive(db: SqlDriver, drive: DriveApi, options: SyncOptions = {}): Promise<SyncReport> {
  const now = options.now ?? (() => new Date());
  const meta = readMeta(db);
  const ownName = fileNameFor(meta.device);
  const files = await drive.list();
  const own = files.find((f) => f.name === ownName);
  const others = files.filter((f) => f !== own);

  const cutoff = retentionCutoff(now()).toISOString();
  if (!options.allowStale && meta.lastSyncAt && meta.lastSyncAt < cutoff && others.length > 0) {
    throw new StaleDeviceError(meta.lastSyncAt);
  }

  const report: SyncReport = { merged: [], unchanged: 0, uploaded: false, warnings: [] };
  const known = new Map(readPeers(db).map((p) => [p.fileId, p]));
  const ours = db.all<{ name: string }>('SELECT name FROM __migrations ORDER BY name DESC LIMIT 1')[0]?.name ?? '';

  for (const info of others) {
    const before = known.get(info.id);
    if (before?.md5 && before.md5 === info.md5Checksum) {
      report.unchanged += 1;
      continue;
    }
    let file;
    try {
      file = decodeSyncFile(await drive.download(info.id));
    } catch (error) {
      if (!(error instanceof SyncFormatError)) throw error;
      report.warnings.push(`${info.name}: ${error.message}`);
      continue;
    }
    const label = file.name || `device ${file.device}`;
    if (file.device === meta.device) {
      report.warnings.push(`${info.name} claims to be this device (a copied database?) and was left alone.`);
      continue;
    }
    const peer = { fileId: info.id, device: file.device, name: file.name, md5: info.md5Checksum ?? null, clock: file.clock, writtenAt: file.writtenAt };
    if (file.writtenAt < cutoff) {
      report.warnings.push(`${label} last synced on ${file.writtenAt.slice(0, 10)} — too long ago to merge safely, so it was skipped.`);
      savePeer(db, { ...peer, mergedAt: before?.mergedAt ?? null });
      continue;
    }
    const changes = mergeState(db, file);
    savePeer(db, { ...peer, mergedAt: now().toISOString() });
    report.merged.push({ device: file.device, name: file.name, changes });
    if (file.migration && file.migration > ours) {
      report.warnings.push(`${label} runs a newer TimeBlock; update this device so nothing it adds is left out.`);
    }
  }

  const state = exportState(db, now());
  const fingerprint = stateFingerprint(state);
  if (!own || fingerprint !== meta.uploadedHash) {
    const content = encodeSyncFile(state);
    const properties = { device: meta.device, name: meta.name };
    const saved = own ? await drive.update(own.id, content, properties) : await drive.create(ownName, content, properties);
    db.run('UPDATE sync_meta SET file_id = ?, uploaded_hash = ? WHERE id = 1', [saved.id, fingerprint]);
    report.uploaded = true;
  }
  db.run('UPDATE sync_meta SET last_sync_at = ?, last_error = NULL WHERE id = 1', [now().toISOString()]);
  return report;
}

/**
 * Throws away everything this device holds and takes the other devices'
 * state from Drive instead — for a device that was away too long, or whose
 * data is not wanted. Refuses when Drive holds no other device's file.
 */
export async function resetFromDrive(db: SqlDriver, drive: DriveApi, options: Omit<SyncOptions, 'allowStale'> = {}): Promise<SyncReport> {
  const meta = readMeta(db);
  const others = (await drive.list()).filter((f) => f.name !== fileNameFor(meta.device));
  if (others.length === 0) throw new Error('Google Drive holds no other device’s data to start over from.');

  transaction(db, () => {
    db.run('UPDATE sync_meta SET applying = 1 WHERE id = 1');
    for (const spec of SYNC_TABLES) {
      if (spec.singleton || liveColumns(db, spec.table).length === 0) continue;
      db.run(`DELETE FROM ${q(spec.table)}`);
    }
    // The settings row stays, unstamped: the first file merged overrides every value.
    db.run('DELETE FROM sync_stamps');
    db.run('DELETE FROM sync_tombstones');
    db.run('DELETE FROM sync_peers');
    db.run('UPDATE sync_meta SET applying = 0, uploaded_hash = NULL, last_sync_at = NULL WHERE id = 1');
  });
  return syncWithDrive(db, drive, { ...options, allowStale: true });
}
