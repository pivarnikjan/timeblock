import 'server-only';
import { DateTime } from 'luxon';
import type { Horizon, Settings, Task, TimeWindow } from '@/lib/db/schema';
import { busySpans, listDayEvents, listRangeEvents, type CalendarEvent } from '@/lib/google/calendar';
import { connectionState, isMissingScopeError, MISSING_SCOPE_HELP, type ConnectionState } from '@/lib/google/client';
import { commitBlocks, removeBlockEvents, syncBlockColors } from '@/lib/google/sync';
import {
  availability,
  computeProgress,
  effectiveDeadline,
  effectiveWindowId,
  indexHorizons,
  remainingMinutes,
  sequencePositions,
  subtreeIds,
  type HorizonIndex,
  type Progress,
  type SequencePosition,
} from '@/lib/hierarchy';
import * as blockRepo from '@/lib/repo/blocks';
import { placeholderKeys } from '@/lib/repo/event-marks';
import { listAllHorizons } from '@/lib/repo/horizons';
import { getSettings } from '@/lib/repo/settings';
import { listAllTasks } from '@/lib/repo/tasks';
import { listVacations } from '@/lib/repo/vacations';
import { listWindows, toSpec } from '@/lib/repo/windows';
import {
  atLocalTime,
  closuresFor,
  freeSlots,
  openSlots,
  windowInterval,
  windowOpensOn,
  type BusySpan,
  type Closure,
  type DayShape,
  type WindowSpec,
} from '@/lib/scheduler/day';
import { dueAfter, forecast, planRange, type ForecastTask } from '@/lib/scheduler/forecast';
import type { Interval } from '@/lib/scheduler/intervals';
import { planDay, type Plan, type PlannableTask } from '@/lib/scheduler/plan';
import { conflictOf, diffBlocks } from '@/lib/scheduler/reschedule';
import { nowIn } from '@/lib/time/periods';
import { vacationClosures } from '@/lib/vacation';

/** How far ahead the forecast looks: long enough to see a month's work land. */
export const FORECAST_DAYS = 42;

/** How far ahead "Plan calendar" may reach: a quarter, so a long course still lands somewhere. */
export const PLAN_CALENDAR_DAYS = 92;

export function today(settings: Settings): string {
  return nowIn(settings.timezone).toISODate()!;
}

/** Everything planning needs, loaded once per request and resolved as a whole. */
export interface PlanningContext {
  settings: Settings;
  shape: DayShape;
  windows: TimeWindow[];
  specs: WindowSpec[];
  horizons: Horizon[];
  byId: HorizonIndex;
  tasks: Task[];
  ticked: Map<number, number>;
  progress: Map<number, Progress>;
  /** Course order per task — see `sequencePositions`. */
  sequences: Map<number, SequencePosition>;
  /** Windows closed by vacations. */
  closures: Closure[];
}

export async function loadContext(): Promise<PlanningContext> {
  const [settings, windows, horizons, tasks, ticked, vacations] = await Promise.all([
    getSettings(),
    listWindows(),
    listAllHorizons(),
    listAllTasks(),
    blockRepo.tickedMinutesByTask(),
    listVacations(),
  ]);
  return {
    settings,
    shape: settings,
    windows,
    specs: windows.map(toSpec),
    horizons,
    byId: indexHorizons(horizons),
    tasks,
    ticked,
    progress: computeProgress({ horizons, tasks, ticked }),
    sequences: sequencePositions(tasks, indexHorizons(horizons)),
    closures: vacationClosures(vacations),
  };
}

function toPlannable(task: Task, ctx: PlanningContext): PlannableTask {
  const sequence = ctx.sequences.get(task.id);
  return {
    id: task.id,
    title: task.title,
    remainingMin: remainingMinutes(task, ctx.ticked.get(task.id) ?? 0),
    priority: task.priority,
    energy: task.energy,
    dueDate: effectiveDeadline(task, ctx.byId),
    sortOrder: task.sortOrder,
    windowId: effectiveWindowId(task, ctx.byId, ctx.settings.defaultWindowId),
    sequenceKey: sequence?.key ?? null,
    sequenceIndex: sequence?.index ?? 0,
  };
}

