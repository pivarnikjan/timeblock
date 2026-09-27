import { DateTime } from 'luxon';

export interface Interval {
  start: DateTime;
  end: DateTime;
}

export const minutes = (i: Interval): number => i.end.diff(i.start, 'minutes').minutes;

export const isEmpty = (i: Interval): boolean => i.end <= i.start;

/** Sorts by start and merges anything overlapping or touching. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => !isEmpty(i)).sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Grows every interval by `pad` minutes on both sides, then merges.
 * This is what turns "15 minutes either side of a meeting" from a preference
 * into something the placement step cannot violate: the time simply isn't free.
 */
export function pad(intervals: Interval[], padMinutes: number): Interval[] {
  return merge(
    intervals.map((i) => ({
      start: i.start.minus({ minutes: padMinutes }),
      end: i.end.plus({ minutes: padMinutes }),
    })),
  );
}

/** Everything in `window` not covered by `busy`. */
export function subtract(window: Interval, busy: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = window.start;

  for (const block of merge(busy)) {
    if (block.end <= cursor) continue;
    if (block.start >= window.end) break;

    if (block.start > cursor) {
      free.push({ start: cursor, end: DateTime.min(block.start, window.end) });
    }
    if (block.end > cursor) cursor = block.end;
    if (cursor >= window.end) break;
  }

  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free.filter((i) => !isEmpty(i));
}

/** Clamps an interval to a window, or returns null when they do not overlap. */
export function clamp(interval: Interval, window: Interval): Interval | null {
  const start = DateTime.max(interval.start, window.start);
  const end = DateTime.min(interval.end, window.end);
  return end > start ? { start, end } : null;
}
