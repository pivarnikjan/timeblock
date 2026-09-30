import 'server-only';
import { withEnv } from '@/lib/env';
import * as reads from '@timeblock/core/google/reads';

export { BLOCK_COLOR_KEY, BLOCK_ID_KEY, busySpans, type CalendarEvent, type CalendarSummary } from '@timeblock/core/google/reads';

export const listCalendars = withEnv(reads.listCalendars);
/** Every event touching the local dates `from` … `toExclusive`, across every selected calendar. */
export const listRangeEvents = withEnv(reads.listRangeEvents);
/** Every event touching `date` — what the day planner plans around. */
export const listDayEvents = withEnv(reads.listDayEvents);
/** Deletes one event (for a repeating event, only this occurrence). */
export const deleteCalendarEvent = withEnv(reads.deleteCalendarEvent);
