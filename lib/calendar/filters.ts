import { VIEWS, type CalendarView } from './views';

/**
 * What the Calendar leaves out. Unticked calendars and events are removed from
 * the view entirely — hiding, not greying, is what actually quietens a busy
 * month. Hidden events are listed (left panel, Settings) so they can come back.
 */
export interface CalendarFilters {
  /** Google calendar ids whose events are hidden. */
  hiddenCalendars: string[];
  /** Hide TimeBlock's own planned blocks. */
  hidePlan: boolean;
  /** Individually hidden events, by `eventKey`, with the title for listing them. */
  hiddenEvents: Record<string, string>;
  /**
   * Views that show only multi-day events. Only Month offers the switch — it is
   * for condensed days; a view that shows hours needs its timed events.
   */
  multiDayOnly: CalendarView[];
  /** Draw time-window bands and their names over the blocks instead of behind them. */
  windowsInFront: boolean;
}

export const DEFAULT_FILTERS: CalendarFilters = {
  hiddenCalendars: [],
  hidePlan: false,
  hiddenEvents: {},
  multiDayOnly: [],
  windowsInFront: false,
};

/**
 * Reads the stored JSON defensively: anything malformed falls back to defaults.
 * Also reads the keys v0.3 stored when these switches greyed items out
 * (`greyCalendars`, `greyPlan`, `greyEvents`), so earlier choices carry over.
 */
export function parseFilters(json: string | null | undefined): CalendarFilters {
  let raw: unknown;
  try {
    raw = JSON.parse(json || '{}');
  } catch {
    return { ...DEFAULT_FILTERS };
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const titles = (v: unknown) => {
    const out: Record<string, string> = {};
    if (v && typeof v === 'object') {
      for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === 'string') out[k] = t;
    }
    return out;
  };

  return {
    hiddenCalendars: [...new Set([...strings(o.hiddenCalendars), ...strings(o.greyCalendars)])],
    hidePlan: o.hidePlan === true || o.greyPlan === true,
    hiddenEvents: { ...titles(o.greyEvents), ...titles(o.hiddenEvents) },
    multiDayOnly: strings(o.multiDayOnly).filter((v): v is CalendarView => (VIEWS as readonly string[]).includes(v)),
    windowsInFront: o.windowsInFront === true,
  };
}

/**
 * The identity used to hide an event. Recurring events are keyed by their
 * series, so hiding one daily breakfast hides them all.
 */
export function eventKey(event: { calendarId: string; seriesId: string }): string {
  return `${event.calendarId}|${event.seriesId}`;
}

export interface VisibilityInput {
  calendarId: string | null;
  key: string | null;
  isBlock: boolean;
  multiDay: boolean;
}

export function isHidden(item: VisibilityInput, filters: CalendarFilters, view: CalendarView): boolean {
  // Choices stored for other views before only Month offered the switch are ignored.
  if (view === 'month' && filters.multiDayOnly.includes(view) && !item.multiDay) return true;
  if (item.isBlock) return filters.hidePlan;
  if (item.calendarId && filters.hiddenCalendars.includes(item.calendarId)) return true;
  return item.key !== null && item.key in filters.hiddenEvents;
}
