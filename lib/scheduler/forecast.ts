import { DateTime } from 'luxon';
import type { BusySpan, DayShape, WindowSpec } from './day';
import { planDay, type PlannableTask } from './plan';

export interface ForecastTask extends PlannableTask {
  /** First date the task may be scheduled (its week's Monday); null = already schedulable. */
  availableFrom: string | null;
}

export interface Forecast {
  from: string;
  to: string;
  /** Local date each task is expected to finish, for tasks that finish in range. */
  finishes: Map<number, string>;
  /** Minutes still open at the end of the range, for tasks that do not finish. */
  leftover: Map<number, number>;
}

/**
 * Runs the day planner forward, day by day, as if every planned block gets done.
 *
 * Nothing is stored. Meetings are only known for dates present in `busyByDate`
 * (the calendar is read for the current week); later days are treated as free,
 * so a forecast further out is an optimistic bound, not a promise.
 */
export function forecast(
  from: string,
  days: number,
  shape: DayShape,
  windows: WindowSpec[],
  tasks: ForecastTask[],
  busyByDate: Map<string, BusySpan[]> = new Map(),
): Forecast {
  const remaining = new Map(tasks.map((t) => [t.id, t.remainingMin]));
  const finishes = new Map<number, string>();
  const start = DateTime.fromISO(from, { zone: shape.timezone });
  let date = from;

  for (let i = 0; i < days; i++) {
    date = start.plus({ days: i }).toISODate()!;

    const eligible = tasks
      .filter((t) => (remaining.get(t.id) ?? 0) > 0)
      .filter((t) => t.availableFrom === null || t.availableFrom <= date)
      .map((t) => ({ ...t, remainingMin: remaining.get(t.id)! }));
    if (eligible.length === 0) {
      if (tasks.every((t) => (remaining.get(t.id) ?? 0) === 0)) break;
      continue;
    }

    const plan = planDay(date, shape, busyByDate.get(date) ?? [], windows, eligible);
    for (const block of plan.blocks) {
      for (const seg of block.segments) {
        const left = (remaining.get(seg.taskId) ?? 0) - seg.minutes;
        remaining.set(seg.taskId, Math.max(0, left));
        if (left <= 0 && !finishes.has(seg.taskId)) finishes.set(seg.taskId, date);
      }
    }
  }

  const leftover = new Map<number, number>();
  for (const [id, mins] of remaining) if (mins > 0) leftover.set(id, mins);

  return { from, to: date, finishes, leftover };
}
