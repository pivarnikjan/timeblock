import type { CalendarEvent } from '../google/events';
import type { BusySpan } from '../scheduler/day';
import { eventKey, occurrenceKey } from './filters';

/**
 * The spans the scheduler must plan around: real commitments only.
 * TimeBlock's own blocks are excluded so re-planning a day does not treat
 * yesterday's proposal as an immovable meeting. So are events in `free`:
 * placeholders, by series key (time held that work may use), and single
 * occurrences turned into a vacation, by occurrence key (the vacation then says
 * which windows close, and the rest of the time stays open).
 * A vacation's own Google copy is left out too: the vacation itself closes the
 * windows it names, and must not block the ones it leaves open.
 */
export function busySpans(
  events: (Pick<CalendarEvent, 'calendarId' | 'seriesId' | 'start' | 'end' | 'busy' | 'blockId'> & {
    id?: string;
    vacationId?: number | null;
  })[],
  free: ReadonlySet<string> = new Set(),
): BusySpan[] {
  return events
    .filter(
      (event) =>
        event.busy &&
        event.blockId === null &&
        !event.vacationId &&
        !free.has(eventKey(event)) &&
        !(event.id !== undefined && free.has(occurrenceKey({ calendarId: event.calendarId, id: event.id }))),
    )
    .map((event) => ({ start: event.start, end: event.end }));
}
