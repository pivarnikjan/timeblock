import { DateTime } from 'luxon';
import { ENERGY, type Energy, type Horizon, type Task, type TimeWindow } from '@timeblock/core/db/schema';
import { parseDuration } from '@/lib/csv/duration';
import { readTable } from '@/lib/csv/parse';
import { weekOfMonth } from '@timeblock/core/hierarchy';
import { periodFor, type Level } from '@timeblock/core/time/periods';

/**
 * CSV → an ordered list of operations, with nothing written.
 *
 * Every row spells out its own chain (year goal › month outcome › week
 * priority › task), so one file can build or extend a whole plan. Goals are
 * matched on level + period + title and created when missing; tasks are matched
 * on title + the goal they serve and updated when present, so re-importing a
 * corrected file fixes it instead of duplicating it.
 */

export const TEMPLATE_COLUMNS = [
  'year_goal',
  'year',
  'month_outcome',
  'month',
  'week_priority',
  'week',
  'task',
  'duration',
  'priority',
  'energy',
  'due_date',
  'status',
  'window',
  'sequential',
  'notes',
] as const;

type HorizonLevel = Extract<Level, 'year' | 'month' | 'week'>;

export interface RowHorizon {
  level: HorizonLevel;
  title: string;
  periodStart: string;
  periodEnd: string;
}

export interface RowTask {
  title: string;
  estimateMin: number;
  priority: number;
  energy: Energy;
  dueDate: string | null;
  status: 'backlog' | 'active';
  notes: string | null;
  /** A session of an ordered plan (see lib/scheduler/sequential.ts); null when the file has no such column. */
  sequential: boolean | null;
}

const YES = ['yes', 'y', 'true', '1', 'x', 'ano', 'áno', 'a'];
const NO = ['', 'no', 'n', 'false', '0', 'nie'];

export interface ImportRow {
  line: number;
  chain: RowHorizon[];
  task: RowTask | null;
  /** Window id resolved from the `window` column; applies to the task, else the deepest goal. */
  windowId: number | null;
}

export interface ImportIssue {
  line: number;
  message: string;
}

// ── value readers ────────────────────────────────────────────────────────────

/** `2026-10-05` or `5.10.2026` (the Slovak/European way Excel writes dates). */
export function parseLocalDate(input: string): string | null {
  const text = input.trim();
  let dt: DateTime | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) dt = DateTime.fromISO(text);
  const dotted = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(text);
  if (dotted) dt = DateTime.fromObject({ day: +dotted[1], month: +dotted[2], year: +dotted[3] });
  return dt?.isValid ? dt.toISODate() : null;
}

/** `2026-10` or any date inside the month. */
export function parseMonth(input: string): DateTime | null {
  const text = input.trim();
  const ym = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (ym) {
    const dt = DateTime.fromObject({ year: +ym[1], month: +ym[2], day: 1 });
    return dt.isValid ? dt : null;
  }
  const date = parseLocalDate(text);
  return date ? DateTime.fromISO(date) : null;
}

/**
 * `2026-W41` (ISO week), `2026-10 week 2` (week of month, ISO Thursday rule —
 * October 2026's week 1 is 28 Sep – 4 Oct), or any date inside the week.
 */
export function parseWeek(input: string): DateTime | null {
  const text = input.trim();

  const iso = /^(\d{4})-?W(\d{1,2})$/i.exec(text);
  if (iso) {
    const dt = DateTime.fromObject({ weekYear: +iso[1], weekNumber: +iso[2], weekday: 1 });
    return dt.isValid && dt.weekNumber === +iso[2] ? dt : null;
  }

  const ofMonth = /^(\d{4})-(\d{1,2})\s*(?:week|w|týždeň)\s*(\d)$/i.exec(text);
  if (ofMonth) {
    const first = DateTime.fromObject({ year: +ofMonth[1], month: +ofMonth[2], day: 1 });
    if (!first.isValid) return null;
    // The first Monday whose Thursday falls inside the month.
    let monday = first.startOf('week');
    if (monday.plus({ days: 3 }).month !== first.month) monday = monday.plus({ weeks: 1 });
    const week = monday.plus({ weeks: +ofMonth[3] - 1 });
    return weekOfMonth(week.toISODate()!).month === first.toFormat('yyyy-MM') ? week : null;
  }

  const date = parseLocalDate(text);
  return date ? DateTime.fromISO(date).startOf('week') : null;
}

// ── rows ─────────────────────────────────────────────────────────────────────

