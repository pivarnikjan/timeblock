import 'server-only';
import { DateTime } from 'luxon';
import type { Settings } from '@/lib/db/schema';
import { listCalendars, listRangeEvents, type CalendarEvent, type CalendarSummary } from '@/lib/google/calendar';
import { connectionState, isMissingScopeError, MISSING_SCOPE_HELP, type ConnectionState } from '@/lib/google/client';
import * as blockRepo from '@/lib/repo/blocks';
import { getSettings, getCalendarFilters } from '@/lib/repo/settings';
import { listWindows, toSpec } from '@/lib/repo/windows';
import { windowInterval, windowOpensOn, type WindowSpec } from '@/lib/scheduler/day';
import { nowIn } from '@/lib/time/periods';
import { energyColor, eventColor, textOn } from './colors';
import { eventKey, isHidden, type CalendarFilters } from './filters';
import { calendarRange, visibleHours, type CalendarRange, type CalendarView } from './views';

/** One thing drawn on the calendar — a Google event or a TimeBlock block. */
export interface CalendarItem {
  id: string;
  kind: 'event' | 'block';
  title: string;
  start: DateTime;
  end: DateTime;
  allDay: boolean;
  /** Spans more than one day: all-day over several dates, or timed and 24h+. */
  multiDay: boolean;
  color: string;
  textColor: string;
  declined: boolean;
  /** A TimeBlock draft not yet committed to Google — drawn dashed. */
  draft: boolean;
  calendarId: string | null;
  /** Series key used to hide this event individually (events only). */
  hideKey: string | null;
  /** Date the item belongs to for planning (blocks) — links to that day. */
  planDate: string | null;
}

export interface WindowBand {
  name: string;
  start: DateTime;
  end: DateTime;
}

export interface CalendarData {
  view: CalendarView;
  range: CalendarRange;
  zone: string;
  today: string;
  now: DateTime;
  hours: { startMin: number; endMin: number };
  items: CalendarItem[];
  /** The raw Google events, so the day planner can reuse this read. */
  events: CalendarEvent[];
  calendars: (CalendarSummary & { hidden: boolean })[];
  filters: CalendarFilters;
  bands: Record<string, WindowBand[]>;
  connection: ConnectionState;
  problem: string | null;
  settings: Settings;
}

function isMultiDay(start: DateTime, end: DateTime, allDay: boolean): boolean {
  return allDay ? end.diff(start, 'days').days > 1 : end.diff(start, 'hours').hours >= 24;
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

export async function loadCalendarView(view: CalendarView, anchor: string): Promise<CalendarData> {
  const [settings, filters, windows] = await Promise.all([getSettings(), getCalendarFilters(), listWindows()]);
  const zone = settings.timezone;
  const range = calendarRange(view, anchor, zone);
  const first = range.days[0];
  const last = range.days[range.days.length - 1];
  const afterLast = DateTime.fromISO(last, { zone }).plus({ days: 1 }).toISODate()!;

  const connection = connectionState();
  const [{ events, calendars, problem }, blocks] = await Promise.all([
    loadEvents(first, afterLast, zone, connection),
    blockRepo.listForRange(first, last),
  ]);

  // TimeBlock's own calendar is represented by its local blocks (which also
  // carry drafts), so its Google copies and its checkbox are left out.
  const own = settings.targetCalendarId;
  const shownCalendars = calendars.filter((c) => c.id !== own);
  const background = new Map(calendars.map((c) => [c.id, c.background]));

  const items: CalendarItem[] = [];

  for (const e of events) {
    if (e.blockId !== null || e.calendarId === own) continue;
    const start = DateTime.fromISO(e.start).setZone(zone);
    const end = DateTime.fromISO(e.end).setZone(zone);
    const multiDay = isMultiDay(start, end, e.allDay);
    const hideKey = eventKey(e);
    if (isHidden({ calendarId: e.calendarId, key: hideKey, isBlock: false, multiDay }, filters, view)) continue;
    const color = eventColor(e.colorId, background.get(e.calendarId));
    items.push({
      id: `${e.calendarId}:${e.id}`,
      kind: 'event',
      title: e.title,
      start,
      end,
      allDay: e.allDay,
      multiDay,
      color,
      textColor: textOn(color),
      declined: e.declined,
      draft: false,
      calendarId: e.calendarId,
      hideKey,
      planDate: null,
    });
  }

  for (const b of blocks) {
    if (isHidden({ calendarId: null, key: null, isBlock: true, multiDay: false }, filters, view)) break;
    const start = DateTime.fromISO(b.startsAt).setZone(zone);
    const end = DateTime.fromISO(b.endsAt).setZone(zone);
    const color = energyColor(b.segments[0]?.task.energy ?? 'deep');
    items.push({
      id: `block:${b.id}`,
      kind: 'block',
      title: b.segments.map((s) => s.task.title).join(' + ') || 'Focus block',
      start,
      end,
      allDay: false,
      multiDay: false,
      color,
      textColor: textOn(color),
      declined: false,
      draft: b.state === 'draft',
      calendarId: null,
      hideKey: null,
      planDate: b.date,
    });
  }

  items.sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const specs: WindowSpec[] = windows.map(toSpec);
  const bands: Record<string, WindowBand[]> = {};
  for (const day of range.days) {
    bands[day] = specs
      .filter((s) => windowOpensOn(s, day, zone))
      .map((s) => ({ name: s.name, ...windowInterval(day, s, zone) }));
  }

  return {
    view,
    range,
    zone,
    today: nowIn(zone).toISODate()!,
    now: nowIn(zone),
    hours: visibleHours(settings.calendarStart, settings.calendarEnd),
    items,
    events,
    calendars: shownCalendars.map((c) => ({ ...c, hidden: filters.hiddenCalendars.includes(c.id) })),
    filters,
    bands,
    connection,
    problem,
    settings,
  };
}
