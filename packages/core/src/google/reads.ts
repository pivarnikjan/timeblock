import { DateTime } from 'luxon';
import type { Env } from '../env';
import { calendarSummaries, parseEvent, type CalendarEvent, type CalendarSummary } from './events';

export { BLOCK_COLOR_KEY, BLOCK_ID_KEY, type CalendarEvent, type CalendarSummary } from './events';
export { busySpans } from '../calendar/busy';

/** The calendars ticked in Google's own list — the ones the Calendar shows and planning reads. */
export async function listCalendars(env: Env): Promise<CalendarSummary[]> {
  return calendarSummaries(await env.google.calendar().listCalendars({ showHidden: false }));
}

/**
 * Every event touching the local dates `from` … `toExclusive`, across every
 * selected calendar (paged, so a busy month is not cut off at 250 events).
 *
 * `events.list` rather than `freebusy.query` because the calendar needs titles
 * and colours, and transparency/decline handling has to be visible.
 */
export async function listRangeEvents(
  env: Env,
  from: string,
  toExclusive: string,
  zone: string,
  calendars?: CalendarSummary[],
): Promise<CalendarEvent[]> {
  const api = env.google.calendar();
  const timeMin = DateTime.fromISO(from, { zone }).startOf('day').toUTC().toISO()!;
  const timeMax = DateTime.fromISO(toExclusive, { zone }).startOf('day').toUTC().toISO()!;

  const perCalendar = await Promise.all(
    (calendars ?? (await listCalendars(env))).map(async (cal) => {
      const events: CalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const page = await api.listEvents(cal.id, { timeMin, timeMax, orderBy: 'startTime', pageToken });
        for (const item of page.items) {
          const event = parseEvent(item, cal.id, zone);
          if (event) events.push(event);
        }
        pageToken = page.nextPageToken ?? undefined;
      } while (pageToken);
      return events;
    }),
  );

  return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
}

/** Every event touching `date` — what the day planner plans around. */
export async function listDayEvents(env: Env, date: string, zone: string): Promise<CalendarEvent[]> {
  const next = DateTime.fromISO(date, { zone }).plus({ days: 1 }).toISODate()!;
  return listRangeEvents(env, date, next, zone);
}

/**
 * Deletes one event from Google Calendar — for a repeating event, only this
 * occurrence. Google refuses it on a calendar the account cannot edit.
 */
export async function deleteCalendarEvent(env: Env, calendarId: string, eventId: string): Promise<void> {
  await env.google.calendar().deleteEvent(calendarId, eventId);
}
