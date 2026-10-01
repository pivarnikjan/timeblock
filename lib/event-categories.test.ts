import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eventKey } from '@timeblock/core/calendar/filters';
import type { Env } from '@timeblock/core/env';
import { FakeCalendar } from '@timeblock/core/google/fake-calendar';
import { syncCategoryColors } from '@timeblock/core/google/category-colors';
import type { GoogleEvent } from '@timeblock/core/google/events';
import { chooseEventCategory, editEventTime, saveCategory } from '@timeblock/core/operations/events';
import { listMarks } from '@timeblock/core/store/event-marks';
import { getCalendarFilters, getSettings, updateCalendarFilters, updateSettings } from '@timeblock/core/store/settings';
import { testDb } from './db/testing';

/**
 * Event categories and moving events, over a real database with Google faked:
 * a weekly kindergarten run ("Po Eminku do škôlky"), Monday and Wednesday 07:30.
 */
async function setup() {
  const { db } = testDb();
  const google = new FakeCalendar();
  const env: Env = { db, google: { status: () => 'connected', calendar: () => google } };
  const zone = (await getSettings(db)).timezone;

  // The next three Mondays at 07:30, as one weekly series and its occurrences.
  const first = DateTime.now().setZone(zone).plus({ weeks: 1 }).set({ weekday: 1, hour: 7, minute: 30, second: 0, millisecond: 0 });
  const at = (dt: DateTime) => ({ dateTime: dt.toISO({ suppressMilliseconds: true })!, timeZone: zone });
  google.addEvent('primary', {
    id: 'kg',
    summary: 'Po Eminku do škôlky',
    start: at(first),
    end: at(first.plus({ minutes: 30 })),
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    location: 'Škôlka',
  });
  const occurrences = [0, 1, 2].map((w) => {
    const start = first.plus({ weeks: w });
    const id = `kg_${start.toFormat('yyyyMMdd')}`;
    google.addEvent('primary', {
      id,
      summary: 'Po Eminku do škôlky',
      recurringEventId: 'kg',
      originalStartTime: at(start),
      start: at(start),
      end: at(start.plus({ minutes: 30 })),
    });
    return id;
  });
  return { db, google, env, zone, first, occurrences };
}

const event = (google: FakeCalendar, id: string) => google.events.get('primary')!.get(id) as GoogleEvent;

describe('event categories in Google', () => {
  it('colours a matching series in Google once, and leaves a colour chosen there afterwards', async () => {
    const { google, env } = await setup();
    const saved = await saveCategory(env, { name: 'Traveling', color: '#616161', keywords: 'skolky' });
    expect(saved).toMatchObject({ ok: true, warning: null });

    // The series itself took Graphite (nearest to the grey), stamped, and its occurrences follow.
    expect(event(google, 'kg').colorId).toBe('8');
    expect(event(google, 'kg').extendedProperties?.private?.tbColorId).toBe('8');
    expect(await syncCategoryColors(env)).toEqual({ recoloured: 0, chosenByHand: 0, cleared: 0, failed: 0 });

    // Someone picks Tomato in Google: TimeBlock keeps it.
    await google.patchEvent('primary', 'kg', { colorId: '11' });
    expect(await syncCategoryColors(env)).toMatchObject({ recoloured: 0, chosenByHand: 1 });
    expect(event(google, 'kg').colorId).toBe('11');
  });

  it('takes the colour back off when the event is said to have no category', async () => {
    const { db, google, env } = await setup();
    await saveCategory(env, { name: 'Traveling', color: '#616161', keywords: 'skolky' });
    const key = eventKey({ calendarId: 'primary', seriesId: 'kg' });

    expect(await chooseEventCategory(env, key, 'Po Eminku do škôlky', 'none')).toBeNull();
    expect(event(google, 'kg').colorId).toBeNull();
    expect(event(google, 'kg').extendedProperties?.private?.tbColorId).toBeUndefined();
    expect((await listMarks(db)).get(key)?.categoryId).toBe(0);
  });
});

