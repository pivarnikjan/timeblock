import type { DateTime } from 'luxon';
import type { Energy } from '@/lib/db/schema';
import {
  anytimeWindow,
  freeSlots,
  windowInterval,
  windowOpensOn,
  type BusySpan,
  type DayShape,
  type WindowSpec,
} from './day';
import { minutes, type Interval } from './intervals';

/** A split never leaves either side shorter than this. */
export const MIN_SPLIT_MIN = 15;

export interface PlannableTask {
  id: number;
  title: string;
  /** Minutes still to do: the estimate minus whatever has been ticked off. */
  remainingMin: number;
  /** 1 = highest. */
  priority: number;
  energy: Energy;
  /** Effective deadline: the task's own due date or its week/month end, whichever is sooner. */
  dueDate: string | null;
  sortOrder: number;
  /** Resolved window (own, inherited, or default); null = anytime. */
  windowId: number | null;
}

export interface PlannedSegment {
  taskId: number;
  minutes: number;
}

/** One calendar event: a 30–60 minute window holding one or more task segments. */
export interface PlannedBlock {
  windowId: number | null;
  start: DateTime;
  end: DateTime;
  segments: PlannedSegment[];
}

export interface UnplacedTask {
  taskId: number;
  remainingMin: number;
  reason: string;
}

export interface Plan {
  date: string;
  blocks: PlannedBlock[];
  unplaced: UnplacedTask[];
  freeMinutes: number;
  scheduledMinutes: number;
}

/**
 * Order work is offered in: overdue first, then priority, then sequence.
 *
 * `sortOrder` sits after priority so that, within one priority, the order work
 * was captured or imported in — a course's module order — is kept.
 */
export function rankTasks<T extends PlannableTask>(tasks: T[], date: string): T[] {
  const overdue = (t: T) => (t.dueDate !== null && t.dueDate < date ? 0 : 1);
  const dueRank = (t: T) => t.dueDate ?? '9999-12-31';

  return [...tasks].sort(
    (a, b) =>
      overdue(a) - overdue(b) ||
      a.priority - b.priority ||
      a.sortOrder - b.sortOrder ||
      dueRank(a).localeCompare(dueRank(b)) ||
      a.id - b.id,
  );
}

interface QueueItem {
  taskId: number;
  remaining: number;
}

/** Rounds a block up to the next 5 minutes so calendar times stay readable. */
const roundUp5 = (mins: number) => Math.ceil(mins / 5) * 5;

/**
 * The longest block allowed to start with `left` minutes remaining in a slot.
 *
 * When a full-length block would strand an unusable remainder (a 90-minute slot
 * holds 60 + 15 break + 15 nobody can use), the block is shortened so a second
 * minimum block still fits after the break: 90 becomes 45 + break + 30.
 */
export function blockCap(left: number, shape: DayShape): number {
  const { maxFocusBlockMin: max, minBlockMin: min, bufferMin: gap } = shape;
  if (left <= max) return left;
  const leavingRoom = left - gap - min;
  return leavingRoom >= min ? Math.min(max, leavingRoom) : Math.min(max, left);
}

/**
 * Packs a ranked queue into the free slots of one window, mutating the queue.
 *
 * 1. Each block is capped by `blockCap`.
 * 2. Whole tasks are combined into the block in order while they fit.
 * 3. When the next task does not fit, the block closes if it already holds the
 *    minimum; otherwise the task is split to fill it, keeping at least
 *    MIN_SPLIT_MIN on both sides of the cut.
 * 4. A block lasts its content rounded up to 5 minutes, never under the minimum.
 * 5. Every block is followed by the break; lunch and the window edge count as one.
 */
