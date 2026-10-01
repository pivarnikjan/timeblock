import { DateTime } from 'luxon';
import { parseHexColor } from '../calendar/colors';
import type { EventCategory } from '../db/schema';
import type { Env } from '../env';
import { syncCategoryColors } from '../google/category-colors';
import { changeEventTime, type EventTimeResult, type EventTimeScope } from '../google/event-time';
import { createCategory, deleteCategory, updateCategory } from '../store/categories';
import { setEventCategory } from '../store/event-marks';
import { getSettings } from '../store/settings';

/**
 * What the event panel and Settings → Categories do — the same on the desktop
 * and the phone.
 */

export interface EventTimeInput {
  calendarId: string;
  eventId: string;
  seriesId: string;
  /** Local day and times (`YYYY-MM-DD`, `HH:mm`) in the Settings timezone. An end at or before the start ends the next day. */
  date: string;
  startTime: string;
  endTime: string;
  scope: EventTimeScope;
}

/** Moves a Google event to a new time on a day — this occurrence, or this and following. */
export async function editEventTime(env: Env, input: EventTimeInput): Promise<EventTimeResult> {
  const { timezone } = await getSettings(env.db);
  const start = DateTime.fromISO(`${input.date}T${input.startTime}`, { zone: timezone });
  let end = DateTime.fromISO(`${input.date}T${input.endTime}`, { zone: timezone });
  if (!start.isValid || !end.isValid) throw new Error('Choose a day, a start and an end.');
  if (end <= start) end = end.plus({ days: 1 });
  return changeEventTime(env, {
    calendarId: input.calendarId,
    eventId: input.eventId,
    seriesId: input.seriesId,
    start: start.toUTC().toISO()!,
    end: end.toUTC().toISO()!,
    scope: input.scope,
  });
}

/** The sentence for a Google repaint that failed — the change itself is saved either way. */
const repaintWarning = (error: unknown) =>
  `Saved, but Google Calendar could not be recoloured (${(error as Error).message}). Settings → Categories → Apply category colours retries.`;

/**
 * Chooses an event's category (for a repeating event, every repeat) and gives
 * it that colour in Google too. Returns a warning when Google could not be
 * recoloured — the choice is saved regardless, and TimeBlock shows it.
 */
export async function chooseEventCategory(env: Env, key: string, title: string, choice: number | 'none' | 'rules'): Promise<string | null> {
  await setEventCategory(env.db, key, title, choice);
  try {
    await syncCategoryColors(env, new Set([key]));
    return null;
  } catch (error) {
    return repaintWarning(error);
  }
}

export interface CategoryInput {
  name: string;
  color: string;
  keywords: string;
}

export type CategorySaved = { ok: true; category: EventCategory | null; warning: string | null } | { ok: false; message: string };

/** Creates a category, or updates one when `id` is given; events then take its colour in Google too. */
export async function saveCategory(env: Env, input: CategoryInput, id?: number): Promise<CategorySaved> {
  const name = input.name.trim();
  const color = parseHexColor(input.color);
  if (name === '') return { ok: false, message: 'Give the category a name.' };
  if (!color) return { ok: false, message: 'Choose a colour.' };
  const keywords = input.keywords
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean)
    .join('\n');
  let category: EventCategory | null = null;
  if (id) await updateCategory(env.db, id, { name, color, keywords });
  else category = await createCategory(env.db, { name, color, keywords });
  try {
    await syncCategoryColors(env);
    return { ok: true, category, warning: null };
  } catch (error) {
    return { ok: true, category, warning: repaintWarning(error) };
  }
}

/** Deletes a category: its events go back to the title rules, and lose the colour it gave them in Google. */
export async function removeCategory(env: Env, id: number): Promise<string | null> {
  await deleteCategory(env.db, id);
  try {
    await syncCategoryColors(env);
    return null;
  } catch (error) {
    return repaintWarning(error);
  }
}
