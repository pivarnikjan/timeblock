import type { Block, BlockSegment, Task } from './db/schema';

export type SegmentWithTask = BlockSegment & { task: Task };
export type BlockWithSegments = Block & { segments: SegmentWithTask[] };

/** A block counts as history once any part of it is ticked off; re-planning never touches it. */
export const isLocked = (block: BlockWithSegments) => block.segments.some((s) => s.doneAt !== null);

/**
 * A block planning must leave where it is: ticked-off work is history, and a
 * block the user placed by hand stays where they put it.
 */
export const isFixed = (block: BlockWithSegments) => block.state === 'done' || isLocked(block) || block.pinned;

/**
 * Keeps a task's status in step with its ticked-off minutes: ticked time
 * reaching the estimate makes it done; unticking below it reopens it. Returns
 * the status to move to, or null to leave the task as it is (dropped tasks
 * are never touched).
 */
export function statusAfterTicks(task: Pick<Task, 'status' | 'estimateMin'>, tickedMin: number): 'done' | 'active' | null {
  if (task.status === 'dropped') return null;
  const done = tickedMin >= task.estimateMin;
  if (done && task.status !== 'done') return 'done';
  if (!done && task.status === 'done') return 'active';
  return null;
}

/** No block is made shorter than this by hand. */
export const MIN_BLOCK_MIN = 15;

/**
 * A block's work after it was made `newLength` minutes long by hand, as each
 * segment's new minutes (in block order; 0 = the segment comes off).
 *
 * Longer: the last task gets the extra time. Shorter: the slack a block has
 * from being rounded up to 5 minutes goes first, then minutes come off the
 * last task, then the one before it — work that no longer fits is planned
 * again by the next plan.
 */
export function fitSegments(segments: { minutes: number }[], oldLength: number, newLength: number): number[] {
  const minutes = segments.map((s) => s.minutes);
  if (minutes.length === 0 || newLength === oldLength) return minutes;
  if (newLength > oldLength) {
    minutes[minutes.length - 1] += newLength - oldLength;
    return minutes;
  }
  let over = minutes.reduce((n, m) => n + m, 0) - newLength;
  for (let i = minutes.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(minutes[i], over);
    minutes[i] -= cut;
    over -= cut;
  }
  return minutes;
}
