import { eq, inArray } from 'drizzle-orm';
import { absorbedYearGoals } from '@timeblock/core/hierarchy';
import type { Db } from './client';
import { horizons, tasks } from '@timeblock/core/db/schema';

/**
 * Makes `goalId` run until the end of `untilYear` (never before its own first
 * year) and takes in the same-titled yearly goals that now fall inside it:
 * their months, weeks and tasks move under it, a window it lacks is taken
 * over, and the emptied copies are deleted. Returns how many were taken in.
 *
 * Takes the database so the CSV import can run it inside its transaction.
 */
export async function extendYearGoal(database: Db, goalId: number, untilYear?: number): Promise<number> {
  const all = await database.select().from(horizons);
  const goal = all.find((h) => h.id === goalId && h.level === 'year');
  if (!goal) return 0;

  let periodEnd = goal.periodEnd;
  if (untilYear !== undefined) {
    const first = Number(goal.periodStart.slice(0, 4));
    periodEnd = `${Math.max(first, untilYear)}-12-31`;
    if (periodEnd !== goal.periodEnd) await database.update(horizons).set({ periodEnd }).where(eq(horizons.id, goalId));
  }

  // Only a goal over several years takes others in; two same-titled goals in one year stay apart.
  if (periodEnd.slice(0, 4) === goal.periodStart.slice(0, 4)) return 0;
  const copies = absorbedYearGoals({ ...goal, periodEnd }, all);
  if (copies.length === 0) return 0;
  const ids = copies.map((c) => c.id);
  await database.update(horizons).set({ parentId: goalId }).where(inArray(horizons.parentId, ids));
  await database.update(tasks).set({ horizonId: goalId }).where(inArray(tasks.horizonId, ids));
  const window = goal.windowId ?? copies.find((c) => c.windowId !== null)?.windowId ?? null;
  if (window !== goal.windowId) await database.update(horizons).set({ windowId: window }).where(eq(horizons.id, goalId));
  await database.delete(horizons).where(inArray(horizons.id, ids));
  return copies.length;
}
