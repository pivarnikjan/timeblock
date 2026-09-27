import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { horizons, settings, tasks, timeWindows, type NewTimeWindow, type TimeWindow } from '@/lib/db/schema';
import type { WindowSpec } from '@/lib/scheduler/day';

export async function listWindows(): Promise<TimeWindow[]> {
  return db().select().from(timeWindows).orderBy(asc(timeWindows.sortOrder), asc(timeWindows.id));
}

export function toSpec(w: TimeWindow): WindowSpec {
  return {
    id: w.id,
    name: w.name,
    start: w.startTime,
    end: w.endTime,
    weekdays: w.weekdays
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 1 && d <= 7),
  };
}

export async function createWindow(values: NewTimeWindow): Promise<void> {
  await db().insert(timeWindows).values(values);
}

export async function updateWindow(id: number, patch: Partial<Omit<TimeWindow, 'id'>>): Promise<void> {
  await db().update(timeWindows).set(patch).where(eq(timeWindows.id, id));
}

/**
 * Deleting a window sends everything that used it back to inheriting, so no
 * task is left pointing at a window that no longer exists.
 */
export async function deleteWindow(id: number): Promise<void> {
  await db().update(tasks).set({ windowId: null }).where(eq(tasks.windowId, id));
  await db().update(horizons).set({ windowId: null }).where(eq(horizons.windowId, id));
  await db().update(settings).set({ defaultWindowId: null }).where(eq(settings.defaultWindowId, id));
  await db().delete(timeWindows).where(eq(timeWindows.id, id));
}
