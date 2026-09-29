import type { DatabaseSync } from 'node:sqlite';
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { horizons, tasks } from '@/lib/db/schema';
import { extendYearGoal } from '@/lib/db/year-goals';
import type { ImportPlan } from './tasks-csv';

/**
 * Carries out an import plan inside one SQLite transaction: every row lands, or
 * none does. Validation has already passed by the time this runs, so a failure
 * here is a real database problem — and it leaves nothing half-imported.
 */
export async function applyImport(database: Db, sqlite: DatabaseSync, plan: ImportPlan): Promise<void> {
  const ids = new Map(plan.existing);
  const idOf = (key: string | null) => {
    if (key === null) return null;
    const id = ids.get(key);
    if (id === undefined) throw new Error(`Import referenced a goal before creating it: ${key}`);
    return id;
  };

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const op of plan.ops) {
      switch (op.kind) {
        case 'create-horizon': {
          const [row] = await database
            .insert(horizons)
            .values({ ...op.horizon, parentId: idOf(op.parentKey), windowId: op.windowId })
            .returning({ id: horizons.id });
          ids.set(op.key, row.id);
          break;
        }
        case 'update-horizon': {
          const patch: { parentId?: number | null; windowId?: number; periodEnd?: string } = {};
          if (op.parentKey !== null) patch.parentId = idOf(op.parentKey);
          if (op.windowId !== null) patch.windowId = op.windowId;
          if (op.periodEnd) patch.periodEnd = op.periodEnd;
          if (Object.keys(patch).length > 0) await database.update(horizons).set(patch).where(eq(horizons.id, op.id));
          break;
        }
        case 'create-task':
          await database.insert(tasks).values({
            ...op.task,
            sequential: op.task.sequential ?? false,
            horizonId: idOf(op.horizonKey),
            windowId: op.windowId,
            sortOrder: op.sortOrder,
          });
          break;
        case 'update-task':
          // Status and ticked-off progress are deliberately left alone.
          await database
            .update(tasks)
            .set({
              estimateMin: op.task.estimateMin,
              priority: op.task.priority,
              energy: op.task.energy,
              dueDate: op.task.dueDate,
              notes: op.task.notes,
              windowId: op.windowId,
              sortOrder: op.sortOrder,
              ...(op.task.sequential === null ? {} : { sequential: op.task.sequential }),
            })
            .where(eq(tasks.id, op.id));
          break;
      }
    }
    // A goal the file runs over several years takes in its same-titled copies for those years.
    for (const op of plan.ops) {
      if ((op.kind === 'create-horizon' || op.kind === 'update-horizon') && op.key.startsWith('year|')) {
        await extendYearGoal(database, idOf(op.key)!);
      }
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