export interface ParsedImport {
  rows: ImportRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  unknownColumns: string[];
}

export function parseImport(text: string, windows: Pick<TimeWindow, 'id' | 'name'>[]): ParsedImport {
  const table = readTable(text);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const rows: ImportRow[] = [];

  const known = new Set<string>(TEMPLATE_COLUMNS);
  const unknownColumns = table.headers.filter((h) => h !== '' && !known.has(h));

  if (table.headers.length === 0) {
    return { rows, errors: [{ line: 1, message: 'The file is empty.' }], warnings, unknownColumns };
  }
  if (!table.headers.some((h) => ['task', 'year_goal', 'month_outcome', 'week_priority'].includes(h))) {
    errors.push({
      line: 1,
      message: 'No recognised columns. The header row needs at least "task" — download the template to start from.',
    });
    return { rows, errors, warnings, unknownColumns };
  }

  for (const row of table.rows) {
    const fail = (message: string) => errors.push({ line: row.line, message });
    const before = errors.length;

    const yearTitle = row.get('year_goal');
    const monthTitle = row.get('month_outcome');
    const weekTitle = row.get('week_priority');
    const taskTitle = row.get('task');

    if (!yearTitle && !monthTitle && !weekTitle && !taskTitle) continue;

    // Periods — each level can be derived from the one below when left blank.
    const weekRaw = row.get('week');
    const monthRaw = row.get('month');
    const yearRaw = row.get('year');

    const week = weekRaw ? parseWeek(weekRaw) : null;
    if (weekRaw && !week) fail(`Cannot read week "${weekRaw}" — use 2026-W41, 2026-10 week 2, or a date in the week.`);
    if (weekTitle && !weekRaw) fail(`Week priority "${weekTitle}" needs a week (e.g. 2026-W41 or 2026-10 week 2).`);

    let month = monthRaw ? parseMonth(monthRaw) : null;
    if (monthRaw && !month) fail(`Cannot read month "${monthRaw}" — use 2026-10 or a date in the month.`);
    if (!month && week) month = DateTime.fromISO(`${weekOfMonth(week.toISODate()!).month}-01`);
    if (monthTitle && !month) fail(`Month outcome "${monthTitle}" needs a month (e.g. 2026-10).`);

    let year: DateTime | null = null;
    // A goal over several years: "2026-2027" runs from 1 Jan 2026 to 31 Dec 2027.
    let lastYear: number | null = null;
    if (yearRaw) {
      const range = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(yearRaw);
      if (range && +range[2] >= +range[1]) {
        year = DateTime.fromObject({ year: +range[1], month: 1, day: 1 });
        lastYear = +range[2];
      } else {
        year = /^\d{4}$/.test(yearRaw) ? DateTime.fromObject({ year: +yearRaw, month: 1, day: 1 }) : null;
      }
      if (!year) fail(`Cannot read year "${yearRaw}" — use 2026, or 2026-2027 for a goal over several years.`);
    } else if (month) {
      year = month.startOf('year');
    }
    if (yearTitle && !year) fail(`Year goal "${yearTitle}" needs a year (or a month to take it from).`);

    // One parent per level: a chain may start high, but never skip a level.
    if (weekTitle && !monthTitle) fail(`Week priority "${weekTitle}" must name the month outcome it serves.`);
    if (monthTitle && !yearTitle) fail(`Month outcome "${monthTitle}" must name the yearly goal it serves.`);

    if (week && month) {
      const weekEnd = week.plus({ days: 6 });
      const overlaps = week <= month.endOf('month') && weekEnd >= month.startOf('month');
      if (!overlaps) {
        fail(`Week ${week.toISODate()} does not fall in ${month.toFormat('LLLL yyyy')}, so it cannot serve that month's outcome.`);
      }
    }

    // Task.
    let task: RowTask | null = null;
    if (taskTitle) {
      const durationRaw = row.get('duration');
      const estimate = parseDuration(durationRaw);
      if (!durationRaw) fail(`Task "${taskTitle}" needs a duration (e.g. 56, 1h 25m, 1:25).`);
      else if (estimate === null) fail(`Cannot read duration "${durationRaw}" for "${taskTitle}".`);

      const priorityRaw = row.get('priority');
      const priority = priorityRaw ? Number(priorityRaw) : 3;
      if (!Number.isInteger(priority) || priority < 1 || priority > 4) fail(`Priority must be 1–4, got "${priorityRaw}".`);

      const energyRaw = row.get('energy').toLowerCase();
      if (energyRaw && !ENERGY.includes(energyRaw as Energy)) fail(`Energy must be deep, shallow or admin, got "${energyRaw}".`);

      const statusRaw = row.get('status').toLowerCase();
      if (statusRaw && statusRaw !== 'backlog' && statusRaw !== 'active') fail(`Status must be backlog or active, got "${statusRaw}".`);

      const dueRaw = row.get('due_date');
      const dueDate = dueRaw ? parseLocalDate(dueRaw) : null;
      if (dueRaw && !dueDate) fail(`Cannot read due date "${dueRaw}" — use 2026-10-05 or 5.10.2026.`);

      const sequentialRaw = row.get('sequential').toLowerCase();
      if (!YES.includes(sequentialRaw) && !NO.includes(sequentialRaw)) fail(`Sequential must be yes or no, got "${sequentialRaw}".`);

      if (!weekTitle && !monthTitle && !yearTitle) {
        warnings.push({ line: row.line, message: `"${taskTitle}" serves no goal; it will be listed under Not connected.` });
      } else if (!weekTitle && monthTitle && !dueDate) {
        warnings.push({ line: row.line, message: `"${taskTitle}" goes into the month backlog — move it into a week to schedule it.` });
      }

      task = {
        title: taskTitle,
        estimateMin: estimate ?? 0,
        priority,
        energy: (energyRaw || 'deep') as Energy,
        dueDate,
        status: (statusRaw || 'backlog') as 'backlog' | 'active',
        notes: row.get('notes') || null,
        // Without the column, a re-import leaves the flag as it is (it may have been set on the Tasks screen).
        sequential: table.headers.includes('sequential') ? YES.includes(sequentialRaw) : null,
      };
    }

    const windowRaw = row.get('window');
    const window = windowRaw ? windows.find((w) => w.name.toLowerCase() === windowRaw.toLowerCase()) : null;
    if (windowRaw && !window) {
      fail(`Unknown window "${windowRaw}". Known: ${windows.map((w) => w.name).join(', ') || 'none — add one in Settings'}.`);
    }

    if (errors.length > before) continue;

    const chain: RowHorizon[] = [];
    const push = (level: HorizonLevel, title: string, at: DateTime) => {
      const p = periodFor(level, at);
      chain.push({ level, title, periodStart: p.start, periodEnd: p.end });
    };
    if (yearTitle && year) push('year', yearTitle, year);
    if (yearTitle && year && lastYear !== null) chain[chain.length - 1].periodEnd = `${lastYear}-12-31`;
    if (monthTitle && month) push('month', monthTitle, month);
    if (weekTitle && week) push('week', weekTitle, week);

    rows.push({ line: row.line, chain, task, windowId: window?.id ?? null });
  }

  return { rows, errors, warnings, unknownColumns };
}

