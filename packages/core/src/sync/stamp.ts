import type { SqlDriver } from '../db/driver';

/**
 * A stamp says when a value changed: `<clock>@<device>`, the clock zero-padded
 * so stamps compare as plain text — later clock first, device id breaking ties.
 * The clock is a hybrid logical clock: wall-clock milliseconds, but never
 * behind a stamp this device has already seen, so a phone whose clock runs a
 * little slow still orders its edits after the ones it synced.
 */
const DIGITS = 15;

export function formatStamp(clock: number, device: string): string {
  return `${String(Math.max(0, Math.floor(clock))).padStart(DIGITS, '0')}@${device}`;
}

export function stampClock(stamp: string): number {
  const n = Number(stamp.slice(0, DIGITS));
  return Number.isFinite(n) ? n : 0;
}

/** The latest of several stamps; '' (older than any stamp) when there are none. */
export function latest(stamps: Iterable<string>): string {
  let max = '';
  for (const s of stamps) if (s > max) max = s;
  return max;
}

/** Now in milliseconds since the epoch, computed by SQLite itself (for triggers). */
export const NOW_MS_SQL = "CAST(round((julianday('now') - 2440587.5) * 86400000) AS INTEGER)";

/** Moves the clock one tick on: to now, or one past its last value if that is later. */
export const TICK_SQL = `UPDATE sync_meta SET clock = max(clock + 1, ${NOW_MS_SQL}) WHERE id = 1`;

/** The stamp for the clock's current value. */
export const STAMP_SQL = `(SELECT printf('%0${DIGITS}d@%s', clock, device) FROM sync_meta WHERE id = 1)`;

/** Ticks the clock and returns the new stamp — for writes sync makes itself. */
export function nextStamp(db: SqlDriver): string {
  db.run(TICK_SQL);
  return db.all<{ stamp: string }>(`SELECT ${STAMP_SQL} AS stamp`)[0].stamp;
}

/** Keeps the clock past `clock` (another device's), so edits made here afterwards sort after it. */
export function witness(db: SqlDriver, clock: number): void {
  db.run('UPDATE sync_meta SET clock = max(clock, ?) WHERE id = 1', [Math.floor(clock)]);
}
