import 'server-only';
import { DateTime } from 'luxon';
import type { Horizon, Settings, Task, TimeWindow } from '@/lib/db/schema';
import { busySpans, listDayEvents, type CalendarEvent } from '@/lib/google/calendar';
import { connectionState, isMissingScopeError, MISSING_SCOPE_HELP, type ConnectionState } from '@/lib/google/client';
import {
  availability,
  computeProgress,
  effectiveDeadline,
  effectiveWindowId,
  indexHorizons,
  remainingMinutes,
  subtreeIds,
  type HorizonIndex,
  type Progress,
} from '@/lib/hierarchy';
import * as blockRepo from '@/lib/repo/blocks';
import { listAllHorizons } from '@/lib/repo/horizons';
import { getSettings } from '@/lib/repo/settings';
import { listAllTasks } from '@/lib/repo/tasks';
import { listWindows, toSpec } from '@/lib/repo/windows';
import { atLocalTime, freeSlots, windowInterval, windowOpensOn, type BusySpan, type DayShape, type WindowSpec } from '@/lib/scheduler/day';
import { forecast, type ForecastTask } from '@/lib/scheduler/forecast';
import type { Interval } from '@/lib/scheduler/intervals';
import { planDay, type Plan, type PlannableTask } from '@/lib/scheduler/plan';
import { nowIn } from '@/lib/time/periods';

/** How far ahead the forecast looks: long enough to see a month's work land. */
export const FORECAST_DAYS = 42;

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
}

export async function loadContext(): Promise<PlanningContext> {
  const [settings, windows, horizons, tasks, ticked] = await Promise.all([
    getSettings(),
    listWindows(),
    listAllHorizons(),
    listAllTasks(),
    blockRepo.tickedMinutesByTask(),
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
  };
}

function toPlannable(task: Task, ctx: PlanningContext): PlannableTask {
  return {
    id: task.id,
    title: task.title,
    remainingMin: remainingMinutes(task, ctx.ticked.get(task.id) ?? 0),
    priority: task.priority,
    energy: task.energy,
    dueDate: effectiveDeadline(task, ctx.byId),
    sortOrder: task.sortOrder,
    windowId: effectiveWindowId(task, ctx.byId, ctx.settings.defaultWindowId),
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
    const events = await listDayEvents(date, settings.timezone);
    return { events, busy: busySpans(events), problem: null };
  } catch (error) {
    // Google's wording ("insufficient authentication scopes") does not say what to do.
    return { events: [], busy: [], problem: isMissingScopeError(error) ? MISSING_SCOPE_HELP : (error as Error).message };
  }
}

/**
 * Time the planner must not use on `date` besides meetings: blocks already
 * ticked off (history), and — when planning today — everything before now.
 */
function reservedSpans(ctx: PlanningContext, date: string, blocks: blockRepo.BlockWithSegments[]): BusySpan[] {
  const spans: BusySpan[] = blocks
    .filter((b) => b.state === 'done' || blockRepo.isLocked(b))
    .map((b) => ({ start: b.startsAt, end: b.endsAt }));

  if (date === today(ctx.settings)) {
    const now = nowIn(ctx.settings.timezone);
    const dayStart = atLocalTime(date, '00:00', ctx.settings.timezone);
    // Round up to the next 5 minutes so a re-plan never starts "a moment ago".
    const from = now.plus({ minutes: 5 - (now.minute % 5) }).startOf('minute');
    spans.push({ start: dayStart.toUTC().toISO()!, end: from.toUTC().toISO()! });
  }
  return spans;
}

/** Builds a fresh proposal for `date` and stores it as drafts, replacing any earlier one. */
export async function generateDay(date: string): Promise<Plan> {
  const ctx = await loadContext();
  const [calendar, blocks] = await Promise.all([loadCalendar(date, ctx.settings), blockRepo.listForDate(date)]);

  const busy = [...calendar.busy, ...reservedSpans(ctx, date, blocks)];
  const plan = planDay(date, ctx.shape, busy, ctx.specs, schedulableOn(ctx, date));

  await blockRepo.replaceDrafts(
    date,
    plan.blocks.map((b) => ({
      startsAt: b.start.toUTC().toISO()!,
      endsAt: b.end.toUTC().toISO()!,
      windowId: b.windowId,
      segments: b.segments,
    })),
  );
  return plan;
}

export type HorizonOutlook =
  | { status: 'done' }
  | { status: 'empty' }
  /** Every planned task is finished, but the horizon itself is not marked done. */
  | { status: 'finished' }
  /** `unplanned` counts goals below with nothing planned yet — on track only for what exists. */
  | { status: 'on-track'; finish: string; unplanned: number }
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
  const result = forecast(from, FORECAST_DAYS, ctx.shape, ctx.specs, forecastable, busy);

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
    const unfinished = open.filter((t) => schedulable.has(t.id) && !result.finishes.has(t.id));
    const finish = open
      .map((t) => result.finishes.get(t.id))
      .filter((d): d is string => d !== undefined)
      .sort()
      .at(-1) ?? null;

    if (unfinished.length > 0) {
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
      horizons.set(h.id, { status: 'on-track', finish: finish ?? from, unplanned });
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
      slots: freeSlots(resolved, ctx.shape, day.busy, windowInterval(resolved, spec, ctx.settings.timezone)),
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
