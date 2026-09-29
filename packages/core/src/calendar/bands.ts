import type { DateTime } from 'luxon';
import { closuresFor, compareWindows, windowInterval, windowOpensOn, type Closure, type WindowSpec } from '../scheduler/day';
import { subtract } from '../scheduler/intervals';
import { windowColors } from './colors';

/** A time window as the Calendar draws and lists it. */
export interface WindowLegend {
  id: number;
  name: string;
  start: string;
  end: string;
  color: string;
}

export interface WindowBand {
  id: number;
  name: string;
  color: string;
  start: DateTime;
  end: DateTime;
  /**
   * Whether this band carries the window's name. Only the first visible day a
   * window opens on does — the colour tells the rest apart, so a week is not
   * five copies of "LEARNING".
   */
  labelled: boolean;
}

/** Windows earliest first, each with its resolved colour. */
export function windowLegend(windows: (WindowSpec & { id: number; color: string | null })[]): WindowLegend[] {
  const colors = windowColors(windows);
  return [...windows]
    .sort(compareWindows)
    .map((w) => ({ id: w.id, name: w.name, start: w.start, end: w.end, color: colors.get(w.id)! }));
}

/**
 * The bands for every visible day, labelling each window once. Where a
 * vacation closes a window, that part of its band is left out — the window
 * does not apply then — so a band may come in pieces or not at all.
 */
export function windowBands(
  days: string[],
  windows: (WindowSpec & { id: number; color: string | null })[],
  zone: string,
  closures: Closure[] = [],
): Record<string, WindowBand[]> {
  const legend = new Map(windowLegend(windows).map((l) => [l.id, l]));
  const named = new Set<number>();
  const bands: Record<string, WindowBand[]> = {};
  for (const day of days) {
    bands[day] = windows
      .filter((w) => windowOpensOn(w, day, zone))
      .flatMap((w) =>
        subtract(windowInterval(day, w, zone), closuresFor(closures, w.id, zone)).map((open) => {
          const labelled = !named.has(w.id);
          named.add(w.id);
          return { id: w.id, name: w.name, color: legend.get(w.id)!.color, labelled, ...open };
        }),
      );
  }
  return bands;
}
