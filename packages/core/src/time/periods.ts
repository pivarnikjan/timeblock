import { DateTime } from 'luxon';

export type Level = 'year' | 'quarter' | 'month' | 'week';

/** Levels that get their own review screen, from the 40,000ft view downwards. */
export const REVIEW_LEVELS: Level[] = ['year', 'month', 'week'];

/** A local calendar date, YYYY-MM-DD — the form every date column uses. */
export type LocalDate = string;

export interface Period {
  level: Level;
  /** Stable identifier: '2026', '2026-Q3', '2026-08', '2026-W33'. */
  key: string;
  start: LocalDate;
  end: LocalDate;
  label: string;
}

export function nowIn(timezone: string): DateTime {
  return DateTime.now().setZone(timezone);
}

/** The horizon one level up: a week rolls into a month, a month into a year. */
export function parentLevel(level: Level): Level | null {
  switch (level) {
    case 'week':
      return 'month';
    case 'month':
      return 'quarter';
    case 'quarter':
      return 'year';
    case 'year':
      return null;
  }
}

/**
 * The review screens skip quarters, so a week's selectable parent is the month
 * and a month's is the year.
 */
export function reviewParentLevel(level: Level): Level | null {
  switch (level) {
    case 'week':
      return 'month';
    case 'month':
      return 'year';
    default:
      return null;
  }
}

function unitFor(level: Level): 'year' | 'quarter' | 'month' | 'week' {
  return level;
}

/** The period of `level` containing `date`. Weeks are ISO weeks, Monday to Sunday. */
export function periodFor(level: Level, date: DateTime): Period {
  const start = date.startOf(unitFor(level));
  const end = date.endOf(unitFor(level));
  return {
    level,
    key: keyFor(level, date),
    start: start.toISODate()!,
    end: end.toISODate()!,
    label: labelFor(level, date),
  };
}

export function keyFor(level: Level, date: DateTime): string {
  switch (level) {
    case 'year':
      return date.toFormat('yyyy');
    case 'quarter':
      return `${date.toFormat('yyyy')}-Q${date.quarter}`;
    case 'month':
      return date.toFormat('yyyy-MM');
    case 'week':
      return `${date.weekYear}-W${String(date.weekNumber).padStart(2, '0')}`;
  }
}

function labelFor(level: Level, date: DateTime): string {
  switch (level) {
    case 'year':
      return date.toFormat('yyyy');
    case 'quarter':
      return `Q${date.quarter} ${date.toFormat('yyyy')}`;
    case 'month':
      return date.toFormat('LLLL yyyy');
    case 'week': {
      const start = date.startOf('week');
      const end = date.endOf('week');
      const range =
        start.month === end.month
          ? `${start.toFormat('d')}–${end.toFormat('d LLL')}`
          : `${start.toFormat('d LLL')} – ${end.toFormat('d LLL')}`;
      return `Week ${date.weekNumber} · ${range}`;
    }
  }
}

/** Shift by whole periods; `offset` of -1 is the previous week/month/year. */
export function shift(level: Level, date: DateTime, offset: number): DateTime {
  return date.plus({ [`${unitFor(level)}s`]: offset });
}

/**
 * Resolves the period a screen should show: an explicit `?date=YYYY-MM-DD`
 * when navigating, otherwise the current one.
 */
export function resolvePeriod(level: Level, timezone: string, isoDate?: string): Period {
  const base =
    isoDate && DateTime.fromISO(isoDate, { zone: timezone }).isValid
      ? DateTime.fromISO(isoDate, { zone: timezone })
      : nowIn(timezone);
  return periodFor(level, base);
}