/** Tasks the planner may use on `date`, with what is left of each. */
export function schedulableOn(ctx: PlanningContext, date: string): PlannableTask[] {
  return ctx.tasks
    .filter((task) => {
      const when = availability(task, ctx.byId);
      return when.kind === 'now' || (when.kind === 'from' && when.date <= date);
    })
    .map((task) => toPlannable(task, ctx))
    .filter((t) => t.remainingMin > 0);
}

export interface CalendarLoad {
  events: CalendarEvent[];
  busy: BusySpan[];
  /** Set when the calendar could not be read; the day is then planned as empty. */
  problem: string | null;
}

/**
 * Reads the day's calendar, degrading to an empty day rather than an error page —
 * planning against a blank slate is more useful than no planner at all.
 */
export async function loadCalendar(date: string, settings: Settings): Promise<CalendarLoad> {
  const status = connectionState().status;
  if (status === 'missing-scope') return { events: [], busy: [], problem: MISSING_SCOPE_HELP };
  if (status !== 'connected') return { events: [], busy: [], problem: null };
  try {
    const [events, placeholders] = await Promise.all([listDayEvents(date, settings.timezone), placeholderKeys()]);
    return { events, busy: busySpans(events, placeholders), problem: null };
  } catch (error) {
    // Google's wording ("insufficient authentication scopes") does not say what to do.
    return { events: [], busy: [], problem: isMissingScopeError(error) ? MISSING_SCOPE_HELP : (error as Error).message };
  }
}

/**
 * Time the planner must not use on `date` besides meetings: blocks already
 * ticked off (history), blocks placed by hand, and — when planning today —
 * everything before now.
 */
function reservedSpans(ctx: PlanningContext, date: string, blocks: blockRepo.BlockWithSegments[]): BusySpan[] {
  const spans: BusySpan[] = blocks
    .filter((b) => b.date === date && blockRepo.isFixed(b))
    .map((b) => ({ start: b.startsAt, end: b.endsAt }));

  if (date === today(ctx.settings)) spans.push(beforeNow(ctx.settings));
  return spans;
}

/**
 * Today up to now, rounded up to the next 5 minutes so a re-plan never starts
 * "a moment ago". Like any busy span it is padded by the break, so new work
 * starts no earlier than `end` + `bufferMin`.
 */
function beforeNow(settings: Settings): BusySpan {
  const now = nowIn(settings.timezone);
  const dayStart = atLocalTime(today(settings), '00:00', settings.timezone);
  const from = now.plus({ minutes: 5 - (now.minute % 5) }).startOf('minute');
  return { start: dayStart.toUTC().toISO()!, end: from.toUTC().toISO()! };
}

/** Every task a calendar-wide plan may place from `from` on, dated ones with the day they open. */
function forecastableFrom(ctx: PlanningContext, from: string): ForecastTask[] {
  const out: ForecastTask[] = [];
  for (const task of ctx.tasks) {
    const when = availability(task, ctx.byId);
    if (when.kind === 'never') continue;
    out.push({ ...toPlannable(task, ctx), availableFrom: when.kind === 'from' && when.date > from ? when.date : null });
  }
  return out;
}

/**
 * Minutes per task already given a place by hand and not yet ticked: a pinned
 * block from `from` on counts as planned, so its work is not planned twice.
 */
function pinnedMinutes(blocks: blockRepo.BlockWithSegments[], from: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const block of blocks) {
    if (!block.pinned || block.date < from || block.state === 'done') continue;
    for (const s of block.segments) {
      if (s.doneAt === null) out.set(s.taskId, (out.get(s.taskId) ?? 0) + s.minutes);
    }
  }
  return out;
}

const withoutPinned = <T extends PlannableTask>(tasks: T[], pinned: Map<number, number>): T[] =>
  tasks
    .map((t) => ({ ...t, remainingMin: Math.max(0, t.remainingMin - (pinned.get(t.id) ?? 0)) }))
    .filter((t) => t.remainingMin > 0);

