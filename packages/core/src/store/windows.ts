import { asc, eq } from 'drizzle-orm';
import { horizons, settings, tasks, timeWindows, type NewTimeWindow, type TimeWindow } from '../db/schema';
import type { TimeblockDb } from '../env';

/** Time windows earliest first — the order Settings, the Calendar legend and the planner use. */
export async function listWindows(db: TimeblockDb): Promise<TimeWindow[]> {
  return db
    .select()
    .from(timeWindows)
    .orderBy(asc(timeWindows.startTime), asc(timeWindows.endTime), asc(timeWindows.name), asc(timeWindows.id));
}

export async function createWindow(db: TimeblockDb, values: NewTimeWindow): Promise<void> {
  await db.insert(timeWindows).values(values);
}

export async function updateWindow(db: TimeblockDb, id: number, patch: Partial<Omit<TimeWindow, 'id'>>): Promise<void> {
  await db.update(timeWindows).set(patch).where(eq(timeWindows.id, id));
}

/**
 * Deleting a window sends everything that used it back to inheriting, so no
 * task is left pointing at a window that no longer exists.
 */
export async function deleteWindow(db: TimeblockDb, id: number): Promise<void> {
  await db.update(tasks).set({ windowId: null }).where(eq(tasks.windowId, id));
  await db.update(horizons).set({ windowId: null }).where(eq(horizons.windowId, id));
  await db.update(settings).set({ defaultWindowId: null }).where(eq(settings.defaultWindowId, id));
  await db.delete(timeWindows).where(eq(timeWindows.id, id));
}