// ── operations ───────────────────────────────────────────────────────────────

export const horizonKey = (h: { level: Level; periodStart: string; title: string }) =>
  `${h.level}|${h.periodStart}|${h.title.trim().toLowerCase()}`;

export type ImportOp =
  | { kind: 'create-horizon'; key: string; horizon: RowHorizon; parentKey: string | null; windowId: number | null; line: number }
  /** `periodEnd` is set when the file makes a stored yearly goal run longer (2026 → 2026-2027). */
  | { kind: 'update-horizon'; key: string; id: number; parentKey: string | null; windowId: number | null; periodEnd?: string; line: number }
  | { kind: 'create-task'; horizonKey: string | null; task: RowTask; windowId: number | null; sortOrder: number; line: number }
  | { kind: 'update-task'; id: number; horizonKey: string | null; task: RowTask; windowId: number | null; sortOrder: number; line: number };

export interface ImportPlan {
  ops: ImportOp[];
  /** Horizon keys already in the database, mapped to their ids. */
  existing: Map<string, number>;
  summary: {
    goals: { created: number; updated: number };
    outcomes: { created: number; updated: number };
    weeks: { created: number; updated: number };
    tasks: { created: number; updated: number };
  };
}

/**
 * Resolves parsed rows against what is already stored.
 *
 * Re-import rules: a task is matched on title + the goal it serves. Its
 * estimate, priority, energy, due date, notes, window and position are updated
 * from the file; its status and ticked-off progress are never touched. A goal
 * matched on level + period + title has its parent (and window, when the row
 * sets one) brought in line with the file.
 *
 * A yearly goal over several years ("2026-2027" in the file, or one already
 * stored) is one goal: every row naming it with a year inside its range — the
 * plan's "2027" row, or tasks whose year comes from a 2027 month — lands on it.
 */
