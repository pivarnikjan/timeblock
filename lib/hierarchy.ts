import { DateTime } from 'luxon';
import type { Horizon, Task } from '@/lib/db/schema';

/**
 * How the levels connect: every task serves exactly one week priority or month
 * outcome, every week one month outcome, every month one yearly goal. Everything
 * here is a pure function over rows already loaded, so the same answers hold on
 * every screen and in tests.
 */

export type HorizonIndex = Map<number, Horizon>;

export function indexHorizons(horizons: Horizon[]): HorizonIndex {
  return new Map(horizons.map((h) => [h.id, h]));
}

/** Ancestors of a horizon, nearest first, including itself. Stops on a cycle. */
export function ancestry(horizonId: number | null, byId: HorizonIndex): Horizon[] {
  const chain: Horizon[] = [];
  const seen = new Set<number>();
  let current = horizonId !== null ? byId.get(horizonId) : undefined;
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Week-of-month by the ISO rule: a week belongs to the month holding its
 * Thursday. October 2026 starts on a Thursday, so its week 1 is 28 Sep – 4 Oct
 * and it has five planning weeks.
 */
export function weekOfMonth(weekStart: string): { month: string; week: number; label: string } {
  const monday = DateTime.fromISO(weekStart).startOf('week');
  const thursday = monday.plus({ days: 3 });
  const sunday = monday.plus({ days: 6 });
  const week = Math.ceil(thursday.day / 7);
  const range =
    monday.month === sunday.month
      ? `${monday.toFormat('d')}–${sunday.toFormat('d LLL')}`
      : `${monday.toFormat('d LLL')} – ${sunday.toFormat('d LLL')}`;
  return {
    month: thursday.toFormat('yyyy-MM'),
    week,
    label: `${thursday.toFormat('LLL')} · week ${week} (${range})`,
  };
}

/** How a horizon reads inside a breadcrumb: weeks carry their week-of-month label. */
export function horizonCrumb(h: Horizon): string {
  return h.level === 'week' ? `${weekOfMonth(h.periodStart).label.split(' (')[0]} · ${h.title}` : h.title;
}

/** Root-first titles, e.g. "CIS-ITSM Certification › ITSM Fundamentals › Oct · week 2 · IT Service Management". */
export function breadcrumb(horizonId: number | null, byId: HorizonIndex): string[] {
  return ancestry(horizonId, byId).reverse().map(horizonCrumb);
}

/**
 * The window a task is scheduled in: its own, else the nearest one set up its
 * goal chain, else the default. Set "Learning" once on a yearly goal and every
 * module beneath it inherits it.
 */
export function effectiveWindowId(
  task: Pick<Task, 'windowId' | 'horizonId'>,
  byId: HorizonIndex,
  defaultWindowId: number | null,
): number | null {
  if (task.windowId !== null) return task.windowId;
  for (const h of ancestry(task.horizonId, byId)) {
    if (h.windowId !== null) return h.windowId;
  }
  return defaultWindowId;
}

export type Availability = { kind: 'now' } | { kind: 'from'; date: string } | { kind: 'never' };

/**
 * When a task may be scheduled without anyone clicking "Pull in".
 *
 * - Active tasks: now.
 * - Tasks under an active week priority: now, whichever week it is. The week is
 *   when the work must be done by (its deadline), not the earliest it may
 *   start — so a goal finishes as soon as the windows allow, and a day never
 *   sits empty while next week's modules wait. Unfinished work keeps carrying
 *   over until done.
 * - Tasks with a due date: from the due date.
 * - Everything else (a month's backlog, loose tasks): not until moved into a
 *   week or marked active. Choosing that is what weekly planning is for.
 */
export function availability(task: Pick<Task, 'status' | 'horizonId' | 'dueDate'>, byId: HorizonIndex): Availability {
  if (task.status === 'done' || task.status === 'dropped') return { kind: 'never' };
  if (task.status === 'active') return { kind: 'now' };
  const week = ancestry(task.horizonId, byId).find((h) => h.level === 'week');
  if (week && week.status === 'active') return { kind: 'now' };
  if (task.dueDate) return { kind: 'from', date: task.dueDate };
  return { kind: 'never' };
}

/** A task's deadline: its own due date or the end of the week/month it serves, whichever comes first. */
export function effectiveDeadline(task: Pick<Task, 'horizonId' | 'dueDate'>, byId: HorizonIndex): string | null {
  const period = ancestry(task.horizonId, byId).find((h) => h.level === 'week' || h.level === 'month');
  const candidates = [task.dueDate, period?.periodEnd ?? null].filter((d): d is string => d !== null);
  return candidates.length > 0 ? candidates.sort()[0] : null;
}

export interface SequencePosition {
  key: string;
  index: number;
}

/**
 * Which ordered run of work each task belongs to, and where in it.
 *
 * A month outcome is a course or path ("Udemy: Agentic AI Architectures"):
 * its modules are done in order — by week, then in the order they were
 * captured or imported — never skipped just because a later one fits a gap.
 * An outcome with the same title under the same goal in another month is the
 * same course continuing. A task under a week with no outcome is sequenced
 * with its week; a task under nothing is independent (absent from the map).
 */
export function sequencePositions(
  tasks: Pick<Task, 'id' | 'horizonId' | 'sortOrder'>[],
  byId: HorizonIndex,
): Map<number, SequencePosition> {
  const placed = tasks.flatMap((task) => {
    const chain = ancestry(task.horizonId, byId);
    const month = chain.find((h) => h.level === 'month');
    const week = chain.find((h) => h.level === 'week');
    const key = month
      ? `month:${month.parentId ?? ''}:${month.title.trim().toLowerCase()}`
      : week
        ? `week:${week.id}`
        : null;
    if (key === null) return [];
    return [{ id: task.id, key, month: month?.periodStart ?? '', week: week?.periodStart ?? '', sortOrder: task.sortOrder }];
  });

  placed.sort(
    (a, b) =>
      a.month.localeCompare(b.month) || a.week.localeCompare(b.week) || a.sortOrder - b.sortOrder || a.id - b.id,
  );
  return new Map(placed.map((p, index) => [p.id, { key: p.key, index }]));
}

/**
 * A yearly goal may run over several years (a fitness plan from September 2026
 * to October 2027): its period then runs from 1 January of its first year to
 * 31 December of its last. "2026 – 2027", or just "2026".
 */
export function yearsLabel(h: Pick<Horizon, 'periodStart' | 'periodEnd'>): string {
  const [from, to] = [h.periodStart.slice(0, 4), h.periodEnd.slice(0, 4)];
  return from === to ? from : `${from} – ${to}`;
}

/**
 * The same-titled yearly goals that fall inside `goal`'s years — the separate
 * "2027" copy a plan imported year by year leaves behind. Extending a goal over
 * several years takes them in: their months, weeks and tasks move under it.
 */
export function absorbedYearGoals(goal: Horizon, horizons: Horizon[]): Horizon[] {
  const title = goal.title.trim().toLowerCase();
  return horizons.filter(
    (h) =>
      h.id !== goal.id &&
      h.level === 'year' &&
      h.title.trim().toLowerCase() === title &&
      h.periodStart >= goal.periodStart &&
      h.periodEnd <= goal.periodEnd,
  );
}

/** Every horizon id in the subtree rooted at `rootId`, itself included. */
export function subtreeIds(rootId: number, horizons: Horizon[]): Set<number> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const h of horizons) {
      if (h.parentId !== null && ids.has(h.parentId) && !ids.has(h.id)) {
        ids.add(h.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Minutes of a task already finished: all of it once done, else its ticked segments. */
export function doneMinutes(task: Pick<Task, 'status' | 'estimateMin'>, tickedMinutes: number): number {
  if (task.status === 'done') return task.estimateMin;
  return Math.min(task.estimateMin, Math.max(0, tickedMinutes));
}

export function remainingMinutes(task: Pick<Task, 'status' | 'estimateMin'>, tickedMinutes: number): number {
  return task.status === 'done' || task.status === 'dropped'
    ? 0
    : Math.max(0, task.estimateMin - doneMinutes(task, tickedMinutes));
}

export interface Progress {
  /** 0..1, or null when nothing has been planned underneath yet. */
  ratio: number | null;
  doneMin: number;
  totalMin: number;
  doneTasks: number;
  totalTasks: number;
}

export interface ProgressInput {
  horizons: Horizon[];
  tasks: Task[];
  /** Ticked segment minutes per task id. */
  ticked: Map<number, number>;
}

/**
 * Progress for every horizon, each child counting equally.
 *
 * A horizon's ratio is the average of its (non-dropped) children plus, when it
 * has tasks of its own, one more component for those tasks by minutes. A child
 * with nothing planned counts as 0 — so a November exam with no tasks keeps the
 * yearly bar honest instead of letting October alone read as 100%. A horizon
 * marked done is 100% regardless. The minute and task totals cover the whole
 * subtree, for labels such as "3/8 tasks · 1h 12m of 4h 24m".
 */
export function computeProgress({ horizons, tasks, ticked }: ProgressInput): Map<number, Progress> {
  const live = horizons.filter((h) => h.status !== 'dropped');
  const children = new Map<number, Horizon[]>();
  for (const h of live) {
    if (h.parentId === null) continue;
    children.set(h.parentId, [...(children.get(h.parentId) ?? []), h]);
  }
  const ownTasks = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.horizonId === null || t.status === 'dropped') continue;
    ownTasks.set(t.horizonId, [...(ownTasks.get(t.horizonId) ?? []), t]);
  }

  const memo = new Map<number, Progress>();
  const visiting = new Set<number>();

  const visit = (h: Horizon): Progress => {
    const cached = memo.get(h.id);
    if (cached) return cached;
    if (visiting.has(h.id)) return { ratio: null, doneMin: 0, totalMin: 0, doneTasks: 0, totalTasks: 0 };
    visiting.add(h.id);

    const components: number[] = [];
    let doneMin = 0;
    let totalMin = 0;
    let doneTasks = 0;
    let totalTasks = 0;

    for (const child of children.get(h.id) ?? []) {
      const p = visit(child);
      components.push(p.ratio ?? 0);
      doneMin += p.doneMin;
      totalMin += p.totalMin;
      doneTasks += p.doneTasks;
      totalTasks += p.totalTasks;
    }

    const own = ownTasks.get(h.id) ?? [];
    if (own.length > 0) {
      let ownDone = 0;
      let ownTotal = 0;
      for (const t of own) {
        ownDone += doneMinutes(t, ticked.get(t.id) ?? 0);
        ownTotal += t.estimateMin;
        if (t.status === 'done') doneTasks += 1;
      }
      totalTasks += own.length;
      doneMin += ownDone;
      totalMin += ownTotal;
      components.push(
        ownTotal > 0 ? ownDone / ownTotal : own.filter((t) => t.status === 'done').length / own.length,
      );
    }

    const ratio =
      h.status === 'done'
        ? 1
        : components.length > 0
          ? components.reduce((a, b) => a + b, 0) / components.length
          : null;

    const result = { ratio, doneMin, totalMin, doneTasks, totalTasks };
    visiting.delete(h.id);
    memo.set(h.id, result);
    return result;
  };

  for (const h of live) visit(h);
  return memo;
}

export interface Unconnected {
  horizons: Horizon[];
  tasks: Task[];
}

/**
 * Items that break the chain: month outcomes and week priorities without a
 * parent, and open tasks that serve nothing. Surfaced on every planning screen.
 */
export function findUnconnected(horizons: Horizon[], tasks: Task[]): Unconnected {
  const ids = new Set(horizons.map((h) => h.id));
  return {
    horizons: horizons.filter(
      (h) =>
        h.status !== 'dropped' &&
        (h.level === 'month' || h.level === 'week') &&
        (h.parentId === null || !ids.has(h.parentId)),
    ),
    tasks: tasks.filter(
      (t) =>
        (t.status === 'backlog' || t.status === 'active') &&
        (t.horizonId === null || !ids.has(t.horizonId)),
    ),
  };
}

export function formatMinutes(mins: number): string {
  const rounded = Math.round(mins);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
