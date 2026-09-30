import type { Horizon, NewHorizon } from '../db/schema';
import type { TimeblockDb } from '../env';
import { createHorizon, extendYearGoal, updateHorizon, type HorizonPatch } from '../store/horizons';
import { createTask } from '../store/tasks';
import { parseDuration } from '../time/duration';

/**
 * Creates a goal, outcome or week priority. A yearly goal may run until a later
 * year (`untilYear`); it then takes in a same-titled goal already set for one
 * of those years.
 */
export async function addHorizon(db: TimeblockDb, values: NewHorizon, untilYear?: number): Promise<Horizon> {
  const created = await createHorizon(db, {
    ...values,
    periodEnd: values.level === 'year' && untilYear ? `${untilYear}-12-31` : values.periodEnd,
  });
  if (created.level === 'year') await extendYearGoal(db, created.id);
  return created;
}

/** Edits a horizon; a yearly goal's `untilYear` stretches (or shortens) the years it runs over. */
export async function editHorizon(db: TimeblockDb, id: number, patch: HorizonPatch, untilYear?: number): Promise<void> {
  await updateHorizon(db, id, patch);
  if (untilYear !== undefined) await extendYearGoal(db, id, untilYear);
}

/** Quick-add from a horizon row: "title + duration", linked straight to it. */
export async function quickAddTask(db: TimeblockDb, horizonId: number, title: string, duration: string): Promise<void> {
  const minutes = parseDuration(duration);
  if (minutes === null) throw new Error(`Could not read "${duration}" as a duration (e.g. 45m, 1h 30m)`);
  await createTask(db, { title: title.trim(), estimateMin: minutes, horizonId });
}