const toDrafts = (blocks: Plan['blocks']): blockRepo.DraftBlock[] =>
  blocks.map((b) => ({
    startsAt: b.start.toUTC().toISO()!,
    endsAt: b.end.toUTC().toISO()!,
    windowId: b.windowId,
    segments: b.segments,
  }));

/** Builds a fresh proposal for `date` and stores it as drafts, replacing any earlier one. */
export async function generateDay(date: string): Promise<Plan> {
  const ctx = await loadContext();
  const [calendar, blocks] = await Promise.all([loadCalendar(date, ctx.settings), blockRepo.listFrom(date)]);

  const busy = [...calendar.busy, ...reservedSpans(ctx, date, blocks)];
  const tasks = withoutPinned(schedulableOn(ctx, date), pinnedMinutes(blocks, date));
  const plan = planDay(date, ctx.shape, busy, ctx.specs, tasks, ctx.closures);

  await blockRepo.replaceDrafts(date, toDrafts(plan.blocks));
  return plan;
}

/** What "Plan calendar" did, for the confirmation under the button. */
export interface CalendarPlanSummary {
  from: string;
  /** First and last day that received a block; null when nothing was placed. */
  firstDate: string | null;
  lastDate: string | null;
  blocks: number;
  days: number;
  plannedMinutes: number;
  tasksPlaced: number;
  /** Tasks with minutes that did not fit before the planning horizon ran out. */
  unfinished: { title: string; minutes: number }[];
  /** Dated tasks due after the horizon — planned when their dates come closer. */
  later: { count: number; until: string | null };
  /** Open tasks nobody asked to schedule: month backlogs and loose tasks. */
  notScheduled: number;
  /** Blocks placed by hand that the plan worked around. */
  pinned: number;
  problem: string | null;
}

/** Busy spans per local date across a range, read from Google in one pass. */
async function loadRangeBusy(
  from: string,
  toExclusive: string,
  settings: Settings,
): Promise<{ busy: Map<string, BusySpan[]>; problem: string | null }> {
  const busy = new Map<string, BusySpan[]>();
  const status = connectionState().status;
  if (status === 'missing-scope') return { busy, problem: MISSING_SCOPE_HELP };
  if (status !== 'connected') return { busy, problem: null };

  let events: CalendarEvent[];
  const placeholders = await placeholderKeys();
  try {
    events = await listRangeEvents(from, toExclusive, settings.timezone);
  } catch (error) {
    return { busy, problem: isMissingScopeError(error) ? MISSING_SCOPE_HELP : (error as Error).message };
  }

  // A span is filed under every local date it touches; freeSlots clips it to each day's windows.
  for (const span of busySpans(events, placeholders)) {
    let day = DateTime.fromISO(span.start, { zone: settings.timezone }).startOf('day');
    const end = DateTime.fromISO(span.end, { zone: settings.timezone });
    while (day < end) {
      const key = day.toISODate()!;
      busy.set(key, [...(busy.get(key) ?? []), span]);
      day = day.plus({ days: 1 });
    }
  }
  return { busy, problem: null };
}

/**
 * "Plan calendar": lays every schedulable task into its window, day after day
 * from today, until all of it has a place — around meetings, around blocks
 * already ticked off or placed by hand, and keeping every course in order.
 *
 * The result is stored as drafts, replacing every earlier unpinned draft from
 * today on. Nothing reaches Google until the plan is committed.
 */
