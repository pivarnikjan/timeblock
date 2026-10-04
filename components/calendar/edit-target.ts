import type { CalendarItem } from '@/lib/calendar/load';

/**
 * What the calendar needs to change an item's time on the client: a Google
 * event in a calendar the account can edit, or a block with nothing ticked off
 * yet. Plain data, so it can cross into client components.
 */
export interface EditTarget {
  id: string;
  kind: 'event' | 'block';
  title: string;
  /** The saved start and end, ISO in the calendar's timezone. */
  start: string;
  end: string;
  zone: string;
  recurring: boolean;
  /** Saving reaches Google Calendar: always for an event, for a block once committed. */
  toGoogle: boolean;
  calendarId: string | null;
  eventId: string | null;
  seriesId: string | null;
  blockId: number | null;
}

/** The item as something whose time can be changed here, or null when it cannot be. */
export function editTarget(item: CalendarItem, zone: string): EditTarget | null {
  if (item.allDay || item.multiDay || !item.start.hasSame(item.end.minus({ milliseconds: 1 }), 'day')) return null;
  const base = {
    id: item.id,
    title: item.title,
    start: item.start.setZone(zone).toISO()!,
    end: item.end.setZone(zone).toISO()!,
    zone,
    recurring: item.recurring,
  };
  if (item.kind === 'block' && item.movable && item.blockId !== null) {
    return { ...base, kind: 'block', toGoogle: item.blockState === 'synced', calendarId: null, eventId: null, seriesId: null, blockId: item.blockId };
  }
  if (item.kind === 'event' && item.writable && item.calendarId && item.eventId && item.seriesId) {
    return { ...base, kind: 'event', toGoogle: true, calendarId: item.calendarId, eventId: item.eventId, seriesId: item.seriesId, blockId: null };
  }
  return null;
}
