import 'server-only';
import type { Env, GoogleStatus, TimeblockDb } from '@timeblock/core/env';
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

/** What core's planner, stores and Google writes run against on the desktop. */
export function env(): Env {
  let api: CalendarApi | undefined;
  return { db: db(), google: { status: googleStatus, calendar: () => (api ??= calendarApi()) } };
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
