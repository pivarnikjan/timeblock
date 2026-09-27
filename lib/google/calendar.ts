import 'server-only';
import { DateTime } from 'luxon';
import type { calendar_v3 } from 'googleapis';
import { calendarColor } from '@/lib/calendar/colors';
import { calendarApi } from './client';
import type { BusySpan } from '@/lib/scheduler/day';

/** Marks the events TimeBlock owns, so re-planning never touches a real meeting. */
export const BLOCK_ID_KEY = 'tbBlockId';

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
  /** Set when TimeBlock created this event. */
  blockId: number | null;
}

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  /** Colour as Google Calendar's web app shows it. */
  color: string;
  /** The raw background the API reports (legacy palette), needed to colour its events. */
  background: string | null;
}

export async function listCalendars(): Promise<CalendarSummary[]> {
  const api = calendarApi();
  const { data } = await api.calendarList.list({ maxResults: 250, showHidden: false });
  return (data.items ?? [])
    .filter((item) => item.id && item.selected !== false)
    .map((item) => ({
      id: item.id!,
      summary: item.summaryOverride ?? item.summary ?? item.id!,
      primary: item.primary === true,
      color: calendarColor(item.backgroundColor),
      background: item.backgroundColor ?? null,
    }));
}

function parseEvent(event: calendar_v3.Schema$Event, calendarId: string, zone: string): CalendarEvent | null {
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
    blockId: Number.isFinite(blockId) && blockId > 0 ? blockId : null,
  };
}

/**
 * Every event touching the local dates `from` … `toExclusive`, across every
 * selected calendar (paged, so a busy month is not cut off at 250 events).
 *
 * `events.list` rather than `freebusy.query` because the calendar needs titles
 * and colours, and transparency/decline handling has to be visible.
 */
export async function listRangeEvents(
  from: string,
  toExclusive: string,
  zone: string,
  calendars?: CalendarSummary[],
): Promise<CalendarEvent[]> {
  const api = calendarApi();
  const timeMin = DateTime.fromISO(from, { zone }).startOf('day').toUTC().toISO()!;
  const timeMax = DateTime.fromISO(toExclusive, { zone }).startOf('day').toUTC().toISO()!;

  const perCalendar = await Promise.all(
    (calendars ?? (await listCalendars())).map(async (cal) => {
      const events: CalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const { data } = await api.events.list({
          calendarId: cal.id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          pageToken,
        });
        for (const item of data.items ?? []) {
          const event = parseEvent(item, cal.id, zone);
          if (event) events.push(event);
        }
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);
      return events;
    }),
  );

  return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
}

/** Every event touching `date` — what the day planner plans around. */
export async function listDayEvents(date: string, zone: string): Promise<CalendarEvent[]> {
  const next = DateTime.fromISO(date, { zone }).plus({ days: 1 }).toISODate()!;
  return listRangeEvents(date, next, zone);
}

/**
 * The spans the scheduler must plan around: real commitments only.
 * TimeBlock's own blocks are excluded so re-planning a day does not treat
 * yesterday's proposal as an immovable meeting.
 */
export function busySpans(events: CalendarEvent[]): BusySpan[] {
  return events
    .filter((event) => event.busy && event.blockId === null)
    .map((event) => ({ start: event.start, end: event.end }));
}
