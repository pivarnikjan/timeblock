import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings, type Settings } from '@timeblock/core/db/schema';
import { parseFilters, type CalendarFilters } from '@timeblock/core/calendar/filters';

/** The settings singleton. Seeded on first database open, so this never returns undefined. */
export async function getSettings(): Promise<Settings> {
  const row = await db().select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('Settings row missing — database was not seeded');
  return row;
}

export async function getCalendarFilters(): Promise<CalendarFilters> {
  return parseFilters((await getSettings()).calendarFilters);
}

/** Read-modify-write of the Calendar's grey-out state. */
export async function updateCalendarFilters(change: (current: CalendarFilters) => CalendarFilters): Promise<void> {
  const next = change(await getCalendarFilters());
  await updateSettings({ calendarFilters: JSON.stringify(next) });
}

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'updatedAt'>>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  await db()
    .update(settings)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(settings.id, 1));
  return getSettings();
}
