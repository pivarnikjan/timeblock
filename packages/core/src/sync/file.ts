import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { SqlValue } from '../db/driver';

/**
 * One device's state as it shares it: every synced row with the stamps saying
 * when each value last changed, and the tombstones of rows deleted. Each device
 * writes only its own file, so two devices never race to write the same one;
 * merging a file is idempotent, so reading one twice or late does no harm.
 */
export interface SyncFile {
  app: 'timeblock';
  format: 1;
  /** The writer's device id and name. */
  device: string;
  name: string;
  /** The writer's latest migration, to notice an app version behind the other. */
  migration: string | null;
  /** The writer's clock when it wrote the file. */
  clock: number;
  /** UTC ISO instant, by the writer's clock. */
  writtenAt: string;
  tables: Record<string, SyncTableData>;
  /** Per table: row key → the stamp of its deletion. */
  tombstones: Record<string, Record<string, string>>;
}

export interface SyncTableData {
  columns: string[];
  rows: SyncRow[];
}

export interface SyncRow {
  /** Values, in `columns` order. */
  v: SqlValue[];
  /** The row's insert stamp — every column without a stamp of its own dates from it. */
  s: string;
  /** Columns changed since, with their stamps. */
  o?: Record<string, string>;
}

export const FILE_PREFIX = 'timeblock-sync-';

/** The name of a device's file in Drive's app data folder. */
export const fileNameFor = (device: string) => `${FILE_PREFIX}${device}.json.gz`;

export class SyncFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncFormatError';
  }
}

export function encodeSyncFile(file: SyncFile): Uint8Array {
  // mtime 0 keeps the bytes a function of the content alone.
  return gzipSync(strToU8(JSON.stringify(file)), { mtime: 0 });
}

export function decodeSyncFile(bytes: Uint8Array): SyncFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(gunzipSync(bytes)));
  } catch (error) {
    throw new SyncFormatError(`Not a TimeBlock sync file: ${(error as Error).message}`);
  }
  const f = parsed as Partial<SyncFile>;
  if (f?.app !== 'timeblock') throw new SyncFormatError('Not a TimeBlock sync file.');
  if (f.format !== 1) {
    throw new SyncFormatError(`This sync file is format ${String(f.format)}; update TimeBlock on this device to read it.`);
  }
  if (typeof f.device !== 'string' || typeof f.clock !== 'number' || !f.tables || !f.tombstones) {
    throw new SyncFormatError('The sync file is incomplete.');
  }
  return f as SyncFile;
}

/**
 * A fingerprint of what a file says, leaving out when it was written: an
 * unchanged state is not uploaded again.
 */
export function stateFingerprint(file: SyncFile): string {
  return cyrb53(JSON.stringify({ ...file, clock: 0, writtenAt: '' }));
}

/** A fast 53-bit string hash (cyrb53) — for noticing change, not for security. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
