import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { statusAfterTicks } from '../blocks';
import { blocks, blockSegments, taskReschedules, tasks, type NewTask, type Task } from '../db/schema';
import type { TimeblockDb } from '../env';

export type TaskStatus = Task['status'];

const OPEN: TaskStatus[] = ['backlog', 'active'];

export async function listTasks(db: TimeblockDb, statuses: TaskStatus[] = OPEN): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(inArray(tasks.status, statuses))
    .orderBy(asc(tasks.priority), asc(tasks.sortOrder), asc(tasks.id));
}

/** Every task, any status — progress needs the finished ones too. */
export async function listAllTasks(db: TimeblockDb): Promise<Task[]> {
  return db.select().from(tasks).orderBy(asc(tasks.sortOrder), asc(tasks.id));
}

export async function getTask(db: TimeblockDb, id: number): Promise<Task | undefined> {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

/** Next free position, so new work queues behind existing work of the same priority. */
export async function nextSortOrder(db: TimeblockDb): Promise<number> {
  const row = await db
    .select({ max: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .get();
  return Number(row?.max ?? 0) + 1;
}

export async function createTask(db: TimeblockDb, values: NewTask): Promise<Task> {
  const [row] = await db
    .insert(tasks)
    .values({ ...values, sortOrder: values.sortOrder ?? (await nextSortOrder(db)) })
    .returning();
  return row;
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>;

export async function updateTask(db: TimeblockDb, id: number, patch: TaskPatch): Promise<void> {
  await db.update(tasks).set(patch).where(eq(tasks.id, id));
}

export async function setTaskStatus(db: TimeblockDb, id: number, status: TaskStatus): Promise<void> {
  await db
    .update(tasks)
    .set({ status, completedAt: status === 'done' ? new Date().toISOString() : null })
    .where(eq(tasks.id, id));
}

/** Removes a task with its planned segments; draft blocks left empty go too. */
export async function deleteTask(db: TimeblockDb, id: number): Promise<void> {
  await db.delete(blockSegments).where(eq(blockSegments.taskId, id));
  await db
    .delete(blocks)
    .where(
      and(
        eq(blocks.state, 'draft'),
        sql`not exists (select 1 from ${blockSegments} where ${blockSegments.blockId} = ${blocks.id})`,
      ),
    );
  await db.delete(taskReschedules).where(eq(taskReschedules.taskId, id));
  await db.delete(tasks).where(eq(tasks.id, id));
}

/**
 * Keeps task status in step with ticked-off minutes: a task whose ticked time
 * reaches its estimate becomes done; unticking below it reopens the task.
 */
export async function syncCompletion(db: TimeblockDb, taskIds: number[], ticked: Map<number, number>): Promise<void> {
  for (const id of taskIds) {
    const task = await getTask(db, id);
    const next = task ? statusAfterTicks(task, ticked.get(id) ?? 0) : null;
    if (next) await setTaskStatus(db, id, next);
  }
}
