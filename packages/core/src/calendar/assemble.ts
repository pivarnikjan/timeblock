import { DateTime } from 'luxon';
import { isLocked, type BlockWithSegments } from '../blocks';
import type { EventCategory, EventMark, Settings, TimeWindow, Vacation } from '../db/schema';
import type { CalendarEvent, CalendarSummary } from '../google/events';
import { toSpec } from '../scheduler/day';
import { closedWindows, formInputs, vacationClosures } from '../vacation';
import { windowBands, windowLegend, type WindowBand, type WindowLegend } from './bands';
import { categorizedEventColor, categoryOf } from './categories';
import { blockColor, textOn, windowColors } from './colors';
import { eventKey, isHidden, occurrenceKey, type CalendarFilters } from './filters';
import { isMultiDay } from './multi-day';
import { visibleHours, type CalendarRange, type CalendarView } from './views';

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
  /** Events only: the repeating series it belongs to; its own id when it does not repeat. */
  seriesId: string | null;
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
  /** Events only: its category, and whether it was chosen by hand or came from a title rule. */
  category: { id: number; name: string; color: string } | null;
  categorySource: 'chosen' | 'rule' | null;
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
  segments: { id: number; title: string; minutes: number; done: boolean }[];
}

/** Everything a calendar view is drawn from, already read from storage and Google. */
export interface CalendarInput {
  range: CalendarRange;
  zone: string;
  now: DateTime;
  settings: Pick<Settings, 'targetCalendarId' | 'calendarStart' | 'calendarEnd'>;
  filters: CalendarFilters;
  windows: TimeWindow[];
  events: CalendarEvent[];
  calendars: CalendarSummary[];
  /** Blocks on the range's dates. */
  blocks: BlockWithSegments[];
  marks: Map<string, EventMark>;
  /** Vacations overlapping the range. */
  vacations: Vacation[];
  /** Vacations made from a Google event, by that occurrence's key. */
  converted: Map<string, Vacation>;
  /** Event categories; their colours colour the events in them. */
  categories?: EventCategory[];
}

/** A calendar view ready to draw — the same on the desktop and the phone. */
export interface CalendarLayout {
  view: CalendarView;
  range: CalendarRange;
  zone: string;
  today: string;
  now: DateTime;
  hours: { startMin: number; endMin: number };
  items: CalendarItem[];
  /** Keys of events that are not busy when planning: placeholders, and occurrences turned into vacations. */
  freeKeys: Set<string>;
  calendars: (CalendarSummary & { hidden: boolean })[];
  filters: CalendarFilters;
  bands: Record<string, WindowBand[]>;
  /** Every time window with its colour, for the legend. */
  windows: WindowLegend[];
}

export function assembleCalendar(input: CalendarInput): CalendarLayout {
  const { range, zone, settings, filters, windows, events, calendars, blocks, marks, converted } = input;
  const view = range.view;

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
    const { category, source } = categoryOf(e.title, mark, input.categories ?? []);
    const color = categorizedEventColor(e, category, calendar?.background);
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
      seriesId: e.seriesId,
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
      category: category && { id: category.id, name: category.name, color: category.color },
      categorySource: source,
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
      movable: b.state !== 'done' && !isLocked(b),
      pinned: b.pinned,
      eventId: null,
      seriesId: null,
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
      category: null,
      categorySource: null,
      blockState: b.state === 'cancelled' ? 'done' : b.state,
      segments: b.segments.map((s) => ({ id: s.id, title: s.task.title, minutes: s.minutes, done: s.doneAt !== null })),
      vacation: null,
    });
  }

  const windowName = new Map<number | null, string>([...windows.map((w) => [w.id, w.name] as const), [null, 'Anytime']]);
  for (const v of input.vacations) {
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
  const bands = windowBands(range.days, specs, zone, vacationClosures(input.vacations));

  return {
    view,
    range,
    zone,
    today: input.now.toISODate()!,
    now: input.now,
    hours: visibleHours(settings.calendarStart, settings.calendarEnd),
    items,
    freeKeys: new Set([...[...marks.values()].filter((m) => m.placeholder).map((m) => m.key), ...converted.keys()]),
    calendars: shownCalendars.map((c) => ({ ...c, hidden: filters.hiddenCalendars.includes(c.id) })),
    filters,
    bands,
    windows: windowLegend(specs),
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
  seriesId: null,
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
  category: null,
  categorySource: null,
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