export function packWindow(
  slots: Interval[],
  queue: QueueItem[],
  shape: DayShape,
  windowId: number | null,
): PlannedBlock[] {
  const out: PlannedBlock[] = [];

  for (const slot of [...slots].sort((a, b) => a.start.toMillis() - b.start.toMillis())) {
    let cursor = slot.start;

    while (queue.length > 0) {
      const left = slot.end.diff(cursor, 'minutes').minutes;
      if (left < shape.minBlockMin) break;

      const cap = blockCap(left, shape);
      const segments: PlannedSegment[] = [];
      let content = 0;

      while (queue.length > 0) {
        const item = queue[0];
        const space = cap - content;

        if (item.remaining <= space) {
          segments.push({ taskId: item.taskId, minutes: item.remaining });
          content += item.remaining;
          queue.shift();
          continue;
        }
        if (content >= shape.minBlockMin) break;

        const placed = Math.min(space, item.remaining - MIN_SPLIT_MIN);
        if (placed >= MIN_SPLIT_MIN) {
          segments.push({ taskId: item.taskId, minutes: placed });
          item.remaining -= placed;
          content += placed;
        }
        break;
      }

      if (segments.length === 0) break;

      const length = Math.min(Math.max(shape.minBlockMin, roundUp5(content)), left);
      const end = cursor.plus({ minutes: length });
      out.push({ windowId, start: cursor, end, segments: mergeSegments(segments) });
      cursor = end.plus({ minutes: shape.bufferMin });
    }
  }
  return out;
}

/** Two adjacent segments of the same task inside one block read as one. */
function mergeSegments(segments: PlannedSegment[]): PlannedSegment[] {
  const merged: PlannedSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && last.taskId === s.taskId) last.minutes += s.minutes;
    else merged.push({ ...s });
  }
  return merged;
}

/**
 * Plans one day across every window.
 *
 * Windows are filled in order and each one's blocks become busy time for the
 * next, so overlapping windows can never double-book the same minutes.
 */
export function planDay(
  date: string,
  shape: DayShape,
  busy: BusySpan[],
  windows: WindowSpec[],
  tasks: PlannableTask[],
): Plan {
  const known = new Set(windows.map((w) => w.id));
  const specs = [...windows];
  if (tasks.some((t) => t.windowId === null || !known.has(t.windowId))) specs.push(anytimeWindow(shape));

  const ranked = rankTasks(
    tasks.filter((t) => t.remainingMin > 0),
    date,
  );
  const busyNow = [...busy];
  const blocks: PlannedBlock[] = [];
  const unplaced: UnplacedTask[] = [];
  let freeMinutes = 0;

  for (const spec of specs) {
    const mine = ranked.filter((t) =>
      spec.id === null ? t.windowId === null || !known.has(t.windowId) : t.windowId === spec.id,
    );
    if (mine.length === 0) continue;

    if (!windowOpensOn(spec, date, shape.timezone)) {
      for (const t of mine) {
        unplaced.push({ taskId: t.id, remainingMin: t.remainingMin, reason: `${spec.name} window is closed today` });
      }
      continue;
    }

    const slots = freeSlots(date, shape, busyNow, windowInterval(date, spec, shape.timezone));
    freeMinutes += slots.reduce((sum, s) => sum + minutes(s), 0);

    const queue: QueueItem[] = mine.map((t) => ({ taskId: t.id, remaining: t.remainingMin }));
    const placed = packWindow(slots, queue, shape, spec.id);
    blocks.push(...placed);
    busyNow.push(...placed.map((b) => ({ start: b.start.toUTC().toISO()!, end: b.end.toUTC().toISO()! })));

    for (const item of queue) {
      unplaced.push({
        taskId: item.taskId,
        remainingMin: item.remaining,
        reason: `no room left in the ${spec.name} window today — continues next time it opens`,
      });
    }
  }

  blocks.sort((a, b) => a.start.toMillis() - b.start.toMillis());

  return {
    date,
    blocks,
    unplaced,
    freeMinutes,
    scheduledMinutes: blocks.reduce((sum, b) => sum + b.segments.reduce((s, seg) => s + seg.minutes, 0), 0),
  };
}
