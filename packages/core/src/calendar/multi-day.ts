import { DateTime } from 'luxon';
import type { CalendarEvent } from '../google/events';
import { eventKey, occurrenceKey } from './filters';

/** Spans more than one day: all-day over several dates, or timed and 24h+. */
export function isMultiDay(start: DateTime, end: DateTime, allDay: boolean): boolean {
  return allDay ? end.diff(start, 'days').days > 1 : end.diff(start, 'hours').hours >= 24;
}

/** What TimeBlock knows about a multi-day event from its marks. */
export interface MultiDayMark {
  placeholder: boolean;
  notVacation: boolean;
}

/** The part of a vacation that ties it to the Google event it was made from. */
export interface SourcedVacation {
  id: number;
  startsAt: string;
  endsAt: string;
  sourceEvent: string | null;
}

export interface MultiDayReview {
  /**
   * `undecided`: nobody has said whether it is a vacation yet.
   * `moved`: it was turned into a vacation, and has since moved in Google.
   */
  kind: 'undecided' | 'moved';
  /** Series key (marks) and occurrence key (vacations). */
  key: string;
  occurrence: string;
  calendarId: string;
  eventId: string;
  title: string;
  /** UTC ISO instants of the (first) occurrence. */
  start: string;
  end: string;
  allDay: boolean;
  /** Undecided repeating events: how many repeats are in range (one decision covers them). */
  repeats: number;
  /** `moved` only: the vacation made from it. */
  vacation: { id: number; startsAt: string; endsAt: string } | null;
}

const ms = (iso: string) => DateTime.fromISO(iso).toMillis();

/** "Fri 9 Oct – Sun 11 Oct" for all-day spans, "Fri 9 Oct 10:00 – Sun 11 Oct 11:00" for timed ones. */
export function spanLabel(start: string, end: string, allDay: boolean, zone: string): string {
  const s = DateTime.fromISO(start).setZone(zone);
  const e = DateTime.fromISO(end).setZone(zone);
  if (allDay) return `${s.toFormat('ccc d LLL')} – ${e.minus({ days: 1 }).toFormat('ccc d LLL')}`;
  return `${s.toFormat('ccc d LLL HH:mm')} – ${e.toFormat('ccc d LLL HH:mm')}`;
}

/**
 * Multi-day events that need your decision, earliest first.
 *
 * A multi-day event created in Google says nothing about which kinds of work it
 * stops: a busy one blocks every window, a free one (all-day events usually
 * are) blocks none — so a week in Crete entered in Google would be planned full
 * of work. Each one is therefore asked about once: *is it a vacation?*
 *
 * Decided, and not listed: turned into a vacation (and still at the same time),
 * said not to be a vacation, marked a placeholder, or already covered by a
 * vacation set in TimeBlock. TimeBlock's own events, declined and finished ones
 * are never listed. A repeating event is listed once, since the answer is given
 * for the whole series; a vacation is made for one occurrence.
 */
export function multiDayReviews(
  events: CalendarEvent[],
  {
    marks,
    vacations,
    ownCalendarId,
    now,
    zone,
  }: {
    marks: ReadonlyMap<string, MultiDayMark>;
    vacations: SourcedVacation[];
    ownCalendarId: string | null;
    /** UTC ISO; events over by then are not asked about. */
    now: string;
    zone: string;
  },
): MultiDayReview[] {
  const bySource = new Map(vacations.filter((v) => v.sourceEvent).map((v) => [v.sourceEvent!, v]));
  const undecided = new Map<string, MultiDayReview>();
  const out: MultiDayReview[] = [];

  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    if (e.blockId !== null || e.vacationId !== null || e.calendarId === ownCalendarId || e.declined) continue;
    if (ms(e.end) <= ms(now)) continue;
    if (!isMultiDay(DateTime.fromISO(e.start, { zone }), DateTime.fromISO(e.end, { zone }), e.allDay)) continue;

    const key = eventKey(e);
    const occurrence = occurrenceKey(e);
    const base = {
      key,
      occurrence,
      calendarId: e.calendarId,
      eventId: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      repeats: 1,
    };

    const made = bySource.get(occurrence);
    if (made) {
      if (ms(made.startsAt) !== ms(e.start) || ms(made.endsAt) !== ms(e.end)) {
        out.push({ ...base, kind: 'moved', vacation: { id: made.id, startsAt: made.startsAt, endsAt: made.endsAt } });
      }
      continue;
    }

    const mark = marks.get(key);
    if (mark?.placeholder || mark?.notVacation) continue;
    if (vacations.some((v) => ms(v.startsAt) <= ms(e.start) && ms(v.endsAt) >= ms(e.end))) continue;

    const seen = undecided.get(key);
    if (seen) {
      seen.repeats += 1;
      continue;
    }
    const review: MultiDayReview = { ...base, kind: 'undecided', vacation: null };
    undecided.set(key, review);
    out.push(review);
  }
  return out;
}
