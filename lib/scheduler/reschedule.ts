import { DateTime } from 'luxon';
import type { BusySpan, Closure } from './day';

/** A planned block as reschedule sees it: when it is and what it holds. UTC ISO instants. */
export interface PlacedBlock {
  startsAt: string;
  endsAt: string;
  windowId: number | null;
  segments: { taskId: number; minutes: number }[];
}

const ms = (iso: string) => DateTime.fromISO(iso).toMillis();

/** True when the two spans share at least a minute (touching end to start is not an overlap). */
export function overlaps(a: BusySpan, b: BusySpan): boolean {
  return ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);
}

/**
 * Why a planned block can no longer stay where it is, or null when it still
 * fits: a meeting now sits on it, or a vacation closed its window. A block
 * placed by hand ignores windows, so only a meeting can collide with it.
 */
export function conflictOf(
  block: PlacedBlock & { pinned: boolean },
  busy: BusySpan[],
  closures: Closure[],
): 'meeting' | 'vacation' | null {
  const span = { start: block.startsAt, end: block.endsAt };
  if (busy.some((b) => overlaps(span, b))) return 'meeting';
  if (!block.pinned && closures.some((c) => c.windowId === block.windowId && overlaps(span, c))) return 'vacation';
  return null;
}

/** A block with the tick times of its work (`doneAt`: UTC ISO, null = not ticked). */
export interface TickedBlock {
  startsAt: string;
  endsAt: string;
  segments: { doneAt: string | null }[];
}

/**
 * When a block's work was ticked off before the block even began — done ahead
 * of plan — the moment the last of it was ticked; null otherwise. Such a block
 * holds history in a slot that is still to come, and that slot is free again.
 */
export function doneAheadAt(block: TickedBlock, now: string): string | null {
  const ticks = block.segments.flatMap((s) => (s.doneAt ? [ms(s.doneAt)] : []));
  if (ticks.length === 0 || ms(block.startsAt) <= ms(now)) return null;
  const last = Math.max(...ticks);
  return last < ms(block.startsAt) ? DateTime.fromMillis(last).toUTC().toISO()! : null;
}

/**
 * Where a block done ahead of plan belongs as history: ending when its work was
 * ticked off (rounded up to 5 minutes), just as long as it was planned.
 */
export function whenDone(block: Pick<TickedBlock, 'startsAt' | 'endsAt'>, doneAt: string, zone: string): { date: string; startsAt: string; endsAt: string } {
  const done = DateTime.fromISO(doneAt).setZone(zone);
  const end = done.minute % 5 === 0 && done.second === 0 && done.millisecond === 0
    ? done
    : done.startOf('minute').plus({ minutes: 5 - (done.minute % 5) });
  const length = ms(block.endsAt) - ms(block.startsAt);
  const start = end.minus({ milliseconds: length });
  return { date: start.toISODate()!, startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()! };
}

const signature = (b: PlacedBlock) =>
  [ms(b.startsAt), ms(b.endsAt), b.windowId ?? '-', ...b.segments.map((s) => `${s.taskId}:${s.minutes}`)].join('|');

export interface BlockDiff<C, N> {
  /** Current blocks the new plan puts exactly where they are, with the same work — left untouched. */
  kept: C[];
  /** Current blocks the new plan no longer has. */
  removed: C[];
  /** New blocks that replace them. */
  added: N[];
  /** Every task with work in a removed or an added block: what the reschedule changes. */
  impacted: Set<number>;
}

/**
 * Compares the plan on the calendar with a freshly computed one. A block that
 * comes out identical (same start, end, window and work) is kept, so its Google
 * event is never touched; everything else is replaced.
 */
export function diffBlocks<C extends PlacedBlock, N extends PlacedBlock>(current: C[], next: N[]): BlockDiff<C, N> {
  const waiting = new Map<string, C[]>();
  for (const block of current) {
    const key = signature(block);
    waiting.set(key, [...(waiting.get(key) ?? []), block]);
  }

  const kept: C[] = [];
  const added: N[] = [];
  for (const block of next) {
    const match = waiting.get(signature(block))?.shift();
    if (match) kept.push(match);
    else added.push(block);
  }
  const keptSet = new Set(kept);
  const removed = current.filter((b) => !keptSet.has(b));

  const impacted = new Set<number>();
  for (const b of [...removed, ...added]) for (const s of b.segments) impacted.add(s.taskId);
  return { kept, removed, added, impacted };
}
