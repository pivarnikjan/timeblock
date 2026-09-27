import { DateTime } from 'luxon';

/** One day's share of a vacation on the time grid, in minutes from the top of the visible hours. */
export interface VacationPiece {
  id: number;
  top: number;
  length: number;
  /** Carries the "VACATION" label: the tallest piece of that vacation in view. */
  labelled: boolean;
}

/**
 * Where to hatch vacations on the time grid: each vacation clipped to every
 * visible day and to the visible hours, so a stay from Friday 00:00 to
 * Saturday 14:30 covers all of Friday and Saturday's morning. The label goes
 * on the tallest piece only.
 */
export function vacationPieces(
  vacations: { id: number; start: DateTime; end: DateTime }[],
  days: string[],
  zone: string,
  hours: { startMin: number; endMin: number },
): Record<string, VacationPiece[]> {
  const out: Record<string, VacationPiece[]> = Object.fromEntries(days.map((d) => [d, []]));
  for (const v of vacations) {
    const pieces: { day: string; piece: VacationPiece }[] = [];
    for (const day of days) {
      const dayStart = DateTime.fromISO(day, { zone }).startOf('day');
      const from = DateTime.max(v.start, dayStart.plus({ minutes: hours.startMin }));
      const to = DateTime.min(v.end, dayStart.plus({ minutes: hours.endMin }));
      if (to <= from) continue;
      const top = from.diff(dayStart, 'minutes').minutes - hours.startMin;
      pieces.push({ day, piece: { id: v.id, top, length: to.diff(from, 'minutes').minutes, labelled: false } });
    }
    const tallest = pieces.reduce<VacationPiece | null>((best, p) => (!best || p.piece.length > best.length ? p.piece : best), null);
    if (tallest) tallest.labelled = true;
    for (const { day, piece } of pieces) out[day].push(piece);
  }
  return out;
}
