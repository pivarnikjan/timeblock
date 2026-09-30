import { eq } from 'drizzle-orm';
import { parseFilters, type CalendarFilters } from '../calendar/filters';
import { settings, type Settings } from '../db/schema';
import type { TimeblockDb } from '../env';

/** The settings singleton. Seeded on first database open, so this never returns undefined. */
export async function getSettings(db: TimeblockDb): Promise<Settings> {
  const row = await db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('Settings row missing — database was not seeded');
  return row;
}

export async function getCalendarFilters(db: TimeblockDb): Promise<CalendarFilters> {
  return parseFilters((await getSettings(db)).calendarFilters);
}

/** Read-modify-write of the Calendar's grey-out state. */
export async function updateCalendarFilters(db: TimeblockDb, change: (current: CalendarFilters) => CalendarFilters): Promise<void> {
  const next = change(await getCalendarFilters(db));
  await updateSettings(db, { calendarFilters: JSON.stringify(next) });
}

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'updatedAt'>>;

export async function updateSettings(db: TimeblockDb, patch: SettingsPatch): Promise<Settings> {
  await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(settings.id, 1));
  return getSettings(db);
}
