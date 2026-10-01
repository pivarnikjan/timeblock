import { eq } from 'drizzle-orm';
import { eventMarks, NO_CATEGORY, type EventMark } from '../db/schema';
import type { TimeblockDb } from '../env';
import { vacationsBySourceEvent } from './vacations';

export type MarkField = 'important' | 'placeholder' | 'notVacation';

/** Every mark, by event key. */
export async function listMarks(db: TimeblockDb): Promise<Map<string, EventMark>> {
  const rows = await db.select().from(eventMarks);
  return new Map(rows.map((r) => [r.key, r]));
}

/**
 * Keys of events the planner may schedule over: placeholders (series keys) and
 * occurrences turned into a vacation (occurrence keys) — see `busySpans`.
 */
export async function freeEventKeys(db: TimeblockDb): Promise<Set<string>> {
  const [rows, converted] = await Promise.all([
    db.select({ key: eventMarks.key }).from(eventMarks).where(eq(eventMarks.placeholder, true)),
    vacationsBySourceEvent(db),
  ]);
  return new Set([...rows.map((r) => r.key), ...converted.keys()]);
}

type MarkValues = Pick<EventMark, 'important' | 'placeholder' | 'notVacation' | 'categoryId'>;

/** Writes an event's marks; a row with nothing left marked is removed. */
async function writeMark(db: TimeblockDb, key: string, title: string, next: MarkValues): Promise<void> {
  if (!next.important && !next.placeholder && !next.notVacation && next.categoryId === null) {
    await db.delete(eventMarks).where(eq(eventMarks.key, key));
    return;
  }
  const values = { key, title, ...next, updatedAt: new Date().toISOString() };
  await db.insert(eventMarks).values(values).onConflictDoUpdate({ target: eventMarks.key, set: values });
}

async function currentMark(db: TimeblockDb, key: string): Promise<MarkValues> {
  const row = (await db.select().from(eventMarks).where(eq(eventMarks.key, key)).get()) ?? null;
  return {
    important: row?.important ?? false,
    placeholder: row?.placeholder ?? false,
    notVacation: row?.notVacation ?? false,
    categoryId: row?.categoryId ?? null,
  };
}

/** Sets one mark on an event; a row with nothing left marked is removed. */
export async function setMark(db: TimeblockDb, key: string, title: string, field: MarkField, on: boolean): Promise<void> {
  await writeMark(db, key, title, { ...(await currentMark(db, key)), [field]: on });
}

/**
 * Chooses an event's category by hand — on its series key, so every repeat
 * follows: a category id, 'none' for no category even when a title rule
 * matches, or 'rules' to let the title rules decide again.
 */
export async function setEventCategory(db: TimeblockDb, key: string, title: string, choice: number | 'none' | 'rules'): Promise<void> {
  const categoryId = choice === 'rules' ? null : choice === 'none' ? NO_CATEGORY : choice;
  await writeMark(db, key, title, { ...(await currentMark(db, key)), categoryId });
}

/**
 * Gives a new series (a repeating event split in two) the marks of the one it
 * came from: important, placeholder, not-a-vacation and category.
 */
export async function copyMarks(db: TimeblockDb, fromKey: string, toKey: string, title: string): Promise<void> {
  const from = await currentMark(db, fromKey);
  await writeMark(db, toKey, title, from);
}
