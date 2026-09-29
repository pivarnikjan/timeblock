import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { eventMarks, type EventMark } from '@/lib/db/schema';
import { vacationsBySourceEvent } from './vacations';

export type MarkField = 'important' | 'placeholder' | 'notVacation';

/** Every mark, by event key. */
export async function listMarks(): Promise<Map<string, EventMark>> {
  const rows = await db().select().from(eventMarks);
  return new Map(rows.map((r) => [r.key, r]));
}

/**
 * Keys of events the planner may schedule over: placeholders (series keys) and
 * occurrences turned into a vacation (occurrence keys) — see `busySpans`.
 */
export async function freeEventKeys(): Promise<Set<string>> {
  const [rows, converted] = await Promise.all([
    db().select({ key: eventMarks.key }).from(eventMarks).where(eq(eventMarks.placeholder, true)),
    vacationsBySourceEvent(),
  ]);
  return new Set([...rows.map((r) => r.key), ...converted.keys()]);
}

/** Sets one mark on an event; a row with nothing left marked is removed. */
export async function setMark(key: string, title: string, field: MarkField, on: boolean): Promise<void> {
  const current = (await db().select().from(eventMarks).where(eq(eventMarks.key, key)).get()) ?? null;
  const next = {
    important: field === 'important' ? on : (current?.important ?? false),
    placeholder: field === 'placeholder' ? on : (current?.placeholder ?? false),
    notVacation: field === 'notVacation' ? on : (current?.notVacation ?? false),
  };
  if (!next.important && !next.placeholder && !next.notVacation) {
    await db().delete(eventMarks).where(eq(eventMarks.key, key));
    return;
  }
  const values = { key, title, ...next, updatedAt: new Date().toISOString() };
  await db().insert(eventMarks).values(values).onConflictDoUpdate({ target: eventMarks.key, set: values });
}
