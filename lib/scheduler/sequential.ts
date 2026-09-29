import { DateTime } from 'luxon';

/**
 * Sequential sessions — a training plan, say: Training A on Monday, the
 * treadmill on Tuesday, Training B on Wednesday… Unlike course modules, which
 * may be packed back to back, sessions follow three rules:
 *
 * 1. **One a day, in order.** A session never shares a day with another one of
 *    its plan, and never comes before the one ahead of it is done.
 * 2. **A week is one piece.** The sessions dated in one week are that week's
 *    program; it only starts when all of it fits in what is left of a week.
 *    Back from a vacation on a Wednesday, the program waits for Monday.
 * 3. **An interrupted week starts again.** If a program week cannot be finished
 *    in the week it began — a vacation in the middle — it is done again from
 *    its first session, the sessions already done included, and every later
 *    week moves back with it.
 */
export interface ChainTask {
  id: number;
  /** One ordered plan: every sequential task of one yearly goal. */
  chain: string;
  /** Its program week (sessions sharing it happen inside one calendar week); null = a session on its own. */
  week: string | null;
  /** Its full length — what a session done again takes. */
  estimateMin: number;
  /** Minutes still open (0 = done). */
  remainingMin: number;
  /** Local date its work was done, when done. */
  doneOn: string | null;
  /** Not before this local date (a dated session); null = any day. */
  availableFrom: string | null;
  /** Already given a day by a block that stays (placed by hand, under way). */
  heldOn: string | null;
}

export interface WeekRestart {
  chain: string;
  week: string;
  /** Its sessions, in order. */
  taskIds: number[];
  /** Of those, the ones already done that are done again. */
  redone: number[];
  /** The day it starts again; null when it does not fit before the horizon. */
  on: string | null;
}

export interface SequentialAgenda {
  /** The one day each session is planned on (sessions that fit before the horizon). */
  days: Map<number, string>;
  /** Sessions already done whose week was interrupted — planned again, in full. */
  redo: Set<number>;
  restarts: WeekRestart[];
}

/** `2026-W41`: the ISO week a local date falls in. */
export const isoWeek = (date: string) => DateTime.fromISO(date).toFormat("kkkk-'W'WW");

const plusDays = (date: string, n: number) => DateTime.fromISO(date).plus({ days: n }).toISODate()!;
const weekEnd = (date: string) => DateTime.fromISO(date).startOf('week').plus({ days: 6 }).toISODate()!;
const later = (a: string, b: string | null) => (b !== null && b > a ? b : a);

/**
 * Gives every session of every plan its day, from `from` for `days` days.
 *
 * `tasks` come in plan order. `fits(date, task)` says whether the session's
 * window has room for it on that day, meetings and vacations considered —
 * sessions go first in their window, so nothing else competes for that room.
 */
export function sequentialAgenda(
  tasks: ChainTask[],
  from: string,
  days: number,
  fits: (date: string, task: ChainTask) => boolean,
): SequentialAgenda {
  const out: SequentialAgenda = { days: new Map(), redo: new Set(), restarts: [] };
  const horizonEnd = plusDays(from, days - 1);
  const thisWeek = isoWeek(from);

  for (const chain of new Set(tasks.map((t) => t.chain))) {
    const groups = runsOf(tasks.filter((t) => t.chain === chain));
    let first = groups.findIndex((g) => g.some((t) => t.remainingMin > 0 || t.heldOn !== null));
    if (first === -1) continue;
    let cursor = from;

    // The week under way: carry on, or start it again.
    const current = groups[first];
    const done = current.filter((t) => t.remainingMin === 0 && t.heldOn === null);
    if (current[0].week !== null && done.length > 0) {
      const lastDone = done.map((t) => t.doneOn ?? from).sort().at(-1)!;
      const startedThisWeek =
        done.every((t) => t.doneOn !== null && isoWeek(t.doneOn) === thisWeek) &&
        done.every((t, i) => current[i] === t); // done in order, from the first
      const rest = current.slice(done.length);
      const carriedOn = startedThisWeek ? assign(rest, later(from, plusDays(lastDone, 1)), weekEnd(from), fits) : null;
      if (carriedOn) {
        for (const [id, day] of carriedOn) out.days.set(id, day);
        cursor = plusDays([...carriedOn.values()].at(-1) ?? lastDone, 1);
        first += 1;
      } else {
        for (const t of done) out.redo.add(t.id);
        const again = current.map((t) => ({ ...t, remainingMin: t.estimateMin, heldOn: null, availableFrom: null }));
        groups[first] = again;
        out.restarts.push({ chain, week: current[0].week, taskIds: current.map((t) => t.id), redone: done.map((t) => t.id), on: null });
      }
    }

    for (let g = first; g < groups.length; g++) {
      const open = groups[g].filter((t) => t.remainingMin > 0 || t.heldOn !== null);
      if (open.length === 0) continue;
      const placed = startRun(open, cursor, horizonEnd, fits);
      if (!placed) break; // the plan waits; nothing after this week can come first
      for (const [id, day] of placed) out.days.set(id, day);
      const restart = out.restarts.find((r) => r.chain === chain && r.week === groups[g][0].week && r.on === null);
      if (restart) restart.on = placed.get(open[0].id) ?? null;
      cursor = plusDays([...placed.values()].at(-1)!, 1);
    }
  }
  return out;
}

/** Consecutive sessions of one program week form a run; a session with no week is a run of its own. */
function runsOf(tasks: ChainTask[]): ChainTask[][] {
  const runs: ChainTask[][] = [];
  for (const t of tasks) {
    const last = runs.at(-1);
    if (last && t.week !== null && last[0].week === t.week) last.push(t);
    else runs.push([t]);
  }
  return runs;
}

/** The first day from `cursor` on where the whole run fits inside one week (or anywhere, for a lone session). */
function startRun(run: ChainTask[], cursor: string, horizonEnd: string, fits: (date: string, task: ChainTask) => boolean): Map<number, string> | null {
  for (let start = later(cursor, run[0].availableFrom); start <= horizonEnd; start = plusDays(start, 1)) {
    const limit = run[0].week === null ? horizonEnd : weekEnd(start) < horizonEnd ? weekEnd(start) : horizonEnd;
    const placed = assign(run, start, limit, fits);
    if (placed) return placed;
    if (run[0].week === null) return null; // a lone session found no day at all
  }
  return null;
}

/** One day each, in order, from `start` to `limit`; null when the run does not fit. */
function assign(run: ChainTask[], start: string, limit: string, fits: (date: string, task: ChainTask) => boolean): Map<number, string> | null {
  const placed = new Map<number, string>();
  let day = start;
  for (const t of run) {
    if (t.heldOn !== null) {
      if (t.heldOn < day || t.heldOn > limit) return null;
      placed.set(t.id, t.heldOn);
      day = plusDays(t.heldOn, 1);
      continue;
    }
    let d = later(day, t.availableFrom);
    while (d <= limit && !fits(d, t)) d = plusDays(d, 1);
    if (d > limit) return null;
    placed.set(t.id, d);
    day = plusDays(d, 1);
  }
  return placed;
}
