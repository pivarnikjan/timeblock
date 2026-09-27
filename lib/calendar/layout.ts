/**
 * Placement maths for the calendar grids, kept pure so it can be tested.
 */

export interface Timed {
  /** Minutes from the start of the visible day. */
  start: number;
  end: number;
}

export type Columned<T> = T & { col: number; cols: number };

/**
 * Side-by-side columns for overlapping events, the way Google Calendar lays out
 * a busy afternoon: events that overlap (directly or through a chain) share a
 * group, each takes the leftmost free column, and the group's width is split by
 * its column count.
 */
export function layoutColumns<T extends Timed>(items: T[]): Columned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Columned<T>[] = [];

  let group: Columned<T>[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const flush = () => {
    for (const item of group) item.cols = columnEnds.length;
    out.push(...group);
    group = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) {
      flush();
      groupEnd = -Infinity;
    }
    let col = columnEnds.findIndex((end) => end <= item.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[col] = item.end;
    }
    group.push({ ...item, col, cols: 0 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return out;
}

export interface Spanning {
  /** Index of the first day covered, relative to the row (may be < 0). */
  startDay: number;
  /** Index of the day after the last one covered (may be > row length). */
  endDay: number;
}

export type Laned<T> = T & {
  lane: number;
  /** First visible column in the row, and how many columns the bar covers. */
  col: number;
  span: number;
  /** The event started before / continues after this row — drawn with a cut edge. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Stacks multi-day bars into lanes for one row of days (a week in the month
 * view, or the all-day strip above a time grid): longest-first within the same
 * start, each in the lowest lane free for every day it covers.
 */
export function layoutLanes<T extends Spanning>(items: T[], rowLength: number): Laned<T>[] {
  const visible = items
    .map((item) => ({
      item,
      col: Math.max(0, item.startDay),
      last: Math.min(rowLength, item.endDay) - 1,
    }))
    .filter(({ col, last }) => last >= col && col < rowLength)
    .sort((a, b) => a.col - b.col || b.last - b.col - (a.last - a.col));

  const lanes: boolean[][] = [];
  return visible.map(({ item, col, last }) => {
    let lane = 0;
    for (; ; lane++) {
      lanes[lane] ??= Array(rowLength).fill(false);
      let free = true;
      for (let d = col; d <= last; d++) if (lanes[lane][d]) free = false;
      if (free) break;
    }
    for (let d = col; d <= last; d++) lanes[lane][d] = true;
    return {
      ...item,
      lane,
      col,
      span: last - col + 1,
      continuesBefore: item.startDay < 0,
      continuesAfter: item.endDay > rowLength,
    };
  });
}
