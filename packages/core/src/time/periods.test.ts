import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { keyFor, periodFor, resolvePeriod, reviewParentLevel, shift } from './periods';

const TZ = 'Europe/Vienna';
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

describe('period math', () => {
  it('bounds a year, month and ISO week', () => {
    const d = at('2026-08-12');

    expect(periodFor('year', d)).toMatchObject({ start: '2026-01-01', end: '2026-12-31', key: '2026' });
    expect(periodFor('month', d)).toMatchObject({ start: '2026-08-01', end: '2026-08-31', key: '2026-08' });
    // 12 Aug 2026 is a Wednesday, so the week runs Mon 10th to Sun 16th.
    expect(periodFor('week', d)).toMatchObject({ start: '2026-08-10', end: '2026-08-16', key: '2026-W33' });
  });

  it('uses the ISO week-year at a year boundary', () => {
    // 1 Jan 2027 is a Friday, still inside ISO week 53 of 2026.
    expect(keyFor('week', at('2027-01-01'))).toBe('2026-W53');
  });

  it('shifts by whole periods', () => {
    expect(periodFor('month', shift('month', at('2026-01-15'), -1)).key).toBe('2025-12');
    expect(periodFor('week', shift('week', at('2026-08-12'), 1)).key).toBe('2026-W34');
  });

  it('skips quarters when picking a review parent', () => {
    expect(reviewParentLevel('week')).toBe('month');
    expect(reviewParentLevel('month')).toBe('year');
    expect(reviewParentLevel('year')).toBeNull();
  });

  it('falls back to the current period when the date param is junk', () => {
    const good = resolvePeriod('month', TZ, '2026-03-09');
    const bad = resolvePeriod('month', TZ, 'not-a-date');

    expect(good.key).toBe('2026-03');
    expect(bad.key).toBe(keyFor('month', DateTime.now().setZone(TZ)));
  });
});
