import 'server-only';
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { blocks, blockSegments, tasks, type Block, type BlockSegment, type Task } from '@/lib/db/schema';

export type SegmentWithTask = BlockSegment & { task: Task };
export type BlockWithSegments = Block & { segments: SegmentWithTask[] };

/** A block counts as history once any part of it is ticked off; re-planning never touches it. */
export const isLocked = (block: BlockWithSegments) => block.segments.some((s) => s.doneAt !== null);

async function withSegments(rows: Block[]): Promise<BlockWithSegments[]> {
  if (rows.length === 0) return [];
  const segs = await db()
    .select({ segment: blockSegments, task: tasks })
    .from(blockSegments)
    .innerJoin(tasks, eq(blockSegments.taskId, tasks.id))
    .where(
      inArray(
        blockSegments.blockId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(blockSegments.sortOrder), asc(blockSegments.id));

  return rows.map((block) => ({
    ...block,
    segments: segs.filter((s) => s.segment.blockId === block.id).map((s) => ({ ...s.segment, task: s.task })),
  }));
}

export async function listForDate(date: string): Promise<BlockWithSegments[]> {
  const rows = await db()
    .select()
    .from(blocks)
    .where(and(eq(blocks.date, date), inArray(blocks.state, ['draft', 'synced', 'done'])))
    .orderBy(asc(blocks.startsAt));
  return withSegments(rows);
}

/** Blocks on the local dates `from` … `to` (inclusive), for the multi-day calendar views. */
export async function listForRange(from: string, to: string): Promise<BlockWithSegments[]> {
  const rows = await db()
    .select()
    .from(blocks)
    .where(and(gte(blocks.date, from), lte(blocks.date, to), inArray(blocks.state, ['draft', 'synced', 'done'])))
    .orderBy(asc(blocks.startsAt));
  return withSegments(rows);
}

/** Blocks from the local date `from` onwards — everything a calendar-wide plan can touch. */
export async function listFrom(from: string): Promise<BlockWithSegments[]> {
  const rows = await db()
    .select()
    .from(blocks)
    .where(and(gte(blocks.date, from), inArray(blocks.state, ['draft', 'synced', 'done'])))
    .orderBy(asc(blocks.startsAt));
  return withSegments(rows);
}

/** Blocks that have an event in Google Calendar (committed, or history since), optionally from a local date on. */
export async function listCommitted(from?: string): Promise<BlockWithSegments[]> {
  const rows = await db()
    .select()
    .from(blocks)
    .where(
      and(
        isNotNull(blocks.googleEventId),
        inArray(blocks.state, ['synced', 'done']),
        from ? gte(blocks.date, from) : undefined,
      ),
    )
    .orderBy(asc(blocks.startsAt));
  return withSegments(rows);
}

export async function getBlock(id: number): Promise<BlockWithSegments | null> {
  const rows = await db().select().from(blocks).where(eq(blocks.id, id));
  return (await withSegments(rows))[0] ?? null;
}

/** Latest date before `date` that has any planned blocks — the day to review. */
export async function lastPlannedDateBefore(date: string): Promise<string | null> {
  const row = await db()
    .select({ date: sql<string>`max(${blocks.date})` })
    .from(blocks)
    .where(and(lt(blocks.date, date), inArray(blocks.state, ['synced', 'done', 'draft'])))
    .get();
  return row?.date ?? null;
}

/** Minutes ticked off per task, across every day. This is what progress is made of. */
export async function tickedMinutesByTask(): Promise<Map<number, number>> {
  const rows = await db()
    .select({ taskId: blockSegments.taskId, total: sql<number>`sum(${blockSegments.minutes})` })
    .from(blockSegments)
    .where(isNotNull(blockSegments.doneAt))
    .groupBy(blockSegments.taskId);
  return new Map(rows.map((r) => [r.taskId, Number(r.total)]));
}

/**
 * The local date each task's work was last done on: the date of its latest
 * block with ticked work — the day it happened, not the day it was ticked
 * (Friday's session reviewed on Monday morning still counts for Friday).
 */
export async function doneOnByTask(): Promise<Map<number, string>> {
  const rows = await db()
    .select({ taskId: blockSegments.taskId, date: sql<string>`max(${blocks.date})` })
    .from(blockSegments)
    .innerJoin(blocks, eq(blockSegments.blockId, blocks.id))
    .where(isNotNull(blockSegments.doneAt))
    .groupBy(blockSegments.taskId);
  return new Map(rows.map((r) => [r.taskId, r.date]));
}

export interface DraftBlock {
  startsAt: string;
  endsAt: string;
  windowId: number | null;
  segments: { taskId: number; minutes: number }[];
}

/**
 * A block planning must leave where it is: ticked-off work is history, and a
 * block the user placed by hand stays where they put it.
 */
export const isFixed = (block: BlockWithSegments) => block.state === 'done' || isLocked(block) || block.pinned;

/** Stores one planned block as a draft and returns its id. */
export async function insertDraft(date: string, draft: DraftBlock): Promise<number> {
  const [block] = await db()
    .insert(blocks)
    .values({ date, startsAt: draft.startsAt, endsAt: draft.endsAt, windowId: draft.windowId, state: 'draft' })
    .returning();
  await db()
    .insert(blockSegments)
    .values(draft.segments.map((s, i) => ({ blockId: block.id, taskId: s.taskId, minutes: s.minutes, sortOrder: i })));
  return block.id;
}

async function deleteBlocksAndSegments(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db().delete(blockSegments).where(inArray(blockSegments.blockId, ids));
  await db().delete(blocks).where(inArray(blocks.id, ids));
}

/**
 * Regenerating a plan throws away the previous proposal for that day. Only
 * drafts are touched — committed, ticked-off and pinned blocks keep their rows.
 */
export async function replaceDrafts(date: string, drafts: DraftBlock[]): Promise<void> {
  const old = await db()
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.date, date), eq(blocks.state, 'draft'), eq(blocks.pinned, false)));
  await deleteBlocksAndSegments(old.map((b) => b.id));
  for (const draft of drafts) await insertDraft(date, draft);
}

