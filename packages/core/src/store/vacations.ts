import { and, asc, eq, gt, isNotNull, lt } from 'drizzle-orm';
import { vacations, type Vacation } from '../db/schema';
import type { TimeblockDb } from '../env';

/** Vacations that have not ended by `after` (UTC ISO), earliest first — all when omitted. */
export async function listVacations(db: TimeblockDb, after?: string): Promise<Vacation[]> {
  const q = db.select().from(vacations);
  return (after ? q.where(gt(vacations.endsAt, after)) : q).orderBy(asc(vacations.startsAt));
}

/** Vacations overlapping [from, to) (UTC ISO). */
export async function vacationsBetween(db: TimeblockDb, from: string, to: string): Promise<Vacation[]> {
  return db
    .select()
    .from(vacations)
    .where(and(lt(vacations.startsAt, to), gt(vacations.endsAt, from)))
    .orderBy(asc(vacations.startsAt));
}

export async function getVacation(db: TimeblockDb, id: number): Promise<Vacation | null> {
  return (await db.select().from(vacations).where(eq(vacations.id, id)).get()) ?? null;
}

export interface VacationValues {
  startsAt: string;
  endsAt: string;
  windows: string;
  note: string | null;
  inGoogle: boolean;
  /** Set when it was made from a Google event (`calendarId|eventId`); kept on later edits. */
  sourceEvent?: string | null;
}

/** Creates a vacation and returns its id. */
export async function insertVacation(db: TimeblockDb, values: VacationValues): Promise<number> {
  const [row] = await db.insert(vacations).values(values).returning({ id: vacations.id });
  return row.id;
}

/** Vacations made from a Google event, by that event (`calendarId|eventId`). */
export async function vacationsBySourceEvent(db: TimeblockDb): Promise<Map<string, Vacation>> {
  const rows = await db.select().from(vacations).where(isNotNull(vacations.sourceEvent));
  return new Map(rows.map((v) => [v.sourceEvent!, v]));
}

export async function updateVacation(db: TimeblockDb, id: number, values: Partial<VacationValues>): Promise<void> {
  await db.update(vacations).set(values).where(eq(vacations.id, id));
}

/** Remembers (or forgets, with null) the Google event mirroring a vacation. */
export async function setVacationEvent(db: TimeblockDb, id: number, googleEventId: string | null): Promise<void> {
  await db.update(vacations).set({ googleEventId }).where(eq(vacations.id, id));
}

export async function deleteVacation(db: TimeblockDb, id: number): Promise<void> {
  await db.delete(vacations).where(eq(vacations.id, id));
}
