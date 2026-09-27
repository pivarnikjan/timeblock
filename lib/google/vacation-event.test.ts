import { describe, expect, it } from 'vitest';
import { busySpans } from '@/lib/calendar/busy';
import { VACATION_ID_KEY, vacationEventBody } from './vacation-event';

const TZ = 'Europe/Vienna';

describe('vacation in Google Calendar', () => {
  it('is an all-day event when it covers whole days', () => {
    // Fri 2 Oct 00:00 – Sun 4 Oct 00:00 in Vienna (CEST, UTC+2).
    const body = vacationEventBody(
      { id: 3, startsAt: '2026-10-01T22:00:00.000Z', endsAt: '2026-10-03T22:00:00.000Z', note: 'Chata s detickami' },
      TZ,
      ['Learning', 'Work'],
    );

    expect(body.summary).toBe('🏖 Vacation · Chata s detickami');
    expect(body.start).toEqual({ date: '2026-10-02' });
    expect(body.end).toEqual({ date: '2026-10-04' }); // Google's all-day end is exclusive
    expect(body.description).toContain('Unavailable for: Learning, Work.');
    expect(body.extendedProperties?.private?.[VACATION_ID_KEY]).toBe('3');
  });

  it('is a timed event when it starts or ends within a day', () => {
    const body = vacationEventBody({ id: 4, startsAt: '2026-10-01T22:00:00.000Z', endsAt: '2026-10-03T12:30:00.000Z', note: null }, TZ, []);

    expect(body.summary).toBe('🏖 Vacation');
    expect(body.start).toEqual({ dateTime: '2026-10-01T22:00:00.000Z', timeZone: TZ });
    expect(body.end).toEqual({ dateTime: '2026-10-03T12:30:00.000Z', timeZone: TZ });
  });

  it('never counts as busy — the vacation closes only the windows it names', () => {
    const copy = { calendarId: 'tb', seriesId: 'x', start: '2026-10-02T08:00:00Z', end: '2026-10-02T10:00:00Z', busy: true, blockId: null, vacationId: 3 };
    const meeting = { ...copy, seriesId: 'm', vacationId: null };

    expect(busySpans([copy, meeting])).toEqual([{ start: meeting.start, end: meeting.end }]);
  });
});
