import 'server-only';
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { vacations, type Vacation } from '@/lib/db/schema';

/** Vacations that have not ended by `after` (UTC ISO), earliest first — all when omitted. */
export async function listVacations(after?: string): Promise<Vacation[]> {
  const q = db().select().from(vacations);
  return (after ? q.where(gt(vacations.endsAt, after)) : q).orderBy(asc(vacations.startsAt));
}

/** Vacations overlapping [from, to) (UTC ISO). */
export async function vacationsBetween(from: string, to: string): Promise<Vacation[]> {
  return db()
    .select()
    .from(vacations)
    .where(and(lt(vacations.startsAt, to), gt(vacations.endsAt, from)))
    .orderBy(asc(vacations.startsAt));
}

export async function getVacation(id: number): Promise<Vacation | null> {
  return (await db().select().from(vacations).where(eq(vacations.id, id)).get()) ?? null;
}

export interface VacationValues {
  startsAt: string;
  endsAt: string;
  windows: string;
  note: string | null;
  inGoogle: boolean;
}

/** Creates a vacation and returns its id. */
export async function insertVacation(values: VacationValues): Promise<number> {
  const [row] = await db().insert(vacations).values(values).returning({ id: vacations.id });
  return row.id;
}

export async function updateVacation(id: number, values: VacationValues): Promise<void> {
  await db().update(vacations).set(values).where(eq(vacations.id, id));
}

/** Remembers (or forgets, with null) the Google event mirroring a vacation. */
export async function setVacationEvent(id: number, googleEventId: string | null): Promise<void> {
  await db().update(vacations).set({ googleEventId }).where(eq(vacations.id, id));
}

export async function deleteVacation(id: number): Promise<void> {
  await db().delete(vacations).where(eq(vacations.id, id));
}