export async function planCalendar(): Promise<CalendarPlanSummary> {
  const ctx = await loadContext();
  const from = today(ctx.settings);
  const zone = ctx.settings.timezone;
  const until = DateTime.fromISO(from, { zone }).plus({ days: PLAN_CALENDAR_DAYS }).toISODate()!;

  const [calendar, blocks] = await Promise.all([loadRangeBusy(from, until, ctx.settings), blockRepo.listFrom(from)]);

  const busyByDate = new Map(calendar.busy);
  for (const date of new Set([from, ...blocks.map((b) => b.date)])) {
    busyByDate.set(date, [...(busyByDate.get(date) ?? []), ...reservedSpans(ctx, date, blocks)]);
  }

  const forecastable = forecastableFrom(ctx, from);
  const tasks = withoutPinned(forecastable, pinnedMinutes(blocks, from));

  const plan = planRange(from, PLAN_CALENDAR_DAYS, ctx.shape, ctx.specs, tasks, busyByDate, ctx.closures);
  await blockRepo.replaceDraftsFrom(
    from,
    plan.days.map((d) => ({ date: d.date, drafts: toDrafts(d.blocks) })),
  );

  const segments = plan.days.flatMap((d) => d.blocks.flatMap((b) => b.segments));
  const notYet = dueAfter(tasks, from, PLAN_CALENDAR_DAYS, zone);
  const titleOf = new Map(ctx.tasks.map((t) => [t.id, t.title]));
  const offered = new Set(forecastable.map((t) => t.id));

  return {
    from,
    firstDate: plan.days[0]?.date ?? null,
    lastDate: plan.days.at(-1)?.date ?? null,
    blocks: plan.days.reduce((n, d) => n + d.blocks.length, 0),
    days: plan.days.length,
    plannedMinutes: segments.reduce((n, s) => n + s.minutes, 0),
    tasksPlaced: new Set(segments.map((s) => s.taskId)).size,
    unfinished: [...plan.leftover]
      .filter(([id]) => !notYet.has(id))
      .map(([id, minutes]) => ({ title: titleOf.get(id) ?? `#${id}`, minutes })),
    later: { count: notYet.size, until: [...notYet.values()].sort().at(-1) ?? null },
    notScheduled: ctx.tasks.filter(
      (t) =>
        (t.status === 'backlog' || t.status === 'active') &&
        !offered.has(t.id) &&
        remainingMinutes(t, ctx.ticked.get(t.id) ?? 0) > 0,
    ).length,
    pinned: blocks.filter((b) => b.pinned && b.state !== 'done').length,
    problem: calendar.problem,
  };
}

// ── Reschedule ──────────────────────────────────────────────────────────────

/** What "Reschedule" would change (the preview), or changed. */
export interface RescheduleSummary {
  /** Tasks whose blocks move, earliest change first. */
  impacted: { id: number; title: string }[];
  /** Planned blocks a meeting (or, for a block the planner placed, a vacation) now sits on. */
  conflicts: number;
  /** Of those, blocks placed by hand: they move because a meeting took their place. */
  released: number;
  /** Blocks taken off the calendar, blocks put in their place, and blocks left exactly where they are. */
  removed: number;
  added: number;
  kept: number;
  /** First day that changes. */
  firstChange: string | null;
  /** The new blocks go straight to Google Calendar, because the plan they replace is there. */
  toGoogle: boolean;
  /** Tasks with minutes that no longer fit within the next three months. */
  unfinished: { title: string; minutes: number }[];
  problem: string | null;
}

export interface RescheduleResult extends RescheduleSummary {
  /** Events created in Google Calendar. */
  created: number;
}

interface RescheduleProposal {
  /** Today: the first day the reschedule looks at. */
  from: string;
  summary: RescheduleSummary;
  removed: blockRepo.BlockWithSegments[];
  added: (blockRepo.DraftBlock & { date: string })[];
}

/**
 * Recomputes the plan from now on around everything the calendar holds today —
 * new meetings, vacations, blocks moved by hand — and compares it with the
 * plan already there.
 *
 * What stays put: ticked-off work, blocks placed by hand, and blocks already
 * under way (they start before the next re-plan could) — unless a meeting now
 * sits on them. Everything else is planned again, and a block that comes out
 * identical is kept as it is, Google event and all. Since courses run in order,
 * one displaced block usually moves the ones after it: that cascade is exactly
 * what the reschedule takes off your hands.
 */
