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
