import { asc, eq, inArray } from 'drizzle-orm';
import { horizons, tasks, type Horizon, type NewHorizon } from '../db/schema';
import type { TimeblockDb } from '../env';
import { absorbedYearGoals } from '../hierarchy';

/** Every horizon, any level or status — the hierarchy is always resolved whole. */
export async function listAllHorizons(db: TimeblockDb): Promise<Horizon[]> {
  return db.select().from(horizons).orderBy(asc(horizons.periodStart), asc(horizons.sortOrder), asc(horizons.id));
}

export async function createHorizon(db: TimeblockDb, values: NewHorizon): Promise<Horizon> {
  const [row] = await db.insert(horizons).values(values).returning();
  return row;
}

export type HorizonPatch = Partial<Omit<Horizon, 'id' | 'createdAt'>>;

export async function updateHorizon(db: TimeblockDb, id: number, patch: HorizonPatch): Promise<void> {
  await db.update(horizons).set(patch).where(eq(horizons.id, id));
}

/**
 * Children are orphaned rather than cascaded — dropping a monthly outcome
 * should not silently delete the weeks that fed it.
 */
export async function deleteHorizon(db: TimeblockDb, id: number): Promise<void> {
  await db.update(horizons).set({ parentId: null }).where(eq(horizons.parentId, id));
  await db.delete(horizons).where(eq(horizons.id, id));
}

/**
 * Makes `goalId` run until the end of `untilYear` (never before its own first
 * year) and takes in the same-titled yearly goals that now fall inside it:
 * their months, weeks and tasks move under it, a window it lacks is taken
 * over, and the emptied copies are deleted. Returns how many were taken in.
 *
 * Takes the database so the CSV import can run it inside its transaction.
 */
export async function extendYearGoal(db: TimeblockDb, goalId: number, untilYear?: number): Promise<number> {
  const all = await db.select().from(horizons);
  const goal = all.find((h) => h.id === goalId && h.level === 'year');
  if (!goal) return 0;

  let periodEnd = goal.periodEnd;
  if (untilYear !== undefined) {
    const first = Number(goal.periodStart.slice(0, 4));
    periodEnd = `${Math.max(first, untilYear)}-12-31`;
    if (periodEnd !== goal.periodEnd) await db.update(horizons).set({ periodEnd }).where(eq(horizons.id, goalId));
  }

  // Only a goal over several years takes others in; two same-titled goals in one year stay apart.
  if (periodEnd.slice(0, 4) === goal.periodStart.slice(0, 4)) return 0;
  const copies = absorbedYearGoals({ ...goal, periodEnd }, all);
  if (copies.length === 0) return 0;
  const ids = copies.map((c) => c.id);
  await db.update(horizons).set({ parentId: goalId }).where(inArray(horizons.parentId, ids));
  await db.update(tasks).set({ horizonId: goalId }).where(inArray(tasks.horizonId, ids));
  const window = goal.windowId ?? copies.find((c) => c.windowId !== null)?.windowId ?? null;
  if (window !== goal.windowId) await db.update(horizons).set({ windowId: window }).where(eq(horizons.id, goalId));
  await db.delete(horizons).where(inArray(horizons.id, ids));
  return copies.length;
}
