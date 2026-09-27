import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { eventMarks, type EventMark } from '@/lib/db/schema';

export type MarkField = 'important' | 'placeholder';

/** Every mark, by event key. */
export async function listMarks(): Promise<Map<string, EventMark>> {
  const rows = await db().select().from(eventMarks);
  return new Map(rows.map((r) => [r.key, r]));
}

/** Keys of events the planner may schedule over. */
export async function placeholderKeys(): Promise<Set<string>> {
  const rows = await db().select({ key: eventMarks.key }).from(eventMarks).where(eq(eventMarks.placeholder, true));
  return new Set(rows.map((r) => r.key));
}

/** Sets one mark on an event; a row with nothing left marked is removed. */
export async function setMark(key: string, title: string, field: MarkField, on: boolean): Promise<void> {
  const current = (await db().select().from(eventMarks).where(eq(eventMarks.key, key)).get()) ?? null;
  const next = {
    important: field === 'important' ? on : (current?.important ?? false),
    placeholder: field === 'placeholder' ? on : (current?.placeholder ?? false),
  };
  if (!next.important && !next.placeholder) {
    await db().delete(eventMarks).where(eq(eventMarks.key, key));
    return;
  }
  const values = { key, title, ...next, updatedAt: new Date().toISOString() };
  await db().insert(eventMarks).values(values).onConflictDoUpdate({ target: eventMarks.key, set: values });
}
