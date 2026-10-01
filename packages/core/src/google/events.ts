import { DateTime } from 'luxon';
import { calendarColor } from '../calendar/colors';
import { VACATION_ID_KEY } from './vacation-event';

/**
 * Google Calendar's JSON, as far as TimeBlock reads and writes it. Kept here
 * rather than taken from `googleapis`, so the phone app — which talks to the
 * REST API with plain fetch — shares the parsing without that package.
 */
export interface GoogleEventTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

export interface GoogleEvent {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: GoogleEventTime | null;
  end?: GoogleEventTime | null;
  transparency?: string | null;
  colorId?: string | null;
  recurringEventId?: string | null;
  htmlLink?: string | null;
  attendees?: { self?: boolean | null; responseStatus?: string | null }[] | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
  /** A recurring series' rules (`RRULE:…`, `EXDATE:…`); on the series itself, not its occurrences. */
  recurrence?: string[] | null;
  /** An occurrence of a series: when it was due by the series' rule, before any change to it. */
  originalStartTime?: GoogleEventTime | null;
  location?: string | null;
  visibility?: string | null;
  reminders?: { useDefault?: boolean | null; overrides?: { method?: string | null; minutes?: number | null }[] | null } | null;
}

/** An event as TimeBlock writes it — what it sends to Google, not what it reads back. */
export interface GoogleEventBody {
  summary: string;
  description: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  transparency: 'opaque' | 'transparent';
  colorId: string;
  reminders: { useDefault: boolean; overrides: { method: string; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
}

export interface GoogleCalendarListEntry {
  id?: string | null;
  summary?: string | null;
  summaryOverride?: string | null;
  primary?: boolean | null;
  selected?: boolean | null;
  backgroundColor?: string | null;
  accessRole?: string | null;
}

/** Marks the events TimeBlock owns, so re-planning never touches a real meeting. */
export const BLOCK_ID_KEY = 'tbBlockId';

/** The colour TimeBlock gave a block's event, so a colour changed in Google afterwards reads as chosen by hand. */
export const BLOCK_COLOR_KEY = 'tbColorId';

export interface CalendarEvent {
  id: string;
  calendarId: string;
  /** The recurring series this is an instance of, else the event itself. */
  seriesId: string;
  title: string;
  /** UTC ISO instants. */
  start: string;
  end: string;
  allDay: boolean;
  /** False for events explicitly marked free, cancelled, or declined. */
  busy: boolean;
  declined: boolean;
  /** The event's own Google colour id, if it has one. */
  colorId: string | null;
  /** TimeBlock's blocks only: the colour id TimeBlock gave the event when committing it. */
  plannedColorId: string | null;
  /** Set when TimeBlock created this event. */
  blockId: number | null;
  /** Set when this event mirrors a TimeBlock vacation. */
  vacationId: number | null;
  /** One occurrence of a repeating event. */
  recurring: boolean;
  /** The event in Google Calendar's web app. */
  htmlLink: string | null;
}

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  /** Colour as Google Calendar's web app shows it. */
  color: string;
  /** The raw background the API reports (legacy palette), needed to colour its events. */
  background: string | null;
  /** The account may change and delete its events (owner or writer, not a subscribed or shared-read calendar). */
  writable: boolean;
}

/** The calendars ticked in Google Calendar's own list; the rest are left out. */
export function calendarSummaries(items: GoogleCalendarListEntry[]): CalendarSummary[] {
  return items
    .filter((item) => item.id && item.selected !== false)
    .map((item) => ({
      id: item.id!,
      summary: item.summaryOverride ?? item.summary ?? item.id!,
      primary: item.primary === true,
      color: calendarColor(item.backgroundColor),
      background: item.backgroundColor ?? null,
      writable: item.accessRole === 'owner' || item.accessRole === 'writer',
    }));
}

export function parseEvent(event: GoogleEvent, calendarId: string, zone: string): CalendarEvent | null {
  if (!event.id || event.status === 'cancelled') return null;

  const allDay = Boolean(event.start?.date);
  const startRaw = event.start?.dateTime ?? event.start?.date;
  const endRaw = event.end?.dateTime ?? event.end?.date;
  if (!startRaw || !endRaw) return null;

  const start = allDay ? DateTime.fromISO(startRaw, { zone }).startOf('day') : DateTime.fromISO(startRaw).setZone(zone);
  // Google's all-day end date is exclusive, so it already lands on midnight.
  const end = allDay ? DateTime.fromISO(endRaw, { zone }).startOf('day') : DateTime.fromISO(endRaw).setZone(zone);
  if (!start.isValid || !end.isValid) return null;

  const declined = event.attendees?.some((a) => a.self && a.responseStatus === 'declined') ?? false;
  const blockId = Number(event.extendedProperties?.private?.[BLOCK_ID_KEY]);
  const vacationId = Number(event.extendedProperties?.private?.[VACATION_ID_KEY]);

  return {
    id: event.id,
    calendarId,
    seriesId: event.recurringEventId ?? event.id,
    title: event.summary ?? '(no title)',
    start: start.toUTC().toISO()!,
    end: end.toUTC().toISO()!,
    allDay,
    busy: event.transparency !== 'transparent' && !declined,
    declined,
    colorId: event.colorId ?? null,
    plannedColorId: event.extendedProperties?.private?.[BLOCK_COLOR_KEY] ?? null,
    blockId: Number.isFinite(blockId) && blockId > 0 ? blockId : null,
    vacationId: Number.isFinite(vacationId) && vacationId > 0 ? vacationId : null,
    recurring: Boolean(event.recurringEventId),
    htmlLink: event.htmlLink ?? null,
  };
}
