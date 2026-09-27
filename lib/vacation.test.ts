import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { windowBands } from '@/lib/calendar/bands';
import { overlaps } from '@/lib/calendar/overlap';
import { vacationPieces } from '@/lib/calendar/vacation-overlay';
import { closedWindows, formatWindows, formInputs, vacationClosures } from './vacation';

const TZ = 'Europe/Vienna';

describe('vacation', () => {
  it('stores the closed windows as ids, with `anytime` for work with no window', () => {
    expect(formatWindows([1, 2, null, 2])).toBe('1,2,anytime');
    expect(closedWindows({ windows: '1,2,anytime' })).toEqual([1, 2, null]);
    expect(closedWindows({ windows: '' })).toEqual([]);
    expect(closedWindows({ windows: '1,junk' })).toEqual([1]);
  });

  it('becomes one closure per closed window', () => {
    const v = { startsAt: '2026-10-11T22:00:00.000Z', endsAt: '2026-10-16T22:00:00.000Z', windows: '1,anytime' };

    expect(vacationClosures([v])).toEqual([
      { windowId: 1, start: v.startsAt, end: v.endsAt },
      { windowId: null, start: v.startsAt, end: v.endsAt },
    ]);
  });

  it('removes the closed part of a window from the calendar, and labels the first piece still shown', () => {
    const learning = { id: 1, name: 'Learning', start: '10:30', end: '14:00', weekdays: [1, 2, 3, 4, 5], color: null };
    const work = { id: 2, name: 'Work', start: '14:00', end: '17:30', weekdays: [1, 2, 3, 4, 5], color: null };
    // Away Monday until 12:00, Learning only.
    const closures = vacationClosures([{ startsAt: '2026-09-27T22:00:00.000Z', endsAt: '2026-09-28T10:00:00.000Z', windows: '1' }]);

    const bands = windowBands(['2026-09-28', '2026-09-29'], [learning, work], TZ, closures);
    const monday = bands['2026-09-28'].map((b) => `${b.name} ${b.start.toFormat('HH:mm')}–${b.end.toFormat('HH:mm')}${b.labelled ? ' *' : ''}`);

    expect(monday).toEqual(['Learning 12:00–14:00 *', 'Work 14:00–17:30 *']);
    expect(bands['2026-09-29'].map((b) => b.labelled)).toEqual([false, false]);
  });

  it('draws nothing for a window closed all day', () => {
    const learning = { id: 1, name: 'Learning', start: '10:30', end: '14:00', weekdays: [1, 2, 3, 4, 5], color: null };
    const closures = vacationClosures([{ startsAt: '2026-09-27T22:00:00.000Z', endsAt: '2026-09-28T22:00:00.000Z', windows: '1' }]);

    expect(windowBands(['2026-09-28'], [learning], TZ, closures)['2026-09-28']).toEqual([]);
  });
});

describe('vacation on the calendar', () => {
  const hours = { startMin: 5 * 60, endMin: 24 * 60 };

  it('hatches each day it covers, clipped to the visible hours, labelling the tallest piece', () => {
    // Friday 00:00 to Saturday 14:30, as in the drawing.
    const v = { id: 7, start: DateTime.fromISO('2026-10-02T00:00', { zone: TZ }), end: DateTime.fromISO('2026-10-03T14:30', { zone: TZ }) };
    const pieces = vacationPieces([v], ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], TZ, hours);

    expect(pieces['2026-10-01']).toEqual([]);
    expect(pieces['2026-10-02']).toEqual([{ id: 7, top: 0, length: 19 * 60, labelled: true }]);
    expect(pieces['2026-10-03']).toEqual([{ id: 7, top: 0, length: 9.5 * 60, labelled: false }]);
    expect(pieces['2026-10-04']).toEqual([]);
  });

  it('shows the form an end at midnight as 23:59 of the last day, as it was entered', () => {
    const start = DateTime.fromISO('2026-10-02T00:00', { zone: TZ });
    expect(formInputs(start, DateTime.fromISO('2026-10-04T00:00', { zone: TZ }))).toEqual({ from: '2026-10-02T00:00', until: '2026-10-03T23:59' });
    expect(formInputs(start, DateTime.fromISO('2026-10-03T14:30', { zone: TZ })).until).toBe('2026-10-03T14:30');
  });

  it('finds what overlaps the vacation, and not what only touches its edges', () => {
    const vStart = '2026-10-02T10:00:00Z';
    const vEnd = '2026-10-03T12:30:00Z';
    expect(overlaps('2026-10-02T09:00:00Z', '2026-10-02T11:00:00Z', vStart, vEnd)).toBe(true);
    expect(overlaps('2026-10-02T09:00:00Z', '2026-10-02T10:00:00Z', vStart, vEnd)).toBe(false);
    expect(overlaps('2026-10-03T12:30:00Z', '2026-10-03T13:00:00Z', vStart, vEnd)).toBe(false);
    // Offsets are compared as instants: 14:00 in Vienna is 12:00Z, inside.
    expect(overlaps('2026-10-03T14:00:00+02:00', '2026-10-03T15:00:00+02:00', vStart, vEnd)).toBe(true);
  });
});
