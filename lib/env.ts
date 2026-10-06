import 'server-only';
import type { Env, GoogleStatus, TimeblockDb } from '@timeblock/core/env';
import { cachedCalendar, forgetCalendarReads, newCalendarReadCache, type CalendarReadCache } from '@timeblock/core/google/cached-calendar';
import { googleCalendar, type CalendarApi } from '@timeblock/core/google/calendar-api';
import { db } from '@/lib/db/client';
import { authorizedClient, connectionState } from '@/lib/google/client';

/** The desktop's Google status in core's terms: not configured counts as not connected. */
export function googleStatus(): GoogleStatus {
  const { status } = connectionState();
  return status === 'connected' || status === 'missing-scope' ? status : 'not-connected';
}

/** The Calendar API over the stored grant. One OAuth client per API, so its access token is reused. */
function calendarApi(): CalendarApi {
  let client = authorizedClient();
  return googleCalendar(async (renew) => {
    if (renew) client = authorizedClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('Google did not hand out an access token — reconnect in Settings.');
    return token;
  });
}

/**
 * How long a read of Google Calendar is reused. The Calendar refreshes itself
 * and is looked at from many angles (weeks, panels); within this time none of
 * that asks Google again. A change made in Google shows up after at most this
 * long — or at once with the Calendar's Refresh button; TimeBlock's own writes
 * always show at once.
 */
export const GOOGLE_READS_FRESH_MS = 3 * 60 * 1000;

// On globalThis so it survives the module being reloaded in development.
const shared = globalThis as { __timeblockGoogleReads?: CalendarReadCache };
const googleReads = (): CalendarReadCache => (shared.__timeblockGoogleReads ??= newCalendarReadCache());

/** The next look at Google Calendar asks Google again: before planning, on "Refresh", when the account changes. */
export function forgetGoogleReads(): void {
  forgetCalendarReads(googleReads());
}

/** When Google Calendar was last actually read; null when it has not been yet. */
export function googleReadAt(): Date | null {
  const at = googleReads().readAt;
  return at === null ? null : new Date(at);
}

/** What core's planner, stores and Google writes run against on the desktop. */
export function env(): Env {
  let api: CalendarApi | undefined;
  return {
    db: db(),
    google: { status: googleStatus, calendar: () => (api ??= cachedCalendar(calendarApi(), googleReads(), GOOGLE_READS_FRESH_MS)) },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WithoutFirst<F> = F extends (first: any, ...args: infer A) => infer R ? (...args: A) => R : never;

/** A core store function with the desktop's database filled in. */
export function withDb<F extends (db: TimeblockDb, ...args: never[]) => unknown>(fn: F): WithoutFirst<F> {
  return ((...args: never[]) => fn(db(), ...args)) as WithoutFirst<F>;
}

/** A core function with the desktop's environment filled in. */
export function withEnv<F extends (env: Env, ...args: never[]) => unknown>(fn: F): WithoutFirst<F> {
  return ((...args: never[]) => fn(env(), ...args)) as WithoutFirst<F>;
}
