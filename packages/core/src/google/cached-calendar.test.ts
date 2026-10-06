import { describe, expect, it } from 'vitest';
import { cachedCalendar, forgetCalendarReads, newCalendarReadCache } from './cached-calendar';
import type { CalendarApi } from './calendar-api';
import { FakeCalendar } from './fake-calendar';

const WEEK = { timeMin: '2030-03-04T00:00:00Z', timeMax: '2030-03-11T00:00:00Z' };
const TTL = 3 * 60_000;

/** A fake Google that counts what it is asked, behind a cache with a clock the test moves. */
function setup() {
  const google = new FakeCalendar();
  const asked: string[] = [];
  const counting = new Proxy(google, {
    get(target, name: string) {
      const value = target[name as keyof FakeCalendar];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        asked.push(name);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as unknown as CalendarApi;
  const clock = { now: 1_000_000 };
  const cache = newCalendarReadCache();
  const api = cachedCalendar(counting, cache, TTL, () => clock.now);
  const count = (name: string) => asked.filter((n) => n === name).length;
  return { google, api, cache, clock, count };
}

const meeting = (title: string) => ({ summary: title, start: { dateTime: '2030-03-05T09:00:00Z' }, end: { dateTime: '2030-03-05T10:00:00Z' } });

describe('cached Google Calendar reads', () => {
  it('asks Google once for the same read within the time it stays fresh, and again after', async () => {
    const { google, api, cache, clock, count } = setup();
    google.addEvent('primary', meeting('Standup'));

    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(1);
    await api.listEvents('primary', WEEK);
    await api.listCalendars();
    await api.listCalendars();
    expect(count('listEvents')).toBe(1);
    expect(count('listCalendars')).toBe(1);
    expect(cache.readAt).toBe(1_000_000);

    // Another week, or the hidden calendars too, is another question.
    await api.listEvents('primary', { ...WEEK, timeMax: '2030-03-18T00:00:00Z' });
    await api.listCalendars({ showHidden: true });
    expect(count('listEvents')).toBe(2);
    expect(count('listCalendars')).toBe(2);

    // A meeting added in Google is not seen until the read has gone stale.
    google.addEvent('primary', meeting('New in Google'));
    clock.now += TTL - 1;
    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(1);
    clock.now += 1;
    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(2);
    expect(cache.readAt).toBe(clock.now);
  });

  it('sees its own writes at once, and anything else on request', async () => {
    const { google, api, count } = setup();
    await api.listEvents('primary', WEEK);

    const created = await api.insertEvent('primary', meeting('Focus block'));
    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(1);
    await api.patchEvent('primary', created.id!, { summary: 'Renamed' });
    expect((await api.listEvents('primary', WEEK)).items[0].summary).toBe('Renamed');
    await api.deleteEvent('primary', created.id!);
    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(0);
    expect(count('listEvents')).toBe(4);

    google.addEvent('primary', meeting('New in Google'));
    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(0);
  });

  it('reads again after being told to forget', async () => {
    const { google, api, cache } = setup();
    await api.listEvents('primary', WEEK);
    google.addEvent('primary', meeting('New in Google'));
    forgetCalendarReads(cache);
    expect((await api.listEvents('primary', WEEK)).items).toHaveLength(1);
  });

  it('does not remember a read that failed, and never remembers a single event', async () => {
    const { google, api, count } = setup();
    await expect(api.listEvents('gone', WEEK)).rejects.toThrow();
    google.addCalendar({ id: 'gone', summary: 'Back again', selected: true });
    expect((await api.listEvents('gone', WEEK)).items).toHaveLength(0);

    const id = google.addEvent('primary', meeting('Standup'));
    await api.getEvent('primary', id);
    await api.getEvent('primary', id);
    expect(count('getEvent')).toBe(2);
  });

  it('shares one request between callers asking at the same moment', async () => {
    const { api, count } = setup();
    await Promise.all([api.listEvents('primary', WEEK), api.listEvents('primary', WEEK), api.listEvents('primary', WEEK)]);
    expect(count('listEvents')).toBe(1);
  });
});
