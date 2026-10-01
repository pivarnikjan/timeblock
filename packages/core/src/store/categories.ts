import { asc, eq, sql } from 'drizzle-orm';
import { eventCategories, eventMarks, type EventCategory, type NewEventCategory } from '../db/schema';
import type { TimeblockDb } from '../env';

/** Every category, in rule order. */
export async function listCategories(db: TimeblockDb): Promise<EventCategory[]> {
  return db.select().from(eventCategories).orderBy(asc(eventCategories.sortOrder), asc(eventCategories.id));
}

export async function getCategory(db: TimeblockDb, id: number): Promise<EventCategory | null> {
  return (await db.select().from(eventCategories).where(eq(eventCategories.id, id)).get()) ?? null;
}

/** Adds a category after the existing ones and returns it. */
export async function createCategory(db: TimeblockDb, values: Omit<NewEventCategory, 'id' | 'sortOrder'>): Promise<EventCategory> {
  const row = await db
    .select({ max: sql<number>`coalesce(max(${eventCategories.sortOrder}), 0)` })
    .from(eventCategories)
    .get();
  const [created] = await db
    .insert(eventCategories)
    .values({ ...values, sortOrder: Number(row?.max ?? 0) + 1 })
    .returning();
  return created;
}

export type CategoryPatch = Partial<Omit<EventCategory, 'id'>>;

export async function updateCategory(db: TimeblockDb, id: number, patch: CategoryPatch): Promise<void> {
  await db.update(eventCategories).set(patch).where(eq(eventCategories.id, id));
}

/** Deletes a category; events chosen into it go back to the title rules. */
export async function deleteCategory(db: TimeblockDb, id: number): Promise<void> {
  await db.update(eventMarks).set({ categoryId: null, updatedAt: new Date().toISOString() }).where(eq(eventMarks.categoryId, id));
  await db.delete(eventCategories).where(eq(eventCategories.id, id));
}
