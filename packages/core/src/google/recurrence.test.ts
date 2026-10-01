import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { splitRecurrence } from './recurrence';

const zone = 'Europe/Vienna';
// Monday 12 Oct 2026, 07:30 in Vienna (05:30 UTC): the first occurrence of the new series.
const at = DateTime.fromISO('2026-10-12T07:30', { zone });

describe('splitRecurrence (this and following)', () => {
  it('ends the series just before the split and carries the rule on', () => {
    const { before, after } = splitRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'], at, false, zone, 0);
    expect(before).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261012T052959Z']);
    expect(after).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE']);
  });

  it('replaces an UNTIL on the old series and keeps it on the new one', () => {
    const { before, after } = splitRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261231T225959Z'], at, false, zone, 0);
    expect(before).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261012T052959Z']);
    expect(after).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261231T225959Z']);
  });

  it('turns a COUNT into an UNTIL before, and what is left of it after', () => {
    expect(splitRecurrence(['RRULE:FREQ=DAILY;COUNT=10'], at, false, zone, 4)).toEqual({
      before: ['RRULE:FREQ=DAILY;UNTIL=20261012T052959Z'],
      after: ['RRULE:FREQ=DAILY;COUNT=6'],
    });
    expect(splitRecurrence(['RRULE:FREQ=DAILY;COUNT=4'], at, false, zone, 4).after).toBeNull();
  });

  it('gives each part the exception dates on its side', () => {
    const { before, after } = splitRecurrence(
      ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=Europe/Vienna:20261005T073000,20261019T073000'],
      at,
      false,
      zone,
      0,
    );
    expect(before).toContain('EXDATE;TZID=Europe/Vienna:20261005T073000');
    expect(after).toContain('EXDATE;TZID=Europe/Vienna:20261019T073000');
  });

  it('ends an all-day series on the day before', () => {
    const day = DateTime.fromISO('2026-10-12', { zone });
    expect(splitRecurrence(['RRULE:FREQ=WEEKLY'], day, true, zone, 0).before).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261011']);
  });
});
