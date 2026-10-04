import { and, desc, gte, inArray, sql } from 'drizzle-orm';
import { taskReschedules, type RescheduleReason } from '../db/schema';
import type { TimeblockDb } from '../env';

export interface Slip {
  taskId: number;
  blockId: number;
  fromStartsAt: string;
  toStartsAt: string | null;
  minutes: number;
  reason: RescheduleReason;
}

/** Records slips. One already recorded (the same task, block and time) is not counted again. */
export async function recordSlips(db: TimeblockDb, slips: Slip[]): Promise<void> {
  if (slips.length === 0) return;
  await db.insert(taskReschedules).values(slips).onConflictDoNothing();
}

/** How many times each task was rescheduled, all time — for the given tasks, or every task. */
export async function rescheduleCounts(db: TimeblockDb, taskIds?: number[]): Promise<Map<number, number>> {
  if (taskIds && taskIds.length === 0) return new Map();
  const rows = await db
    .select({ taskId: taskReschedules.taskId, count: sql<number>`count(*)` })
    .from(taskReschedules)
    .where(taskIds ? inArray(taskReschedules.taskId, taskIds) : undefined)
    .groupBy(taskReschedules.taskId);
  return new Map(rows.map((r) => [r.taskId, Number(r.count)]));
}

export interface RescheduledTask {
  taskId: number;
  count: number;
  /** Minutes that slipped, all slips together. */
  minutes: number;
  /** When it last slipped (UTC ISO). */
  last: string;
}

/** Tasks by how often they were rescheduled since `since` (UTC ISO; all time when null), most first. */
export async function mostRescheduled(db: TimeblockDb, since: string | null, limit: number): Promise<RescheduledTask[]> {
  const count = sql<number>`count(*)`;
  const rows = await db
    .select({
      taskId: taskReschedules.taskId,
      count,
      minutes: sql<number>`sum(${taskReschedules.minutes})`,
      last: sql<string>`max(${taskReschedules.createdAt})`,
    })
    .from(taskReschedules)
    .where(since ? and(gte(taskReschedules.createdAt, since)) : undefined)
    .groupBy(taskReschedules.taskId)
    .orderBy(desc(count), desc(sql`max(${taskReschedules.createdAt})`))
    .limit(limit);
  return rows.map((r) => ({ taskId: r.taskId, count: Number(r.count), minutes: Number(r.minutes), last: r.last }));
}
