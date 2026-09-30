import { DateTime } from 'luxon';
import type { Settings, TimeWindow } from '../db/schema';
import { clamp, isEmpty, merge, minutes, pad, subtract, type Interval } from './intervals';

/**
 * A stretch during which one window does not apply — a vacation closing
 * Learning and Work. `windowId: null` is work with no window (Anytime).
 * UTC ISO instants, like busy spans.
 */
export interface Closure {
  windowId: number | null;
  start: string;
  end: string;
}

/** The subset of settings that defines the shape of a working day. */
export type DayShape = Pick<
  Settings,
  | 'timezone'
  | 'dayStart'
  | 'dayEnd'
  | 'bufferMin'
  | 'maxFocusBlockMin'
  | 'minBlockMin'
  | 'lunchStart'
  | 'lunchMin'
>;

/** A busy span as it arrives from Google: UTC ISO instants. */
export interface BusySpan {
  start: string;
  end: string;
}

/** A named stretch of the day work may land in. `id: null` is the whole day. */
export interface WindowSpec {
  id: number | null;
  name: string;
  /** Local HH:mm. */
  start: string;
  end: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  weekdays: number[];
}

/** A stored time window as the planner reads it. */
export function toSpec(w: Pick<TimeWindow, 'id' | 'name' | 'startTime' | 'endTime' | 'weekdays'>): WindowSpec {
  return {
    id: w.id,
    name: w.name,
    start: w.startTime,
    end: w.endTime,
    weekdays: w.weekdays
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 1 && d <= 7),
  };
}

/**
 * The order windows are listed, drawn and filled in: by start time, then end
 * time, then name — so Training 08:15 comes before Learning 10:30 however the
 * windows were created.
 */
export function compareWindows(
  a: { start: string; end: string; name: string },
  b: { start: string; end: string; name: string },
): number {
  return a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.name.localeCompare(b.name);
}

export function atLocalTime(date: string, hhmm: string, zone: string): DateTime {
  const [hour, minute] = hhmm.split(':').map(Number);
  const dt = DateTime.fromISO(date, { zone }).set({ hour, minute, second: 0, millisecond: 0 });
  if (!dt.isValid) throw new Error(`Invalid local time ${date} ${hhmm} in ${zone}`);
  return dt;
}

/** The whole visible day, e.g. 06:00–18:00 local on `date`. */
export function dayWindow(date: string, shape: DayShape): Interval {
  return {
    start: atLocalTime(date, shape.dayStart, shape.timezone),
    end: atLocalTime(date, shape.dayEnd, shape.timezone),
  };
}

/** The window used by work that has no named window: the whole day, every day. */
export function anytimeWindow(shape: DayShape): WindowSpec {
  return { id: null, name: 'Anytime', start: shape.dayStart, end: shape.dayEnd, weekdays: [1, 2, 3, 4, 5, 6, 7] };
}

export function windowOpensOn(spec: WindowSpec, date: string, zone: string): boolean {
  return spec.weekdays.includes(DateTime.fromISO(date, { zone }).weekday);
}

export function windowInterval(date: string, spec: WindowSpec, zone: string): Interval {
  return { start: atLocalTime(date, spec.start, zone), end: atLocalTime(date, spec.end, zone) };
}

export function toIntervals(spans: BusySpan[], zone: string): Interval[] {
  return spans
    .map((span) => ({
      start: DateTime.fromISO(span.start, { zone }),
      end: DateTime.fromISO(span.end, { zone }),
    }))
    .filter((i) => i.start.isValid && i.end.isValid && !isEmpty(i));
}

/**
 * Free time on `date` inside `within` (the whole day when omitted), in clock order.
 *
 * Busy spans are padded by `bufferMin` on both sides before subtraction, so no
 * returned slot can ever sit inside the protected gap around a meeting. Lunch is
 * subtracted unpadded — it is itself a break. Anything shorter than
 * `minBlockMin` is dropped as unusable.
 */
export function freeSlots(
  date: string,
  shape: DayShape,
  busy: BusySpan[],
  within: Interval = dayWindow(date, shape),
): Interval[] {
  const padded = pad(toIntervals(busy, shape.timezone), shape.bufferMin);

  const lunchStart = atLocalTime(date, shape.lunchStart, shape.timezone);
  const lunch: Interval = { start: lunchStart, end: lunchStart.plus({ minutes: shape.lunchMin }) };

  const blocked = merge([...padded, ...(shape.lunchMin > 0 ? [lunch] : [])])
    .map((i) => clamp(i, within))
    .filter((i): i is Interval => i !== null);

  return subtract(within, blocked).filter((slot) => minutes(slot) >= shape.minBlockMin);
}

/** The closures that apply to one window. */
export function closuresFor(closures: Closure[], windowId: number | null, zone: string): Interval[] {
  return toIntervals(
    closures.filter((c) => c.windowId === windowId),
    zone,
  );
}

/**
 * Free slots with a window's closures taken out. Unlike a meeting, a closure
 * gets no buffer: the window simply is not there, and opens again the minute
 * the vacation ends. Slivers under `minBlockMin` are dropped as usual.
 */
export function openSlots(slots: Interval[], closed: Interval[], shape: DayShape): Interval[] {
  if (closed.length === 0) return slots;
  return slots.flatMap((slot) => subtract(slot, closed)).filter((slot) => minutes(slot) >= shape.minBlockMin);
}
