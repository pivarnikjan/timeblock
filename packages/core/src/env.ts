import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './db/schema';
import type { CalendarApi } from './google/calendar-api';

/**
 * A Drizzle database over TimeBlock's schema — the desktop's (async, over
 * node:sqlite) or the phone's (sync, over expo-sqlite). Code taking one always
 * awaits its queries, which works for both.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TimeblockDb = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;

/**
 * Whether Google Calendar can be used: `missing-scope` means signed in with the
 * calendar box left unticked on Google's consent screen.
 */
export type GoogleStatus = 'connected' | 'missing-scope' | 'not-connected';

export interface GoogleAccess {
  status(): GoogleStatus;
  /** The Calendar API for the signed-in account. Only called when `status()` is `connected`. */
  calendar(): CalendarApi;
}

/**
 * What the planner, the stores and Google's writes run against. Each app builds
 * one: the desktop from its SQLite file and stored Google grant, the phone from
 * its database and Google sign-in.
 */
export interface Env {
  db: TimeblockDb;
  google: GoogleAccess;
}
