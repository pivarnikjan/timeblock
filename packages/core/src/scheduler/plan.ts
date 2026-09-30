import type { DateTime } from 'luxon';
import type { Energy } from '../db/schema';
import {
  anytimeWindow,
  closuresFor,
  freeSlots,
  openSlots,
  type Closure,
  windowInterval,
  windowOpensOn,
  type BusySpan,
  type DayShape,
  type WindowSpec,
} from './day';
import { minutes, subtract, type Interval } from './intervals';

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
  /**
   * Tasks sharing a key are one course or path that must be worked in order
   * (see `sequenceIndex`). Null = independent work that may go anywhere.
   */
  sequenceKey?: string | null;
  /** Position inside the sequence; lower comes first. Only compared within one key. */
  sequenceIndex?: number;
  /** A sequential session on its day: it goes first in its window, so the day it was given holds. */
  lead?: boolean;
  /** Never split across blocks (a training session): it gets a block of its own length, or waits for a slot that holds it. */
  whole?: boolean;
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
 * Order work is offered in: overdue first, then priority, then the earliest
 * deadline, then capture order.
 *
 * Week work may be done ahead of its week, so everything open competes for the
 * same windows; earliest-deadline-first makes sure this week's work of one goal
 * is not pushed out by next month's work of a goal that was imported earlier.
 * Within one deadline, the order work was captured or imported in is kept.
 * Tasks of one sequence are then put back into course order (see
 * `enforceSequences`), so no ranking rule can make section 5 jump ahead of
 * section 4.
 */
export function rankTasks<T extends PlannableTask>(tasks: T[], date: string): T[] {
  const overdue = (t: T) => (t.dueDate !== null && t.dueDate < date ? 0 : 1);
  const dueRank = (t: T) => t.dueDate ?? '9999-12-31';

  const ranked = [...tasks].sort(
    (a, b) =>
      Number(b.lead ?? false) - Number(a.lead ?? false) ||
      overdue(a) - overdue(b) ||
      a.priority - b.priority ||
      dueRank(a).localeCompare(dueRank(b)) ||
      a.sortOrder - b.sortOrder ||
      a.id - b.id,
  );
  return enforceSequences(ranked);
}

/**
 * Re-seats each sequence's tasks, in sequence order, into the positions that
 * sequence already holds in the ranking.
 *
 * Different courses still interleave exactly as ranked — only the order inside
 * one course is fixed. The earliest unfinished module takes the best slot any
 * of its course's modules earned.
 */
export function enforceSequences<T extends PlannableTask>(ranked: T[]): T[] {
  const members = new Map<string, T[]>();
  for (const t of ranked) {
    if (!t.sequenceKey) continue;
    members.set(t.sequenceKey, [...(members.get(t.sequenceKey) ?? []), t]);
  }
  for (const list of members.values()) {
    list.sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0) || a.id - b.id);
  }
  const next = new Map<string, number>();
  return ranked.map((t) => {
    if (!t.sequenceKey) return t;
    const i = next.get(t.sequenceKey) ?? 0;
    next.set(t.sequenceKey, i + 1);
    return members.get(t.sequenceKey)![i];
  });
}

/**
 * Splits ranked work into what may be packed today and what has to wait for
 * an earlier module of its sequence.
 *
 * Packing within one window never skips (the queue is taken strictly in
 * order), so sequence order holds by itself there. What it cannot see is a
 * sequence crossing windows: a module in the Work window must not be done at
 * 14:00 while the module before it is still waiting in Learning. So a sequence
 * is only offered up to its first task in a different window from its head.
 */
export function gateSequences<T extends PlannableTask>(ranked: T[]): { ready: T[]; waiting: { task: T; after: T }[] } {
  /** Per sequence: the window its head is in, and the last task offered. */
  const open = new Map<string, { windowId: number | null; last: T }>();
  /** Per sequence: the task everything after it is waiting for. */
  const stopped = new Map<string, T>();
  const ready: T[] = [];
  const waiting: { task: T; after: T }[] = [];

  // `ranked` already holds each sequence in order, so the first member seen is its head.
  for (const t of ranked) {
    const key = t.sequenceKey;
    if (!key) {
      ready.push(t);
      continue;
    }
    const stop = stopped.get(key);
    const run = open.get(key);
    if (stop) {
      waiting.push({ task: t, after: stop });
    } else if (run && run.windowId !== t.windowId) {
      stopped.set(key, run.last);
      waiting.push({ task: t, after: run.last });
    } else {
      open.set(key, { windowId: t.windowId, last: t });
      ready.push(t);
    }
  }
  return { ready, waiting };
}

interface QueueItem {
  taskId: number;
  remaining: number;
  /** See `PlannableTask.whole`. */
  whole?: boolean;
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
 * 3. When the next task does not fit, it is split to fill the block, keeping
 *    at least MIN_SPLIT_MIN on both sides of the cut; if that is impossible
 *    the block closes as it is.
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
        if (item.whole) {
          // A session is never cut: alone in a block as long as it needs, if the slot holds it.
          if (content === 0 && item.remaining <= left) {
            segments.push({ taskId: item.taskId, minutes: item.remaining });
            content = item.remaining;
            queue.shift();
          }
          break;
        }
        // Fill the rest of the block with the start of the next task rather than
        // leave it idle — the goal finishes sooner. Never cut a piece under
        // MIN_SPLIT_MIN on either side; what cannot be cut stays whole for the next block.
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
 * `closures` take a window out of the day for a while (a vacation).
 */
export function planDay(
  date: string,
  shape: DayShape,
  busy: BusySpan[],
  windows: WindowSpec[],
  tasks: PlannableTask[],
  closures: Closure[] = [],
): Plan {
  const known = new Set(windows.map((w) => w.id));
  const specs = [...windows];
  if (tasks.some((t) => t.windowId === null || !known.has(t.windowId))) specs.push(anytimeWindow(shape));

  const { ready: ranked, waiting } = gateSequences(
    rankTasks(
      tasks.filter((t) => t.remainingMin > 0),
      date,
    ),
  );
  const busyNow = [...busy];
  const blocks: PlannedBlock[] = [];
  const unplaced: UnplacedTask[] = waiting.map(({ task, after }) => ({
    taskId: task.id,
    remainingMin: task.remainingMin,
    reason: `waits for “${after.title}” — it comes first in the same course`,
  }));
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

    const window = windowInterval(date, spec, shape.timezone);
    const closed = closuresFor(closures, spec.id, shape.timezone);
    // A window the vacation covers entirely: say so, rather than "no room left".
    if (closed.length > 0 && subtract(window, closed).length === 0) {
      for (const t of mine) {
        unplaced.push({ taskId: t.id, remainingMin: t.remainingMin, reason: `${spec.name} window is closed — you are on vacation` });
      }
      continue;
    }

    const slots = openSlots(freeSlots(date, shape, busyNow, window), closed, shape);
    freeMinutes += slots.reduce((sum, s) => sum + minutes(s), 0);

    const queue: QueueItem[] = mine.map((t) => ({ taskId: t.id, remaining: t.remainingMin, whole: t.whole }));
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
