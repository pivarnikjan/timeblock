import 'server-only';
import { withEnv } from '@/lib/env';
import { connectionState, type ConnectionState } from '@/lib/google/client';
import { readCredentials } from '@/lib/google/credentials';
import { expiryWarning } from '@/lib/google/grant';
import * as load from '@timeblock/core/calendar/load';
import type { CalendarView } from '@timeblock/core/calendar/views';

export { REVIEW_DAYS, type CalendarItem } from '@timeblock/core/calendar/load';

export interface CalendarData extends load.CalendarData {
  connection: ConnectionState;
  /** Google will probably end the sign-in soon (the Google Cloud app may still be in Testing). */
  expiryWarning: string | null;
  /** The item open in the side panel (`?item=`), if any. */
  selected: string | null;
}

export async function loadCalendarView(view: CalendarView, anchor: string, selected: string | null = null): Promise<CalendarData> {
  const data = await withEnv(load.loadCalendarView)(view, anchor);
  const connection = connectionState();
  const stored = connection.status === 'connected' ? readCredentials() : null;
  return { ...data, connection, expiryWarning: stored ? expiryWarning(stored) : null, selected };
}

/** Multi-day events from today on that still need your decision. */
export const loadMultiDayReviews = withEnv(load.loadMultiDayReviews);
