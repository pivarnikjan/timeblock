import 'server-only';
import { DateTime } from 'luxon';
import type { Settings } from '@/lib/db/schema';
import { listCalendars, listRangeEvents, type CalendarEvent, type CalendarSummary } from '@/lib/google/calendar';
import { connectionState, isMissingScopeError, MISSING_SCOPE_HELP, type ConnectionState } from '@/lib/google/client';
import * as blockRepo from '@/lib/repo/blocks';
import { listMarks } from '@/lib/repo/event-marks';
import { listVacations, vacationsBetween, vacationsBySourceEvent } from '@/lib/repo/vacations';
import { closedWindows, formInputs, vacationClosures } from '@/lib/vacation';
import { getSettings, getCalendarFilters } from '@/lib/repo/settings';
import { listWindows, toSpec } from '@/lib/repo/windows';
import { nowIn } from '@/lib/time/periods';
import { windowBands, windowLegend, type WindowBand, type WindowLegend } from './bands';
import { blockColor, eventColor, textOn, windowColors } from './colors';
import { eventKey, isHidden, occurrenceKey, type CalendarFilters } from './filters';
import { isMultiDay, multiDayReviews, type MultiDayReview } from './multi-day';
import { calendarRange, visibleHours, type CalendarRange, type CalendarView } from './views';

/** One thing drawn on the calendar — a Google event or a TimeBlock block. */
export interface CalendarItem {
  id: string;
  kind: 'event' | 'block' | 'vacation';
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
  /** Events only: this occurrence's key, for turning it into a vacation. */
  occurrence: string | null;
  /** Events only: the vacation made from this occurrence, if any. */
  madeVacationId: number | null;
  /** Events only: said not to be a vacation (multi-day events are asked once). */
  notVacation: boolean;
  /** Events only: counts as busy in Google (not free, not declined). */
  busy: boolean;
  /** Vacations only: the exact span, the windows it closes, and its id. */
  vacation: {
    id: number;
    start: DateTime;
    end: DateTime;
    /** Names of the windows it closes, for reading. */
    windows: string[];
    /** Their ids (null = Anytime), for the edit form. */
    windowIds: (number | null)[];
    note: string | null;
    /** datetime-local values for the edit form. */
    from: string;
    until: string;
    /** Wanted in Google Calendar, and whether its copy exists there yet. */
    inGoogle: boolean;
    inGoogleNow: boolean;
  } | null;
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
  /** Keys of events that are not busy when planning: placeholders, and occurrences turned into vacations. */
  freeKeys: Set<string>;
  calendars: (CalendarSummary & { hidden: boolean })[];
  filters: CalendarFilters;
  bands: Record<string, WindowBand[]>;
  /** Every time window with its colour, for the legend. */
  windows: WindowLegend[];
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

  // TimeBlock's own calendar is represented by its local blocks (which also
  // carry drafts), so its Google copies and its checkbox are left out.
  const own = settings.targetCalendarId;
  const shownCalendars = calendars.filter((c) => c.id !== own);
  const calendarById = new Map(calendars.map((c) => [c.id, c]));

  const items: CalendarItem[] = [];
  // A committed block's Google copy: a colour chosen for it there wins over its window's.
  const blockEvents = new Map(events.filter((e) => e.blockId !== null).map((e) => [e.blockId!, e]));
  const colorOfWindow = windowColors(windows);

