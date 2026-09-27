import type { DateTime } from 'luxon';
import type { Vacation } from '@/lib/db/schema';
import type { Closure } from '@/lib/scheduler/day';

/** The `windows` column's token for work with no window. */
export const ANYTIME = 'anytime';

/** Window ids a vacation closes; `null` stands for Anytime. */
export function closedWindows(v: Pick<Vacation, 'windows'>): (number | null)[] {
  return v.windows
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .flatMap((t) => (t === ANYTIME ? [null] : Number.isInteger(Number(t)) ? [Number(t)] : []));
}

/**
 * A vacation's span as the form's datetime-local values. An end at midnight is
 * shown as 23:59 of the day before — the way it was entered.
 */
export function formInputs(start: DateTime, end: DateTime): { from: string; until: string } {
  const fmt = "yyyy-MM-dd'T'HH:mm";
  const until = end.equals(end.startOf('day')) ? end.minus({ minutes: 1 }) : end;
  return { from: start.toFormat(fmt), until: until.toFormat(fmt) };
}

export function formatWindows(ids: (number | null)[]): string {
  return [...new Set(ids.map((id) => (id === null ? ANYTIME : String(id))))].join(',');
}

/** Every vacation as closures the planner understands: one per closed window. */
export function vacationClosures(vs: Pick<Vacation, 'startsAt' | 'endsAt' | 'windows'>[]): Closure[] {
  return vs.flatMap((v) => closedWindows(v).map((windowId) => ({ windowId, start: v.startsAt, end: v.endsAt })));
}
