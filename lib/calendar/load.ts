import 'server-only';
import { DateTime } from 'luxon';
import { assembleCalendar, vacationLabel, type CalendarLayout } from '@timeblock/core/calendar/assemble';
import { multiDayReviews, type MultiDayReview } from '@timeblock/core/calendar/multi-day';
import { calendarRange, type CalendarView } from '@timeblock/core/calendar/views';
import type { Settings } from '@timeblock/core/db/schema';
import { nowIn } from '@timeblock/core/time/periods';
import { listCalendars, listRangeEvents, type CalendarEvent, type CalendarSummary } from '@/lib/google/calendar';
import { connectionState, isMissingScopeError, MISSING_SCOPE_HELP, type ConnectionState } from '@/lib/google/client';
import * as blockRepo from '@/lib/repo/blocks';
import { listMarks } from '@/lib/repo/event-marks';
import { listVacations, vacationsBetween, vacationsBySourceEvent } from '@/lib/repo/vacations';
import { getSettings, getCalendarFilters } from '@/lib/repo/settings';
import { listWindows } from '@/lib/repo/windows';

export type { CalendarItem } from '@timeblock/core/calendar/assemble';

export interface CalendarData extends CalendarLayout {
  /** The raw Google events, so the day planner can reuse this read. */
  events: CalendarEvent[];
  /** Vacations not over yet, for the Set vacation form's list. */
  upcomingVacations: { id: number; label: string; startDate: string }[];
  connection: ConnectionState;
  problem: string | null;
  settings: Settings;
  /** The item open in the side panel (`?item=`), if any. */
  selected: string | null;
}

async function loadEvents(
  from: string,
  toExclusive: string,
  zone: string,
  connection: ConnectionState,
): Promise<{ events: CalendarEvent[]; calendars: CalendarSummary[]; problem: string | null }> {
  if (connection.status === 'missing-scope') return { events: [], calendars: [], problem: MISSING_SCOPE_HELP };
  if (connection.status !== 'connected') return { events: [], calendars: [], problem: null };
  try {
    const calendars = await listCalendars();
    const events = await listRangeEvents(from, toExclusive, zone, calendars);
    return { events, calendars, problem: null };
  } catch (error) {
    return {
      events: [],
      calendars: [],
      problem: isMissingScopeError(error) ? MISSING_SCOPE_HELP : (error as Error).message,
    };
  }
}

export async function loadCalendarView(view: CalendarView, anchor: string, selected: string | null = null): Promise<CalendarData> {
  const [settings, filters, windows] = await Promise.all([getSettings(), getCalendarFilters(), listWindows()]);
  const zone = settings.timezone;
  const range = calendarRange(view, anchor, zone);
  const first = range.days[0];
  const last = range.days[range.days.length - 1];
  const afterLast = DateTime.fromISO(last, { zone }).plus({ days: 1 }).toISODate()!;

  const connection = connectionState();
  const rangeStart = DateTime.fromISO(first, { zone }).toUTC().toISO()!;
  const rangeEnd = DateTime.fromISO(afterLast, { zone }).toUTC().toISO()!;
  const [{ events, calendars, problem }, blocks, marks, away, upcoming, converted] = await Promise.all([
    loadEvents(first, afterLast, zone, connection),
    blockRepo.listForRange(first, last),
    listMarks(),
    vacationsBetween(rangeStart, rangeEnd),
    listVacations(nowIn(zone).toUTC().toISO()!),
    vacationsBySourceEvent(),
  ]);

  const layout = assembleCalendar({
    range,
    zone,
    now: nowIn(zone),
    settings,
    filters,
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
    connection,
    problem,
    settings,
    selected,
  };
}

/** How far ahead multi-day events are checked: as far as Plan calendar plans. */
export const REVIEW_DAYS = 92;

/**
 * Multi-day events from today on that still need your decision (see
 * `multiDayReviews`). Empty when Google is not connected or cannot be read —
 * the calendar itself reports that.
 */
export async function loadMultiDayReviews(settings: Settings): Promise<MultiDayReview[]> {
  if (connectionState().status !== 'connected') return [];
  const zone = settings.timezone;
  const now = nowIn(zone);
  const from = now.toISODate()!;
  const until = now.plus({ days: REVIEW_DAYS }).toISODate()!;
  try {
    const [events, marks, vacations] = await Promise.all([listRangeEvents(from, until, zone), listMarks(), listVacations()]);
    return multiDayReviews(events, { marks, vacations, ownCalendarId: settings.targetCalendarId, now: now.toUTC().toISO()!, zone });
  } catch {
    return [];
  }
}
