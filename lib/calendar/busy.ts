import type { CalendarEvent } from '@/lib/google/calendar';
import type { BusySpan } from '@/lib/scheduler/day';
import { eventKey } from './filters';

/**
 * The spans the scheduler must plan around: real commitments only.
 * TimeBlock's own blocks are excluded so re-planning a day does not treat
 * yesterday's proposal as an immovable meeting, and so are events marked as
 * placeholders (`placeholders`, by event key) — time held that work may use.
 * A vacation's own Google copy is left out too: the vacation itself closes the
 * windows it names, and must not block the ones it leaves open.
 */
export function busySpans(
  events: (Pick<CalendarEvent, 'calendarId' | 'seriesId' | 'start' | 'end' | 'busy' | 'blockId'> & { vacationId?: number | null })[],
  placeholders: ReadonlySet<string> = new Set(),
): BusySpan[] {
  return events
    .filter((event) => event.busy && event.blockId === null && !event.vacationId && !placeholders.has(eventKey(event)))
    .map((event) => ({ start: event.start, end: event.end }));
}