async function proposeReschedule(): Promise<RescheduleProposal> {
  const ctx = await loadContext();
  const { settings } = ctx;
  const zone = settings.timezone;
  const from = today(settings);
  const until = DateTime.fromISO(from, { zone }).plus({ days: PLAN_CALENDAR_DAYS }).toISODate()!;

  const [calendar, blocks] = await Promise.all([loadRangeBusy(from, until, settings), blockRepo.listFrom(from)]);

  // A block starting before new work could (now + the break) is under way: it stays unless it collides.
  const now = beforeNow(settings);
  const underWay = DateTime.fromISO(now.end).plus({ minutes: settings.bufferMin }).toMillis();

  const staying: blockRepo.BlockWithSegments[] = [];
  const movable: blockRepo.BlockWithSegments[] = [];
  let conflicts = 0;
  let released = 0;
  for (const block of blocks) {
    if (block.state === 'done' || blockRepo.isLocked(block) || block.date >= until) {
      staying.push(block);
      continue;
    }
    const conflict = conflictOf(block, calendar.busy.get(block.date) ?? [], ctx.closures);
    if (conflict) {
      conflicts += 1;
      if (block.pinned) released += 1;
      movable.push(block);
    } else if (block.pinned || DateTime.fromISO(block.startsAt).toMillis() < underWay) {
      staying.push(block);
    } else {
      movable.push(block);
    }
  }

  const busyByDate = new Map(calendar.busy);
  const addBusy = (date: string, span: BusySpan) => busyByDate.set(date, [...(busyByDate.get(date) ?? []), span]);
  addBusy(from, now);
  for (const block of staying) addBusy(block.date, { start: block.startsAt, end: block.endsAt });

  // Open work in blocks that stay is already planned; only the rest is placed again.
  const held = new Map<number, number>();
  for (const block of staying) {
    if (block.state === 'done' || blockRepo.isLocked(block)) continue;
    for (const s of block.segments) held.set(s.taskId, (held.get(s.taskId) ?? 0) + s.minutes);
  }
  const tasks = withoutPinned(forecastableFrom(ctx, from), held);

  const plan = planRange(from, PLAN_CALENDAR_DAYS, ctx.shape, ctx.specs, tasks, busyByDate, ctx.closures);
  const next = plan.days.flatMap((d) => toDrafts(d.blocks).map((draft) => ({ ...draft, date: d.date })));
  const diff = diffBlocks(movable, next);

  const titleOf = new Map(ctx.tasks.map((t) => [t.id, t.title]));
  const firstSeen = new Map<number, string>();
  for (const block of [...diff.removed, ...diff.added].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    for (const s of block.segments) if (!firstSeen.has(s.taskId)) firstSeen.set(s.taskId, block.startsAt);
  }
  const changedDates = [...diff.removed, ...diff.added].map((b) => b.date).sort();
  const notYet = dueAfter(tasks, from, PLAN_CALENDAR_DAYS, zone);

  return {
    from,
    removed: diff.removed,
    added: diff.added,
    summary: {
      impacted: [...firstSeen.keys()].map((id) => ({ id, title: titleOf.get(id) ?? `#${id}` })),
      conflicts,
      released,
      removed: diff.removed.length,
      added: diff.added.length,
      kept: diff.kept.length,
      firstChange: changedDates[0] ?? null,
      toGoogle: connectionState().status === 'connected' && blocks.some((b) => b.state === 'synced'),
      unfinished: [...plan.leftover]
        .filter(([id]) => !notYet.has(id))
        .map(([id, minutes]) => ({ title: titleOf.get(id) ?? `#${id}`, minutes })),
      problem: calendar.problem,
    },
  };
}

/** "Reschedule", step one: how many tasks a reschedule would move — nothing is changed. */
export async function previewReschedule(): Promise<RescheduleSummary> {
  return (await proposeReschedule()).summary;
}

