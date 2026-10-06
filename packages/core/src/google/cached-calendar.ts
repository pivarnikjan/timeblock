import type { CalendarApi } from './calendar-api';

/**
 * What a cached Calendar API remembers, kept by the app (one per signed-in
 * account) so it outlives the short-lived API objects made per request.
 */
export interface CalendarReadCache {
  entries: Map<string, { at: number; value: Promise<unknown> }>;
  /** When Google was last actually asked (ms since epoch); null before the first read. */
  readAt: number | null;
}

export const newCalendarReadCache = (): CalendarReadCache => ({ entries: new Map(), readAt: null });

/** Forgets everything read so far: the next read asks Google again. */
export function forgetCalendarReads(cache: CalendarReadCache): void {
  cache.entries.clear();
}

/**
 * The same Calendar API, with its list reads — the calendar list, the pages of
 * events, the "does this calendar exist" check — remembered for `ttlMs`. Looking
 * at the calendar again within that time (another week, an event's panel, the
 * page refreshing itself) then costs no request.
 *
 * Anything this API writes forgets everything first, so TimeBlock always sees
 * its own changes at once; a change made in Google itself shows up after at
 * most `ttlMs` (or straight away after `forgetCalendarReads`). Reads of a
 * single event are never remembered — they are made just before changing it.
 * A read that fails is not remembered either.
 */
export function cachedCalendar(api: CalendarApi, cache: CalendarReadCache, ttlMs: number, now: () => number = Date.now): CalendarApi {
  function remembered<T>(key: string, read: () => Promise<T>): Promise<T> {
    const hit = cache.entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = read();
    const entry = { at: now(), value };
    cache.entries.set(key, entry);
    cache.readAt = entry.at;
    // Not remembered when it fails — unless a newer read has taken its place meanwhile.
    value.catch(() => {
      if (cache.entries.get(key) === entry) cache.entries.delete(key);
    });
    return value;
  }
  function writing<A extends unknown[], R>(write: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return async (...args) => {
      forgetCalendarReads(cache);
      try {
        return await write(...args);
      } finally {
        // Also what was read while the write was under way.
        forgetCalendarReads(cache);
      }
    };
  }

  return {
    listCalendars: (options) => remembered(`calendars|${options?.showHidden ? 'all' : 'selected'}`, () => api.listCalendars(options)),
    getCalendar: (calendarId) => remembered(`calendar|${calendarId}`, () => api.getCalendar(calendarId)),
    listEvents: (calendarId, query) =>
      remembered(`events|${calendarId}|${query.timeMin}|${query.timeMax}|${query.orderBy ?? ''}|${query.pageToken ?? ''}`, () =>
        api.listEvents(calendarId, query),
      ),
    getEvent: (calendarId, eventId) => api.getEvent(calendarId, eventId),
    listInstances: (calendarId, seriesId, query) => api.listInstances(calendarId, seriesId, query),
    insertCalendar: writing((body) => api.insertCalendar(body)),
    insertEvent: writing((calendarId, body) => api.insertEvent(calendarId, body)),
    patchEvent: writing((calendarId, eventId, body) => api.patchEvent(calendarId, eventId, body)),
    updateEvent: writing((calendarId, eventId, body) => api.updateEvent(calendarId, eventId, body)),
    deleteEvent: writing((calendarId, eventId) => api.deleteEvent(calendarId, eventId)),
  };
}
