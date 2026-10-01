import { DateTime } from 'luxon';
import { eventKey } from '../calendar/filters';
import type { Env } from '../env';
import { copyMarks } from '../store/event-marks';
import { getSettings, updateCalendarFilters } from '../store/settings';
import type { EventWrite } from './calendar-api';
import type { GoogleEvent, GoogleEventTime } from './events';
import { splitRecurrence } from './recurrence';

export type EventTimeScope = 'this' | 'following';

export interface EventTimeChange {
  calendarId: string;
  /** The occurrence (or the single event) being changed. */
  eventId: string;
  /** Its series; the same as `eventId` for an event that does not repeat. */
  seriesId: string;
  /** The new start and end, UTC ISO. */
  start: string;
  end: string;
  /** `this`: only this occurrence. `following`: this and every later repeat (earlier ones keep their time). */
  scope: EventTimeScope;
}

/** What a change did: the series that now holds the occurrence (a new one when the series was split). */
export interface EventTimeResult {
  seriesId: string;
  split: boolean;
}

/** Fields of a series a copy must not carry: Google's own bookkeeping, and what the copy sets itself. */
const NOT_COPIED = new Set([
  'id',
  'etag',
  'kind',
  'iCalUID',
  'htmlLink',
  'created',
  'updated',
  'sequence',
  'creator',
  'organizer',
  'recurringEventId',
  'originalStartTime',
  'start',
  'end',
  'recurrence',
  'hangoutLink',
  'conferenceData',
]);

const instant = (t: GoogleEventTime | null | undefined, zone: string) =>
  t?.dateTime ? DateTime.fromISO(t.dateTime) : DateTime.fromISO(t?.date ?? '', { zone });

/**
 * Moves a Google event to a new time. A repeating event changes either for
 * this occurrence only, or for this and every following repeat — Google
 * Calendar's "This and following events": the series ends just before this
 * occurrence, and a new series, a copy with the new time, carries on from it.
 * The new series keeps the old one's TimeBlock marks (category, placeholder…)
 * and, if it was hidden, stays hidden.
 *
 * The new series is created before the old one is shortened, so a refusal
 * halfway loses nothing: the copy is then removed again.
 */
export async function changeEventTime(env: Env, change: EventTimeChange): Promise<EventTimeResult> {
  const settings = await getSettings(env.db);
  if (change.calendarId === settings.targetCalendarId) throw new Error("TimeBlock's own events are moved as blocks or vacations.");
  const startsAt = DateTime.fromISO(change.start);
  const endsAt = DateTime.fromISO(change.end);
  if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) throw new Error('The event must end after it starts.');

  const api = env.google.calendar();
  const zone = settings.timezone;
  const time = (dt: DateTime, timeZone: string) => ({ dateTime: dt.setZone(timeZone).toISO({ suppressMilliseconds: true })!, timeZone });
  const recurring = change.seriesId !== change.eventId;

  if (!recurring || change.scope === 'this') {
    const event = await api.getEvent(change.calendarId, change.eventId);
    if (event.start?.date) throw new Error('All-day events are moved in Google Calendar.');
    const timeZone = event.start?.timeZone ?? zone;
    await api.patchEvent(change.calendarId, change.eventId, { start: time(startsAt, timeZone), end: time(endsAt, timeZone) });
    return { seriesId: change.seriesId, split: false };
  }

  const [series, occurrence] = await Promise.all([api.getEvent(change.calendarId, change.seriesId), api.getEvent(change.calendarId, change.eventId)]);
  if (series.start?.date) throw new Error('All-day events are moved in Google Calendar.');
  const timeZone = series.start?.timeZone ?? zone;
  const at = instant(occurrence.originalStartTime ?? occurrence.start, timeZone);

  // From the first occurrence on, "this and following" is the whole series: move the series itself.
  if (!series.recurrence?.length || at <= instant(series.start, timeZone)) {
    await api.patchEvent(change.calendarId, change.seriesId, { start: time(startsAt, timeZone), end: time(endsAt, timeZone) });
    return { seriesId: change.seriesId, split: false };
  }

  const counted = series.recurrence.some((l) => /^RRULE:.*\bCOUNT=/i.test(l));
  const before = counted ? await countBefore(env, change.calendarId, change.seriesId, at) : 0;
  const split = splitRecurrence(series.recurrence, at, false, timeZone, before);
  if (!split.after) {
    await api.patchEvent(change.calendarId, change.eventId, { start: time(startsAt, timeZone), end: time(endsAt, timeZone) });
    return { seriesId: change.seriesId, split: false };
  }

  const copy: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(series)) if (!NOT_COPIED.has(field) && value !== undefined) copy[field] = value;
  const created = await api.insertEvent(change.calendarId, {
    ...(copy as EventWrite),
    start: time(startsAt, timeZone),
    end: time(endsAt, timeZone),
    recurrence: split.after,
  });
  if (!created.id) throw new Error('Google did not return an id for the new series.');
  try {
    await api.patchEvent(change.calendarId, change.seriesId, { recurrence: split.before });
  } catch (error) {
    await api.deleteEvent(change.calendarId, created.id).catch(() => undefined);
    throw error;
  }

  // The new series is TimeBlock's same event: same marks, same hidden state.
  const oldKey = eventKey({ calendarId: change.calendarId, seriesId: change.seriesId });
  const newKey = eventKey({ calendarId: change.calendarId, seriesId: created.id });
  await copyMarks(env.db, oldKey, newKey, created.summary ?? series.summary ?? '');
  await updateCalendarFilters(env.db, (f) =>
    oldKey in f.hiddenEvents ? { ...f, hiddenEvents: { ...f.hiddenEvents, [newKey]: f.hiddenEvents[oldKey] } } : f,
  );
  return { seriesId: created.id, split: true };
}

/** How many occurrences of a series start before `at`. */
async function countBefore(env: Env, calendarId: string, seriesId: string, at: DateTime): Promise<number> {
  const api = env.google.calendar();
  let count = 0;
  let pageToken: string | undefined;
  do {
    const page = await api.listInstances(calendarId, seriesId, { timeMax: at.toUTC().toISO()!, pageToken });
    count += page.items.filter((i: GoogleEvent) => i.status !== 'cancelled').length;
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return count;
}
