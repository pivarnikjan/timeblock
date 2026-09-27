import type { CalendarEvent } from '@/lib/google/calendar';
import type { BusySpan } from '@/lib/scheduler/day';
import { eventKey } from './filters';

/**
 * The spans the scheduler must plan around: real commitments only.
 * TimeBlock's own blocks are excluded so re-planning a day does not treat
 * yesterday's proposal as an immovable meeting, and so are events marked as
 * placeholders (`placeholders`, by event key) — time held that work may use.
 */
export function busySpans(
  events: Pick<CalendarEvent, 'calendarId' | 'seriesId' | 'start' | 'end' | 'busy' | 'blockId'>[],
  placeholders: ReadonlySet<string> = new Set(),
): BusySpan[] {
  return events
    .filter((event) => event.busy && event.blockId === null && !placeholders.has(eventKey(event)))
    .map((event) => ({ start: event.start, end: event.end }));
}
