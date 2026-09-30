import 'server-only';
import { DateTime } from 'luxon';
import { calendarSummaries, parseEvent, type CalendarEvent, type CalendarSummary } from '@timeblock/core/google/events';
import { calendarApi } from './client';

export { BLOCK_COLOR_KEY, BLOCK_ID_KEY, type CalendarEvent, type CalendarSummary } from '@timeblock/core/google/events';

export async function listCalendars(): Promise<CalendarSummary[]> {
  const api = calendarApi();
  const { data } = await api.calendarList.list({ maxResults: 250, showHidden: false });
  return calendarSummaries(data.items ?? []);
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

export { busySpans } from '@timeblock/core/calendar/busy';

/**
 * Deletes one event from Google Calendar — for a repeating event, only this
 * occurrence. Google refuses it on a calendar the account cannot edit.
 */
export async function deleteCalendarEvent(calendarId: string, eventId: string): Promise<void> {
  await calendarApi().events.delete({ calendarId, eventId });
}
