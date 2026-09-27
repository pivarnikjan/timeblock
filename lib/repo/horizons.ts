import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { horizons, type Horizon, type NewHorizon } from '@/lib/db/schema';

/** Every horizon, any level or status — the hierarchy is always resolved whole. */
export async function listAllHorizons(): Promise<Horizon[]> {
  return db().select().from(horizons).orderBy(asc(horizons.periodStart), asc(horizons.sortOrder), asc(horizons.id));
}

export async function createHorizon(values: NewHorizon): Promise<Horizon> {
  const [row] = await db().insert(horizons).values(values).returning();
  return row;
}

export type HorizonPatch = Partial<Omit<Horizon, 'id' | 'createdAt'>>;

export async function updateHorizon(id: number, patch: HorizonPatch): Promise<void> {
  await db().update(horizons).set(patch).where(eq(horizons.id, id));
}

/**
 * Children are orphaned rather than cascaded — dropping a monthly outcome
 * should not silently delete the weeks that fed it.
 */
export async function deleteHorizon(id: number): Promise<void> {
  await db().update(horizons).set({ parentId: null }).where(eq(horizons.parentId, id));
  await db().delete(horizons).where(eq(horizons.id, id));
}