/**
 * The calendar-wide version: every unpinned draft from `from` on is replaced
 * by the new plan, whichever days it lands on.
 */
export async function replaceDraftsFrom(from: string, days: { date: string; drafts: DraftBlock[] }[]): Promise<void> {
  const old = await db()
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(gte(blocks.date, from), eq(blocks.state, 'draft'), eq(blocks.pinned, false)));
  await deleteBlocksAndSegments(old.map((b) => b.id));
  for (const day of days) for (const draft of day.drafts) await insertDraft(day.date, draft);
}

/** Drafts from `from` on, pinned ones included — "discard the plan". */
export async function deleteDraftsFrom(from: string): Promise<number> {
  const rows = await db()
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(gte(blocks.date, from), eq(blocks.state, 'draft')));
  await deleteBlocksAndSegments(rows.map((r) => r.id));
  return rows.length;
}

/** Dates from `from` on that hold drafts, in order. */
export async function draftDatesFrom(from: string): Promise<{ date: string; blocks: number }[]> {
  const rows = await db()
    .select({ date: blocks.date, count: sql<number>`count(*)` })
    .from(blocks)
    .where(and(gte(blocks.date, from), eq(blocks.state, 'draft')))
    .groupBy(blocks.date)
    .orderBy(asc(blocks.date));
  return rows.map((r) => ({ date: r.date, blocks: Number(r.count) }));
}

/** Dates from `from` on that hold committed blocks nobody pinned — what a new plan replaces. */
export async function replaceableSyncedDatesFrom(from: string): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ date: blocks.date })
    .from(blocks)
    .where(and(gte(blocks.date, from), eq(blocks.state, 'synced'), eq(blocks.pinned, false)))
    .orderBy(asc(blocks.date));
  return rows.map((r) => r.date);
}

/** Puts a block somewhere new by hand. It is pinned from then on. */
export async function moveBlock(id: number, date: string, startsAt: string, endsAt: string): Promise<void> {
  await db()
    .update(blocks)
    .set({ date, startsAt, endsAt, pinned: true, updatedAt: new Date().toISOString() })
    .where(eq(blocks.id, id));
}

/**
 * Moves a block whose work was done ahead of plan back to when it was done, as
 * history: its unticked work is dropped from it (and planned again), and it is
 * kept as done.
 */
export async function relocateDone(block: BlockWithSegments, at: { date: string; startsAt: string; endsAt: string }): Promise<void> {
  const open = block.segments.filter((s) => s.doneAt === null).map((s) => s.id);
  if (open.length > 0) await db().delete(blockSegments).where(inArray(blockSegments.id, open));
  await db()
    .update(blocks)
    .set({ ...at, state: 'done', pinned: false, updatedAt: new Date().toISOString() })
    .where(eq(blocks.id, block.id));
}

/** Removes a block and its task segments. */
export async function deleteBlock(id: number): Promise<void> {
  await deleteBlocksAndSegments([id]);
}

/** Removes several blocks and their task segments. */
export async function deleteBlocks(ids: number[]): Promise<void> {
  await deleteBlocksAndSegments(ids);
}

export async function setPinned(id: number, pinned: boolean): Promise<void> {
  await db().update(blocks).set({ pinned, updatedAt: new Date().toISOString() }).where(eq(blocks.id, id));
}

export async function markSynced(id: number, googleEventId: string): Promise<void> {
  await db()
    .update(blocks)
    .set({ state: 'synced', googleEventId, updatedAt: new Date().toISOString() })
    .where(eq(blocks.id, id));
}

/**
 * Retires a committed block that is being replaced. A block with ticked work is
 * kept as history — its unticked segments are removed (their minutes are
 * re-planned) and it is marked done — so progress is never lost to a re-plan.
 * Returns true when the block (and its calendar event) should be deleted.
 */
export async function retireBlock(block: BlockWithSegments): Promise<boolean> {
  if (!isLocked(block)) {
    await deleteBlocksAndSegments([block.id]);
    return true;
  }
  const open = block.segments.filter((s) => s.doneAt === null).map((s) => s.id);
  if (open.length > 0) await db().delete(blockSegments).where(inArray(blockSegments.id, open));
  await db().update(blocks).set({ state: 'done', updatedAt: new Date().toISOString() }).where(eq(blocks.id, block.id));
  return false;
}

export async function deleteDrafts(date: string): Promise<void> {
  const rows = await db()
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.date, date), eq(blocks.state, 'draft')));
  await deleteBlocksAndSegments(rows.map((r) => r.id));
}

/** Ticks or unticks segments and returns the tasks they belong to. */
export async function setSegmentsDone(ids: number[], done: boolean): Promise<number[]> {
  if (ids.length === 0) return [];
  await db()
    .update(blockSegments)
    .set({ doneAt: done ? new Date().toISOString() : null })
    .where(inArray(blockSegments.id, ids));
  const rows = await db()
    .select({ taskId: blockSegments.taskId })
    .from(blockSegments)
    .where(inArray(blockSegments.id, ids));
  return [...new Set(rows.map((r) => r.taskId))];
}

export async function segmentIdsOfBlock(blockId: number): Promise<number[]> {
  const rows = await db().select({ id: blockSegments.id }).from(blockSegments).where(eq(blockSegments.blockId, blockId));
  return rows.map((r) => r.id);
}
