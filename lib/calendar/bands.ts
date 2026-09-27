import type { DateTime } from 'luxon';
import { compareWindows, windowInterval, windowOpensOn, type WindowSpec } from '@/lib/scheduler/day';
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

/** The bands for every visible day, labelling each window once. */
export function windowBands(
  days: string[],
  windows: (WindowSpec & { id: number; color: string | null })[],
  zone: string,
): Record<string, WindowBand[]> {
  const legend = new Map(windowLegend(windows).map((l) => [l.id, l]));
  const named = new Set<number>();
  const bands: Record<string, WindowBand[]> = {};
  for (const day of days) {
    bands[day] = windows
      .filter((w) => windowOpensOn(w, day, zone))
      .map((w) => {
        const labelled = !named.has(w.id);
        named.add(w.id);
        return { id: w.id, name: w.name, color: legend.get(w.id)!.color, labelled, ...windowInterval(day, w, zone) };
      });
  }
  return bands;
}