/**
 * "Reschedule", confirmed: takes the displaced blocks off the calendar and puts
 * the new ones in. When the plan is committed, Google follows — the replaced
 * blocks' events are deleted first (a refusal then changes nothing here) and
 * the new blocks are created there; untouched blocks keep their events.
 *
 * The plan is recomputed rather than taken from the preview, so a meeting added
 * in between is still respected.
 */
export async function reschedule(): Promise<RescheduleResult> {
  const { from, summary, removed, added } = await proposeReschedule();
  if (removed.length === 0 && added.length === 0) return { ...summary, created: 0 };

  await removeBlockEvents(removed);
  await blockRepo.deleteBlocks(removed.map((b) => b.id));
  const ids: number[] = [];
  for (const { date, ...draft } of added) ids.push(await blockRepo.insertDraft(date, draft));

  if (!summary.toGoogle) return { ...summary, created: 0 };
  const created = await commitBlocks(ids);
  // Blocks left where they were keep their events; their colours follow the windows too.
  await syncBlockColors(from);
  return { ...summary, created };
}

export type HorizonOutlook =
  | { status: 'done' }
  | { status: 'empty' }
  /** Every planned task is finished, but the horizon itself is not marked done. */
  | { status: 'finished' }
  /**
   * `unplanned` counts goals below with nothing planned yet — on track only for
   * what exists. `runsTo` is set when dated work lies beyond the forecast: the
   * part in view is on track, and the plan continues until that date.
   */
  | { status: 'on-track'; finish: string; unplanned: number; runsTo: string | null }
  /** Everything open is dated beyond the forecast; the first of it is due on `starts`. */
  | { status: 'upcoming'; starts: string }
  | { status: 'at-risk'; finish: string | null; reason: string }
  | { status: 'unscheduled'; openTasks: number };

export interface Outlook {
  from: string;
  tasks: Map<number, string>;
  horizons: Map<number, HorizonOutlook>;
}

/**
 * Where everything is heading: the day each task is expected to finish, and
 * per horizon whether that lands inside its period.
 *
 * Only today's meetings are known; later days are treated as free, so the
 * forecast is an optimistic bound — an "at risk" is a real warning, an
 * "on track" is a hope.
 */
export async function outlook(ctx: PlanningContext, todaysBusy: BusySpan[] = []): Promise<Outlook> {
  const from = today(ctx.settings);

  const forecastable: ForecastTask[] = [];
  for (const task of ctx.tasks) {
    const when = availability(task, ctx.byId);
    if (when.kind === 'never') continue;
    const plannable = toPlannable(task, ctx);
    if (plannable.remainingMin <= 0) continue;
    forecastable.push({ ...plannable, availableFrom: when.kind === 'from' && when.date > from ? when.date : null });
  }

  const blocks = await blockRepo.listForDate(from);
  const busy = new Map([[from, [...todaysBusy, ...reservedSpans(ctx, from, blocks)]]]);
  const result = forecast(from, FORECAST_DAYS, ctx.shape, ctx.specs, forecastable, busy, ctx.closures);
  const later = dueAfter(forecastable, from, FORECAST_DAYS, ctx.settings.timezone);

  const schedulable = new Set(forecastable.map((t) => t.id));
  const horizons = new Map<number, HorizonOutlook>();

  for (const h of ctx.horizons) {
    if (h.status === 'done') {
      horizons.set(h.id, { status: 'done' });
      continue;
    }
    const ids = subtreeIds(h.id, ctx.horizons);
    const hasTasks = (id: number) => ctx.tasks.some((t) => t.horizonId === id && t.status !== 'dropped');
    const unplanned = ctx.horizons.filter(
      (d) => d.id !== h.id && ids.has(d.id) && d.status === 'active' && !hasTasks(d.id) && !ctx.horizons.some((c) => c.parentId === d.id && c.status !== 'dropped'),
    ).length;
    const open = ctx.tasks.filter(
      (t) => t.horizonId !== null && ids.has(t.horizonId) && remainingMinutes(t, ctx.ticked.get(t.id) ?? 0) > 0,
    );
    if (open.length === 0) {
      const any = ctx.tasks.some((t) => t.horizonId !== null && ids.has(t.horizonId) && t.status !== 'dropped');
      horizons.set(h.id, any ? { status: 'finished' } : { status: 'empty' });
      continue;
    }

    const unscheduled = open.filter((t) => !schedulable.has(t.id));
    const upcoming = open.filter((t) => later.has(t.id)).map((t) => later.get(t.id)!).sort();
    const unfinished = open.filter((t) => schedulable.has(t.id) && !result.finishes.has(t.id) && !later.has(t.id));
    const finish = open
      .map((t) => result.finishes.get(t.id))
      .filter((d): d is string => d !== undefined)
      .sort()
      .at(-1) ?? null;

    if (upcoming.length > 0 && upcoming.length === open.length) {
      horizons.set(h.id, { status: 'upcoming', starts: upcoming[0] });
    } else if (unfinished.length > 0) {
      horizons.set(h.id, {
        status: 'at-risk',
        finish: null,
        reason: `${unfinished.length} task${unfinished.length === 1 ? '' : 's'} won't fit in the next ${FORECAST_DAYS} days`,
      });
    } else if (unscheduled.length === open.length) {
      horizons.set(h.id, { status: 'unscheduled', openTasks: unscheduled.length });
    } else if (finish !== null && finish > h.periodEnd) {
      horizons.set(h.id, { status: 'at-risk', finish, reason: `finishes ${finish}, after the period ends ${h.periodEnd}` });
    } else if (unscheduled.length > 0) {
      horizons.set(h.id, {
        status: 'at-risk',
        finish,
        reason: `${unscheduled.length} task${unscheduled.length === 1 ? ' is' : 's are'} not in any week yet`,
      });
    } else {
      horizons.set(h.id, { status: 'on-track', finish: finish ?? from, unplanned, runsTo: upcoming.at(-1) ?? null });
    }
  }

  return { from, tasks: result.finishes, horizons };
}