describe('moving a Google event', () => {
  it('moves only this occurrence', async () => {
    const { google, env, first, occurrences } = await setup();
    await editEventTime(env, {
      calendarId: 'primary',
      eventId: occurrences[1],
      seriesId: 'kg',
      date: first.plus({ weeks: 1 }).toISODate()!,
      startTime: '08:00',
      endTime: '08:45',
      scope: 'this',
    });
    expect(event(google, occurrences[1]).start?.dateTime).toContain('T08:00:00');
    expect(event(google, occurrences[1]).end?.dateTime).toContain('T08:45:00');
    expect(event(google, 'kg').recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('splits the series for this and following, keeping marks and hidden state', async () => {
    const { db, google, env, first, occurrences } = await setup();
    const oldKey = eventKey({ calendarId: 'primary', seriesId: 'kg' });
    const traveling = await saveCategory(env, { name: 'Traveling', color: '#616161', keywords: '' });
    await chooseEventCategory(env, oldKey, 'Po Eminku do škôlky', (traveling as { category: { id: number } }).category.id);
    await updateCalendarFilters(db, (f) => ({ ...f, hiddenEvents: { [oldKey]: 'Po Eminku do škôlky' } }));

    const second = first.plus({ weeks: 1 });
    const result = await editEventTime(env, {
      calendarId: 'primary',
      eventId: occurrences[1],
      seriesId: 'kg',
      date: second.toISODate()!,
      startTime: '08:00',
      endTime: '08:30',
      scope: 'following',
    });

    expect(result.split).toBe(true);
    // The old series now ends just before the second Monday.
    const until = second.toUTC().minus({ seconds: 1 }).toFormat("yyyyMMdd'T'HHmmss'Z'");
    expect(event(google, 'kg').recurrence).toEqual([`RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=${until}`]);
    // The new one carries on at 08:00, a copy of the old (its place included).
    const created = event(google, result.seriesId);
    expect(created.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
    expect(created.start?.dateTime).toContain(`${second.toISODate()}T08:00:00`);
    expect(created.location).toBe('Škôlka');
    // TimeBlock's marks and the hidden state moved along.
    const newKey = eventKey({ calendarId: 'primary', seriesId: result.seriesId });
    expect((await listMarks(db)).get(newKey)?.categoryId).toBe((traveling as { category: { id: number } }).category.id);
    expect(Object.keys((await getCalendarFilters(db)).hiddenEvents)).toEqual([oldKey, newKey]);
  });

  it('moves the whole series when changed from its first occurrence', async () => {
    const { google, env, first, occurrences } = await setup();
    const result = await editEventTime(env, {
      calendarId: 'primary',
      eventId: occurrences[0],
      seriesId: 'kg',
      date: first.toISODate()!,
      startTime: '07:45',
      endTime: '08:15',
      scope: 'following',
    });
    expect(result).toEqual({ seriesId: 'kg', split: false });
    expect(event(google, 'kg').start?.dateTime).toContain('T07:45:00');
    expect(event(google, 'kg').recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('removes the new series again when Google refuses to shorten the old one', async () => {
    const { google, env, first, occurrences } = await setup();
    const before = google.events.get('primary')!.size;
    const patch = google.patchEvent.bind(google);
    google.patchEvent = async (calendarId, eventId, body) => {
      if (eventId === 'kg' && body.recurrence) throw Object.assign(new Error('Forbidden'), { status: 403 });
      return patch(calendarId, eventId, body);
    };
    await expect(
      editEventTime(env, {
        calendarId: 'primary',
        eventId: occurrences[2],
        seriesId: 'kg',
        date: first.plus({ weeks: 2 }).toISODate()!,
        startTime: '09:00',
        endTime: '09:30',
        scope: 'following',
      }),
    ).rejects.toThrow('Forbidden');
    expect(google.events.get('primary')!.size).toBe(before);
    expect(event(google, 'kg').recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it("refuses TimeBlock's own calendar: its events are moved as blocks or vacations", async () => {
    const { env, db } = await setup();
    await updateSettings(db, { targetCalendarId: 'timeblock-focus' });
    await expect(
      editEventTime(env, { calendarId: 'timeblock-focus', eventId: 'x', seriesId: 'x', date: '2026-10-05', startTime: '09:00', endTime: '10:00', scope: 'this' }),
    ).rejects.toThrow("TimeBlock's own events are moved as blocks or vacations.");
  });

  it('ends the next day when the end is at or before the start', async () => {
    const { google, env, first, occurrences } = await setup();
    await editEventTime(env, { calendarId: 'primary', eventId: occurrences[0], seriesId: 'kg', date: first.toISODate()!, startTime: '23:30', endTime: '00:15', scope: 'this' });
    expect(event(google, occurrences[0]).end?.dateTime).toContain(`${first.plus({ days: 1 }).toISODate()}T00:15:00`);
  });
});
