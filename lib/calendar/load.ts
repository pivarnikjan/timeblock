import 'server-only';
import { DateTime } from 'luxon';
import type { Settings } from '@/lib/db/schema';
import { listCalendars, listRangeEvents, type CalendarEvent, type CalendarSummary } from '@/lib/google/calendar';
import { connectionState, isMissingScopeError, MISSING_SCOPE_HELP, type ConnectionState } from '@/lib/google/client';
import * as blockRepo from '@/lib/repo/blocks';
import { listMarks } from '@/lib/repo/event-marks';
import { getSettings, getCalendarFilters } from '@/lib/repo/settings';
import { listWindows, toSpec } from '@/lib/repo/windows';
import { nowIn } from '@/lib/time/periods';
import { windowBands, windowLegend, type WindowBand, type WindowLegend } from './bands';
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
  /** TimeBlock's block id (blocks only). */
  blockId: number | null;
  /** Can be dragged elsewhere: a block with nothing ticked off yet. */
  movable: boolean;
  /** Placed by hand; planning works around it. */
  pinned: boolean;
  /** Google's event id (events only), for deleting it. */
  eventId: string | null;
  /** The calendar it is in, as Google names it (events only). */
  calendarName: string | null;
  /** Its calendar can be edited, so the event can be deleted here. */
  writable: boolean;
  /** One occurrence of a repeating event. */
  recurring: boolean;
  htmlLink: string | null;
  /** Marked important: always in Month, marked ★. */
  important: boolean;
  /** Marked as a placeholder: planning may schedule work during it. */
  placeholder: boolean;
  /** Blocks only: draft / synced / done, and the tasks inside. */
  blockState: 'draft' | 'synced' | 'done' | null;
  segments: { title: string; minutes: number; done: boolean }[];
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
  /** Keys of events marked as placeholders — not busy when planning. */
  placeholders: Set<string>;
  calendars: (CalendarSummary & { hidden: boolean })[];
  filters: CalendarFilters;
  bands: Record<string, WindowBand[]>;
  /** Every time window with its colour, for the legend. */
  windows: WindowLegend[];
  connection: ConnectionState;
  problem: string | null;
  settings: Settings;
  /** The item open in the side panel (`?item=`), if any. */
  selected: string | null;
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

export async function loadCalendarView(view: CalendarView, anchor: string, selected: string | null = null): Promise<CalendarData> {
  const [settings, filters, windows] = await Promise.all([getSettings(), getCalendarFilters(), listWindows()]);
  const zone = settings.timezone;
  const range = calendarRange(view, anchor, zone);
  const first = range.days[0];
  const last = range.days[range.days.length - 1];
  const afterLast = DateTime.fromISO(last, { zone }).plus({ days: 1 }).toISODate()!;

  const connection = connectionState();
  const [{ events, calendars, problem }, blocks, marks] = await Promise.all([
    loadEvents(first, afterLast, zone, connection),
    blockRepo.listForRange(first, last),
    listMarks(),
  ]);

  // TimeBlock's own calendar is represented by its local blocks (which also
  // carry drafts), so its Google copies and its checkbox are left out.
  const own = settings.targetCalendarId;
  const shownCalendars = calendars.filter((c) => c.id !== own);
  const calendarById = new Map(calendars.map((c) => [c.id, c]));

  const items: CalendarItem[] = [];

  for (const e of events) {
    if (e.blockId !== null || e.calendarId === own) continue;
    const start = DateTime.fromISO(e.start).setZone(zone);
    const end = DateTime.fromISO(e.end).setZone(zone);
    const multiDay = isMultiDay(start, end, e.allDay);
    const hideKey = eventKey(e);
    const mark = marks.get(hideKey);
    const important = mark?.important ?? false;
    if (isHidden({ calendarId: e.calendarId, key: hideKey, isBlock: false, multiDay, important }, filters, view)) continue;
    const calendar = calendarById.get(e.calendarId);
    const color = eventColor(e.colorId, calendar?.background);
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
      blockId: null,
      movable: false,
      pinned: false,
      eventId: e.id,
      calendarName: calendar?.summary ?? null,
      writable: calendar?.writable ?? false,
      recurring: e.recurring,
      htmlLink: e.htmlLink,
      important,
      placeholder: mark?.placeholder ?? false,
      blockState: null,
      segments: [],
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
      blockId: b.id,
      movable: b.state !== 'done' && !blockRepo.isLocked(b),
      pinned: b.pinned,
      eventId: null,
      calendarName: null,
      writable: false,
      recurring: false,
      htmlLink: null,
      important: false,
      placeholder: false,
      blockState: b.state === 'cancelled' ? 'done' : b.state,
      segments: b.segments.map((s) => ({ title: s.task.title, minutes: s.minutes, done: s.doneAt !== null })),
    });
  }

  items.sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const specs = windows.map((w) => ({ ...toSpec(w), id: w.id, color: w.color }));
  const bands = windowBands(range.days, specs, zone);

  return {
    view,
    range,
    zone,
    today: nowIn(zone).toISODate()!,
    now: nowIn(zone),
    hours: visibleHours(settings.calendarStart, settings.calendarEnd),
    items,
    events,
    placeholders: new Set([...marks.values()].filter((m) => m.placeholder).map((m) => m.key)),
    calendars: shownCalendars.map((c) => ({ ...c, hidden: filters.hiddenCalendars.includes(c.id) })),
    filters,
    bands,
    windows: windowLegend(specs),
    connection,
    problem,
    settings,
    selected,
  };
}