export interface WindowSlots {
  window: WindowSpec;
  slots: Interval[];
}

export interface DayView {
  date: string;
  isToday: boolean;
  ctx: PlanningContext;
  connection: ConnectionState;
  events: CalendarEvent[];
  windowSlots: WindowSlots[];
  blocks: blockRepo.BlockWithSegments[];
  /** What the planner will pull from today, with what is left of each. */
  candidates: PlannableTask[];
  /** Open tasks that are not schedulable on their own — pull them in or move them into a week. */
  backlog: Task[];
  problem: string | null;
}

/**
 * Everything the day planner needs for `date`. Pass `calendar` when the day's
 * Google events are already loaded (the Calendar screen has them) to avoid
 * reading Google twice.
 */
export async function loadDay(date?: string, calendar?: CalendarLoad): Promise<DayView> {
  const ctx = await loadContext();
  const resolved =
    date && DateTime.fromISO(date, { zone: ctx.settings.timezone }).isValid ? date : today(ctx.settings);

  const [day, blocks] = await Promise.all([
    calendar ?? loadCalendar(resolved, ctx.settings),
    blockRepo.listForDate(resolved),
  ]);
  const candidates = schedulableOn(ctx, resolved);
  const candidateIds = new Set(candidates.map((c) => c.id));

  const windowSlots = ctx.specs
    .filter((spec) => windowOpensOn(spec, resolved, ctx.settings.timezone))
    .map((spec) => ({
      window: spec,
      slots: openSlots(
        freeSlots(resolved, ctx.shape, day.busy, windowInterval(resolved, spec, ctx.settings.timezone)),
        closuresFor(ctx.closures, spec.id, ctx.settings.timezone),
        ctx.shape,
      ),
    }));

  return {
    date: resolved,
    isToday: resolved === today(ctx.settings),
    ctx,
    connection: connectionState(),
    events: day.events,
    windowSlots,
    blocks,
    candidates,
    backlog: ctx.tasks.filter((t) => (t.status === 'backlog' || t.status === 'active') && !candidateIds.has(t.id)),
    problem: day.problem,
  };
}
