import { DateTime } from 'luxon';
import type { Settings } from '../db/schema';
import type { Env, GoogleStatus } from '../env';
import { listCalendars, listRangeEvents, type CalendarEvent, type CalendarSummary } from '../google/reads';
import { isMissingScopeError, MISSING_SCOPE_HELP } from '../google/scopes';
import * as blockStore from '../store/blocks';
import { listMarks } from '../store/event-marks';
import { getCalendarFilters, getSettings } from '../store/settings';
import { listVacations, vacationsBetween, vacationsBySourceEvent } from '../store/vacations';
import { listWindows } from '../store/windows';
import { nowIn } from '../time/periods';
import { assembleCalendar, vacationLabel, type CalendarLayout } from './assemble';
import type { CalendarFilters } from './filters';
import { multiDayReviews, type MultiDayReview } from './multi-day';
import { calendarRange, type CalendarView } from './views';

export type { CalendarItem } from './assemble';

export interface CalendarData extends CalendarLayout {
  /** The raw Google events, so the day planner can reuse this read. */
  events: CalendarEvent[];
  /** Vacations not over yet, for the Set vacation form's list. */
  upcomingVacations: { id: number; label: string; startDate: string }[];
  googleStatus: GoogleStatus;
  problem: string | null;
  settings: Settings;
}

/** Google's side of a calendar view — or nothing, with the reason, when Google cannot be read. */
export interface GoogleRead {
  events: CalendarEvent[];
  calendars: CalendarSummary[];
  problem: string | null;
}

export async function loadEvents(env: Env, from: string, toExclusive: string, zone: string): Promise<GoogleRead> {
  const status = env.google.status();
  if (status === 'missing-scope') return { events: [], calendars: [], problem: MISSING_SCOPE_HELP };
  if (status !== 'connected') return { events: [], calendars: [], problem: null };
  try {
    const calendars = await listCalendars(env);
    const events = await listRangeEvents(env, from, toExclusive, zone, calendars);
    return { events, calendars, problem: null };
  } catch (error) {
    return {
      events: [],
      calendars: [],
      problem: isMissingScopeError(error) ? MISSING_SCOPE_HELP : (error as Error).message,
    };
  }
}

export interface CalendarViewOptions {
  /** Filters to draw with instead of the stored ones (the phone keeps its own, per device). */
  filters?: CalendarFilters;
  /**
   * Google's side, when the caller reads it itself — the phone falls back to its
   * last read while offline.
   */
  google?: (from: string, toExclusive: string, zone: string) => Promise<GoogleRead>;
}

/** Everything a Calendar view (day, work week, week, month) around `anchor` draws. */
export async function loadCalendarView(env: Env, view: CalendarView, anchor: string, options: CalendarViewOptions = {}): Promise<CalendarData> {
  const [settings, storedFilters, windows] = await Promise.all([getSettings(env.db), getCalendarFilters(env.db), listWindows(env.db)]);
  const zone = settings.timezone;
  const range = calendarRange(view, anchor, zone);
  const first = range.days[0];
  const last = range.days[range.days.length - 1];
  const afterLast = DateTime.fromISO(last, { zone }).plus({ days: 1 }).toISODate()!;

  const rangeStart = DateTime.fromISO(first, { zone }).toUTC().toISO()!;
  const rangeEnd = DateTime.fromISO(afterLast, { zone }).toUTC().toISO()!;
  const [{ events, calendars, problem }, blocks, marks, away, upcoming, converted] = await Promise.all([
    options.google ? options.google(first, afterLast, zone) : loadEvents(env, first, afterLast, zone),
    blockStore.listForRange(env.db, first, last),
    listMarks(env.db),
    vacationsBetween(env.db, rangeStart, rangeEnd),
    listVacations(env.db, nowIn(zone).toUTC().toISO()!),
    vacationsBySourceEvent(env.db),
  ]);

  const layout = assembleCalendar({
    range,
    zone,
    now: nowIn(zone),
    settings,
    filters: options.filters ?? storedFilters,
    windows,
    events,
    calendars,
    blocks,
    marks,
    vacations: away,
    converted,
  });

  return {
    ...layout,
    events,
    upcomingVacations: upcoming.map((v) => ({
      id: v.id,
      label: vacationLabel(v.startsAt, v.endsAt, zone, v.note),
      startDate: DateTime.fromISO(v.startsAt).setZone(zone).toISODate()!,
    })),
    googleStatus: env.google.status(),
    problem,
    settings,
  };
}

/** How far ahead multi-day events are checked: as far as Plan calendar plans. */
export const REVIEW_DAYS = 92;

/**
 * Multi-day events from today on that still need your decision (see
 * `multiDayReviews`). Empty when Google is not connected or cannot be read —
 * the calendar itself reports that.
 */
export async function loadMultiDayReviews(env: Env, settings: Settings): Promise<MultiDayReview[]> {
  if (env.google.status() !== 'connected') return [];
  const zone = settings.timezone;
  const now = nowIn(zone);
  const from = now.toISODate()!;
  const until = now.plus({ days: REVIEW_DAYS }).toISODate()!;
  try {
    const [events, marks, vacations] = await Promise.all([listRangeEvents(env, from, until, zone), listMarks(env.db), listVacations(env.db)]);
    return multiDayReviews(events, { marks, vacations, ownCalendarId: settings.targetCalendarId, now: now.toUTC().toISO()!, zone });
  } catch {
    return [];
  }
}
