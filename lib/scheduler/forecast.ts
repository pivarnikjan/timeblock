import { DateTime } from 'luxon';
import type { BusySpan, DayShape, WindowSpec } from './day';
import { planDay, type PlannableTask, type PlannedBlock } from './plan';

export interface ForecastTask extends PlannableTask {
  /** First date the task may be scheduled (its week's Monday); null = already schedulable. */
  availableFrom: string | null;
}

export interface RangeDay {
  date: string;
  blocks: PlannedBlock[];
}

export interface RangePlan {
  from: string;
  /** Last date looked at: the day everything was placed, or the end of the range. */
  to: string;
  /** Days that received at least one block, in date order. */
  days: RangeDay[];
  /** Local date each task is expected to finish, for tasks that finish in range. */
  finishes: Map<number, string>;
  /** Minutes still open at the end of the range, for tasks that do not finish. */
  leftover: Map<number, number>;
}

/**
 * Runs the day planner forward, day by day, as if every planned block gets done,
 * until everything is placed or `days` run out.
 *
 * Each day starts from what the days before left over, so a course continues
 * exactly where the previous day stopped and its order holds across days as
 * well as within one. Meetings are only known for dates present in
 * `busyByDate`; other days are treated as free.
 */
export function planRange(
  from: string,
  days: number,
  shape: DayShape,
  windows: WindowSpec[],
  tasks: ForecastTask[],
  busyByDate: Map<string, BusySpan[]> = new Map(),
): RangePlan {
  const remaining = new Map(tasks.map((t) => [t.id, t.remainingMin]));
  const finishes = new Map<number, string>();
  const planned: RangeDay[] = [];
  const start = DateTime.fromISO(from, { zone: shape.timezone });
  const allPlaced = () => tasks.every((t) => (remaining.get(t.id) ?? 0) === 0);
  let date = from;

  for (let i = 0; i < days && !allPlaced(); i++) {
    date = start.plus({ days: i }).toISODate()!;

    const eligible = tasks
      .filter((t) => (remaining.get(t.id) ?? 0) > 0)
      .filter((t) => t.availableFrom === null || t.availableFrom <= date)
      .map((t) => ({ ...t, remainingMin: remaining.get(t.id)! }));
    if (eligible.length === 0) continue;

    const plan = planDay(date, shape, busyByDate.get(date) ?? [], windows, eligible);
    for (const block of plan.blocks) {
      for (const seg of block.segments) {
        const left = (remaining.get(seg.taskId) ?? 0) - seg.minutes;
        remaining.set(seg.taskId, Math.max(0, left));
        if (left <= 0 && !finishes.has(seg.taskId)) finishes.set(seg.taskId, date);
      }
    }
    if (plan.blocks.length > 0) planned.push({ date, blocks: plan.blocks });
  }

  const leftover = new Map<number, number>();
  for (const [id, mins] of remaining) if (mins > 0) leftover.set(id, mins);

  return { from, to: date, days: planned, finishes, leftover };
}

export type Forecast = Omit<RangePlan, 'days'>;

/** Where work is heading, without the blocks: nothing is stored. */
export function forecast(
  from: string,
  days: number,
  shape: DayShape,
  windows: WindowSpec[],
  tasks: ForecastTask[],
  busyByDate: Map<string, BusySpan[]> = new Map(),
): Forecast {
  const { from: f, to, finishes, leftover } = planRange(from, days, shape, windows, tasks, busyByDate);
  return { from: f, to, finishes, leftover };
}