  for (const e of events) {
    // TimeBlock's own events (blocks, vacation copies) are drawn from local data instead.
    if (e.blockId !== null || e.vacationId !== null || e.calendarId === own) continue;
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
      occurrence: occurrenceKey(e),
      madeVacationId: converted.get(occurrenceKey(e))?.id ?? null,
      notVacation: mark?.notVacation ?? false,
      busy: e.busy,
      blockState: null,
      segments: [],
      vacation: null,
    });
  }

  for (const b of blocks) {
    if (isHidden({ calendarId: null, key: null, isBlock: true, multiDay: false }, filters, view)) break;
    const start = DateTime.fromISO(b.startsAt).setZone(zone);
    const end = DateTime.fromISO(b.endsAt).setZone(zone);
    const color = blockColor(
      b.windowId !== null ? colorOfWindow.get(b.windowId) : null,
      b.segments[0]?.task.energy ?? 'deep',
      blockEvents.get(b.id),
    );
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
      occurrence: null,
      madeVacationId: null,
      notVacation: false,
      busy: false,
      blockState: b.state === 'cancelled' ? 'done' : b.state,
      segments: b.segments.map((s) => ({ title: s.task.title, minutes: s.minutes, done: s.doneAt !== null })),
      vacation: null,
    });
  }

  const windowName = new Map<number | null, string>([...windows.map((w) => [w.id, w.name] as const), [null, 'Anytime']]);
  for (const v of away) {
    const start = DateTime.fromISO(v.startsAt).setZone(zone);
    const end = DateTime.fromISO(v.endsAt).setZone(zone);
    // Drawn as a bar over the whole days it touches; the exact times are in the panel.
    const barStart = start.startOf('day');
    const barEnd = end.minus({ milliseconds: 1 }).startOf('day').plus({ days: 1 });
    items.push({
      ...VACATION_BASE,
      id: `vacation:${v.id}`,
      title: `Vacation${v.note ? ` · ${v.note}` : ''}`,
      start: barStart,
      end: barEnd,
      multiDay: barEnd.diff(barStart, 'days').days > 1,
      vacation: {
        id: v.id,
        start,
        end,
        windows: closedWindows(v).map((id) => windowName.get(id) ?? 'a deleted window'),
        windowIds: closedWindows(v),
        note: v.note,
        ...formInputs(start, end),
        inGoogle: v.inGoogle,
        inGoogleNow: v.googleEventId !== null,
      },
    });
  }

  items.sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const specs = windows.map((w) => ({ ...toSpec(w), id: w.id, color: w.color }));
  const bands = windowBands(range.days, specs, zone, vacationClosures(away));

  return {
    view,
    range,
    zone,
    today: nowIn(zone).toISODate()!,
    now: nowIn(zone),
    hours: visibleHours(settings.calendarStart, settings.calendarEnd),
    items,
    events,
    freeKeys: new Set([...[...marks.values()].filter((m) => m.placeholder).map((m) => m.key), ...converted.keys()]),
    calendars: shownCalendars.map((c) => ({ ...c, hidden: filters.hiddenCalendars.includes(c.id) })),
    filters,
    bands,
    windows: windowLegend(specs),
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

const VACATION_COLOR = '#E53935'; // the red of the hatching drawn over the vacation on the grid

/** The fields every vacation bar shares. */
const VACATION_BASE = {
  kind: 'vacation',
  allDay: true,
  color: VACATION_COLOR,
  textColor: textOn(VACATION_COLOR),
  declined: false,
  draft: false,
  calendarId: null,
  hideKey: null,
  planDate: null,
  blockId: null,
  movable: false,
  pinned: false,
  eventId: null,
  calendarName: null,
  writable: false,
  recurring: false,
  htmlLink: null,
  important: false,
  placeholder: false,
  occurrence: null,
  madeVacationId: null,
  notVacation: false,
  busy: false,
  blockState: null,
  segments: [],
} as const satisfies Partial<CalendarItem>;

/** "Mon 12 Oct 00:00 – Fri 16 Oct 24:00 · Crete", readable in a list. */
export function vacationLabel(startsAt: string, endsAt: string, zone: string, note: string | null): string {
  const start = DateTime.fromISO(startsAt).setZone(zone);
  const end = DateTime.fromISO(endsAt).setZone(zone);
  const endText = end.equals(end.startOf('day'))
    ? `${end.minus({ days: 1 }).toFormat('ccc d LLL')} 24:00`
    : end.toFormat('ccc d LLL HH:mm');
  return `${start.toFormat('ccc d LLL HH:mm')} – ${endText}${note ? ` · ${note}` : ''}`;
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
