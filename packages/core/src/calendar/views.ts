import { DateTime } from 'luxon';

/** The Calendar's views, in the order the switcher shows them. */
export const VIEWS = ['day', 'workweek', 'week', 'month'] as const;
export type CalendarView = (typeof VIEWS)[number];

export const VIEW_LABEL: Record<CalendarView, string> = {
  day: 'Today',
  workweek: 'Work week',
  week: 'Week',
  month: 'Month',
};

export function parseView(value: unknown): CalendarView | null {
  return typeof value === 'string' && (VIEWS as readonly string[]).includes(value) ? (value as CalendarView) : null;
}

export interface CalendarRange {
  view: CalendarView;
  /** The date the view was asked for; navigation keeps it. */
  anchor: string;
  /** Every date shown, in order — for month, full Monday–Sunday weeks. */
  days: string[];
  /** For month view: the month's own dates (days outside it are shown muted). */
  month: string | null;
  title: string;
  prev: string;
  next: string;
}

const iso = (d: DateTime) => d.toISODate()!;

function span(from: DateTime, count: number): string[] {
  return Array.from({ length: count }, (_, i) => iso(from.plus({ days: i })));
}

/** A readable range title in the style of Google Calendar's header. */
function rangeTitle(first: DateTime, last: DateTime): string {
  if (first.hasSame(last, 'day')) return first.toFormat('cccc d LLLL yyyy');
  if (first.hasSame(last, 'month')) return `${first.toFormat('d')} – ${last.toFormat('d LLL yyyy')}`;
  if (first.hasSame(last, 'year')) return `${first.toFormat('d LLL')} – ${last.toFormat('d LLL yyyy')}`;
  return `${first.toFormat('d LLL yyyy')} – ${last.toFormat('d LLL yyyy')}`;
}

/**
 * What a view shows for `anchor`, and where the ‹ › arrows go.
 * Weeks run Monday to Sunday (ISO), matching the rest of TimeBlock.
 */
export function calendarRange(view: CalendarView, anchor: string, zone: string): CalendarRange {
  const a = DateTime.fromISO(anchor, { zone }).startOf('day');

  switch (view) {
    case 'day':
      return { view, anchor, days: [anchor], month: null, title: rangeTitle(a, a), prev: iso(a.minus({ days: 1 })), next: iso(a.plus({ days: 1 })) };
    case 'workweek':
    case 'week': {
      const monday = a.startOf('week');
      const count = view === 'week' ? 7 : 5;
      return {
        view,
        anchor,
        days: span(monday, count),
        month: null,
        title: rangeTitle(monday, monday.plus({ days: count - 1 })),
        prev: iso(a.minus({ weeks: 1 })),
        next: iso(a.plus({ weeks: 1 })),
      };
    }
    case 'month': {
      const first = a.startOf('month');
      const gridStart = first.startOf('week');
      const gridEnd = a.endOf('month').endOf('week').startOf('day');
      const count = Math.round(gridEnd.diff(gridStart, 'days').days) + 1;
      return {
        view,
        anchor,
        days: span(gridStart, count),
        month: first.toFormat('yyyy-MM'),
        title: first.toFormat('LLLL yyyy'),
        prev: iso(first.minus({ months: 1 })),
        next: iso(first.plus({ months: 1 })),
      };
    }
  }
}

/**
 * The hours the time grid shows, as minutes from midnight. An end of "00:00"
 * (or any end not after the start) means midnight at the end of the day.
 */
export function visibleHours(start: string, end: string): { startMin: number; endMin: number } {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const startMin = Number.isFinite(toMin(start)) ? toMin(start) : 5 * 60;
  let endMin = toMin(end);
  if (!Number.isFinite(endMin) || endMin <= startMin) endMin = 24 * 60;
  return { startMin, endMin };
}

/** A Calendar URL: a view on a date, optionally with one item open in the side panel. */
export function calendarHref(view: CalendarView, date: string, item?: string | null): string {
  const base = `/calendar?view=${view}&date=${date}`;
  return item ? `${base}&item=${encodeURIComponent(item)}` : base;
}
