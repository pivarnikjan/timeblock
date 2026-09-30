import 'server-only';
import { withEnv } from '@/lib/env';
import { connectionState, type ConnectionState } from '@/lib/google/client';
import * as load from '@timeblock/core/calendar/load';
import type { CalendarView } from '@timeblock/core/calendar/views';

export { REVIEW_DAYS, type CalendarItem } from '@timeblock/core/calendar/load';

export interface CalendarData extends load.CalendarData {
  connection: ConnectionState;
  /** The item open in the side panel (`?item=`), if any. */
  selected: string | null;
}

export async function loadCalendarView(view: CalendarView, anchor: string, selected: string | null = null): Promise<CalendarData> {
  const data = await withEnv(load.loadCalendarView)(view, anchor);
  return { ...data, connection: connectionState(), selected };
}

/** Multi-day events from today on that still need your decision. */
export const loadMultiDayReviews = withEnv(load.loadMultiDayReviews);