export function planImport(rows: ImportRow[], horizons: Horizon[], tasks: Task[], nextSortOrder: number): ImportPlan {
  const existing = new Map(horizons.map((h) => [horizonKey(h), h.id]));
  const storedEnd = new Map(horizons.map((h) => [h.id, h.periodEnd]));
  const norm = (title: string) => title.trim().toLowerCase();

  const multiYear = (h: { periodStart: string; periodEnd: string }) => h.periodStart.slice(0, 4) !== h.periodEnd.slice(0, 4);
  const spans = [
    ...rows.flatMap((r) => r.chain.filter((h) => h.level === 'year' && multiYear(h))),
    ...horizons.filter((h) => h.level === 'year' && multiYear(h)),
  ];
  const canonical = (h: RowHorizon): RowHorizon => {
    if (h.level !== 'year') return h;
    const span = spans
      .filter((s) => norm(s.title) === norm(h.title) && s.periodStart <= h.periodStart && s.periodEnd >= h.periodEnd)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart) || b.periodEnd.localeCompare(a.periodEnd))[0];
    return span ? { ...h, periodStart: span.periodStart, periodEnd: span.periodEnd } : h;
  };
  rows = rows.map((r) => ({ ...r, chain: r.chain.map(canonical) }));

  const ops: ImportOp[] = [];
  const horizonOp = new Map<string, number>();
  const taskOp = new Map<string, number>();
  let order = nextSortOrder;

  const summary: ImportPlan['summary'] = {
    goals: { created: 0, updated: 0 },
    outcomes: { created: 0, updated: 0 },
    weeks: { created: 0, updated: 0 },
    tasks: { created: 0, updated: 0 },
  };
  const bucket = (level: HorizonLevel) =>
    level === 'year' ? summary.goals : level === 'month' ? summary.outcomes : summary.weeks;

  for (const row of rows) {
    let parentKey: string | null = null;

    row.chain.forEach((h, i) => {
      const key = horizonKey(h);
      // A goal-only row's window belongs to its deepest goal ("Learning" on the year).
      const windowId = i === row.chain.length - 1 && !row.task ? row.windowId : null;
      const seen = horizonOp.get(key);

      if (seen !== undefined) {
        if (windowId !== null) (ops[seen] as { windowId: number | null }).windowId = windowId;
      } else if (existing.has(key)) {
        const id = existing.get(key)!;
        const longer = h.level === 'year' && h.periodEnd > (storedEnd.get(id) ?? h.periodEnd) ? { periodEnd: h.periodEnd } : {};
        horizonOp.set(key, ops.push({ kind: 'update-horizon', key, id, parentKey, windowId, ...longer, line: row.line }) - 1);
        bucket(h.level).updated += 1;
      } else {
        horizonOp.set(key, ops.push({ kind: 'create-horizon', key, horizon: h, parentKey, windowId, line: row.line }) - 1);
        bucket(h.level).created += 1;
      }
      parentKey = key;
    });

    if (!row.task) continue;

    const servesKey: string | null = parentKey;
    const identity = `${norm(row.task.title)}|${servesKey ?? ''}`;
    const sortOrder = order++;

    const repeat = taskOp.get(identity);
    if (repeat !== undefined) {
      // The same task twice in one file: the later row wins.
      const previous = ops[repeat] as Extract<ImportOp, { kind: 'create-task' | 'update-task' }>;
      ops[repeat] = { ...previous, task: row.task, windowId: row.windowId, sortOrder, line: row.line };
      continue;
    }

    // A goal created by this import has no tasks yet, so nothing can match under it.
    const servesId = servesKey === null ? null : existing.get(servesKey);
    const match =
      servesId === undefined
        ? undefined
        : tasks.find((t) => norm(t.title) === norm(row.task!.title) && t.horizonId === servesId);

    if (match) {
      taskOp.set(identity, ops.push({ kind: 'update-task', id: match.id, horizonKey: servesKey, task: row.task, windowId: row.windowId, sortOrder, line: row.line }) - 1);
      summary.tasks.updated += 1;
    } else {
      taskOp.set(identity, ops.push({ kind: 'create-task', horizonKey: servesKey, task: row.task, windowId: row.windowId, sortOrder, line: row.line }) - 1);
      summary.tasks.created += 1;
    }
  }

  return { ops, existing, summary };
}
