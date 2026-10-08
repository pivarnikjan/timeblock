import { DateTime } from 'luxon';
import { parseHexColor } from '../calendar/colors';
import type { EventCategory } from '../db/schema';
import type { Env } from '../env';
import type { EventWrite } from '../google/calendar-api';
import { syncCategoryColors } from '../google/category-colors';
import { changeEventTime, type EventTimeResult, type EventTimeScope } from '../google/event-time';
import { listCalendars } from '../google/reads';
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

export interface NewEventInput {
  title: string;
  /** Local day (`YYYY-MM-DD`) in the Settings timezone. */
  date: string;
  /** Local times (`HH:mm`). Both left out: an all-day event. An end at or before the start ends the next day. */
  startTime?: string | null;
  endTime?: string | null;
  /** All-day events only: the last day it covers (`YYYY-MM-DD`); left out, one day. */
  endDate?: string | null;
  /** The calendar it goes in; left out, the account's primary calendar. */
  calendarId?: string | null;
  description?: string | null;
  location?: string | null;
  /** Google's repeat rules (`RRULE:FREQ=WEEKLY;BYDAY=FR`); left out, it does not repeat. */
  recurrence?: string[] | null;
}

/** A new event worked out, not yet written: where it goes and what Google is sent. */
export interface NewEventPlan {
  calendarId: string;
  calendarName: string;
  allDay: boolean;
  /** UTC ISO instants; for an all-day event, local midnight of its first day and of the day after its last. */
  start: string;
  end: string;
  body: EventWrite;
}

/**
 * Works out an ordinary Google event from what was asked — the calendar, the
 * times in the Settings timezone — and says what is wrong with it, without
 * writing anything. `createEvent` writes it.
 */
export async function planNewEvent(env: Env, input: NewEventInput): Promise<NewEventPlan> {
  const settings = await getSettings(env.db);
  const zone = settings.timezone;
  const title = input.title.trim();
  if (title === '') throw new Error('Give the event a title.');

  const calendars = await listCalendars(env);
  const calendar = input.calendarId ? calendars.find((c) => c.id === input.calendarId) : calendars.find((c) => c.primary);
  if (!calendar) throw new Error(input.calendarId ? `No calendar "${input.calendarId}" is shown in TimeBlock.` : 'The account has no primary calendar — name a calendar.');
  if (calendar.id === settings.targetCalendarId) throw new Error("TimeBlock's own calendar holds its blocks — choose another calendar.");
  if (!calendar.writable) throw new Error(`The calendar "${calendar.summary}" is read-only.`);

  const day = DateTime.fromISO(input.date, { zone });
  if (!day.isValid) throw new Error('Choose a day (YYYY-MM-DD).');

  let start: DateTime;
  let end: DateTime;
  let times: Pick<EventWrite, 'start' | 'end'>;
  const allDay = !input.startTime && !input.endTime;
  if (allDay) {
    const last = input.endDate ? DateTime.fromISO(input.endDate, { zone }) : day;
    if (!last.isValid) throw new Error('The last day must be a date (YYYY-MM-DD).');
    if (last < day) throw new Error('The last day must not be before the first.');
    start = day.startOf('day');
    // Google's all-day end date is exclusive.
    end = last.startOf('day').plus({ days: 1 });
    times = { start: { date: start.toISODate()! }, end: { date: end.toISODate()! } };
  } else {
    if (!input.startTime || !input.endTime) throw new Error('Give both a start and an end time — or neither, for an all-day event.');
    if (input.endDate) throw new Error('A last day is for all-day events only.');
    start = DateTime.fromISO(`${input.date}T${input.startTime}`, { zone });
    end = DateTime.fromISO(`${input.date}T${input.endTime}`, { zone });
    if (!start.isValid || !end.isValid) throw new Error('Times are written HH:mm.');
    if (end <= start) end = end.plus({ days: 1 });
    const time = (dt: DateTime) => ({ dateTime: dt.toISO({ suppressMilliseconds: true })!, timeZone: zone });
    times = { start: time(start), end: time(end) };
  }

  const recurrence = (input.recurrence ?? []).map((line) => line.trim()).filter(Boolean);
  if (recurrence.some((line) => !/^(RRULE|EXDATE|RDATE):/i.test(line))) throw new Error('A repeat rule starts with RRULE: (for example RRULE:FREQ=WEEKLY;BYDAY=FR).');

  const body: EventWrite = { summary: title, ...times };
  if (input.description?.trim()) body.description = input.description.trim();
  if (input.location?.trim()) body.location = input.location.trim();
  if (recurrence.length > 0) body.recurrence = recurrence;
  return { calendarId: calendar.id, calendarName: calendar.summary, allDay, start: start.toUTC().toISO()!, end: end.toUTC().toISO()!, body };
}

/** Creates an ordinary event in one of the account's calendars (never in TimeBlock's own). */
export async function createEvent(env: Env, input: NewEventInput): Promise<{ calendarId: string; eventId: string; htmlLink: string | null }> {
  const plan = await planNewEvent(env, input);
  const created = await env.google.calendar().insertEvent(plan.calendarId, plan.body);
  if (!created.id) throw new Error('Google did not return an id for the new event.');
  return { calendarId: plan.calendarId, eventId: created.id, htmlLink: created.htmlLink ?? null };
}

export interface EventDetails {
  title?: string;
  /** An empty text clears it. */
  description?: string;
  location?: string;
}

/** Changes a Google event's title, description or location — for a repeating event, this occurrence's. */
export async function editEventDetails(env: Env, calendarId: string, eventId: string, details: EventDetails): Promise<void> {
  const settings = await getSettings(env.db);
  if (calendarId === settings.targetCalendarId) throw new Error("TimeBlock's own events are changed as blocks or vacations.");
  const patch: EventWrite = {};
  if (details.title !== undefined) {
    if (details.title.trim() === '') throw new Error('Give the event a title.');
    patch.summary = details.title.trim();
  }
  if (details.description !== undefined) patch.description = details.description.trim();
  if (details.location !== undefined) patch.location = details.location.trim();
  if (Object.keys(patch).length === 0) return;
  await env.google.calendar().patchEvent(calendarId, eventId, patch);
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

/** A category form's values cleaned up, or what is wrong with them. */
function validCategory(input: CategoryInput): { name: string; color: string; keywords: string } | { message: string } {
  const name = input.name.trim();
  const color = parseHexColor(input.color);
  if (name === '') return { message: 'Give the category a name.' };
  if (!color) return { message: 'Choose a colour.' };
  const keywords = input.keywords
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean)
    .join('\n');
  return { name, color, keywords };
}

/** Creates a category, or updates one when `id` is given; events then take its colour in Google too. */
export async function saveCategory(env: Env, input: CategoryInput, id?: number): Promise<CategorySaved> {
  const valid = validCategory(input);
  if ('message' in valid) return { ok: false, message: valid.message };
  const { name, color, keywords } = valid;
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

/**
 * The event panel's "+ New category…": creates a category and puts this event
 * in it (for a repeating event, every repeat). Other events whose titles hold
 * its words follow; every one of them takes its colour in Google too.
 */
export async function createCategoryForEvent(env: Env, key: string, title: string, input: CategoryInput): Promise<CategorySaved> {
  const valid = validCategory(input);
  if ('message' in valid) return { ok: false, message: valid.message };
  const category = await createCategory(env.db, valid);
  await setEventCategory(env.db, key, title, category.id);
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
