'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { VIEWS } from '@timeblock/core/calendar/views';
import { enumOf, str } from '@/lib/forms';
import { forgetGoogleReads, withEnv } from '@/lib/env';
import { deleteGoogleEvent } from '@timeblock/core/operations/vacation';
import { DateTime } from 'luxon';
import { changeEventTime, type EventTimeScope } from '@timeblock/core/google/event-time';
import { chooseEventCategory, createCategoryForEvent } from '@timeblock/core/operations/events';
import { setBlockTime } from '@timeblock/core/operations/plan';
import { setMark } from '@/lib/repo/event-marks';
import { updateCalendarFilters, updateSettings } from '@/lib/repo/settings';

// The checkboxes post the state they switch to: "1" = shown (ticked), anything
// else = hidden from the view.
const shown = (form: FormData) => form.get('on') === '1';

function refresh() {
  revalidatePath('/calendar');
}

/**
 * The Calendar's Refresh button: Google Calendar is read again now, rather than
 * reusing what was read in the last few minutes — for a meeting just added there.
 */
export async function refreshCalendarAction(): Promise<void> {
  forgetGoogleReads();
  revalidatePath('/', 'layout');
}

/** Calendar checkbox in Settings → Calendar: unticked hides that calendar's events. */
export async function toggleCalendarAction(form: FormData): Promise<void> {
  const id = str(form, 'calendarId');
  const on = shown(form);
  await updateCalendarFilters((f) => ({
    ...f,
    hiddenCalendars: on ? f.hiddenCalendars.filter((c) => c !== id) : [...new Set([...f.hiddenCalendars, id])],
  }));
  revalidatePath('/', 'layout');
}

/** "TimeBlock plan" checkbox. */
export async function togglePlanAction(form: FormData): Promise<void> {
  const on = shown(form);
  await updateCalendarFilters((f) => ({ ...f, hidePlan: !on }));
  refresh();
}

/** "Show in front": draw time-window bands and names over the blocks instead of behind them. */
export async function toggleWindowsFrontAction(form: FormData): Promise<void> {
  const on = shown(form);
  await updateCalendarFilters((f) => ({ ...f, windowsInFront: on }));
  refresh();
}

/** The checkbox on an event: unticked hides it — every instance, for a recurring event. */
export async function toggleEventAction(form: FormData): Promise<void> {
  const key = str(form, 'eventKey');
  const title = String(form.get('title') ?? '');
  const on = shown(form);
  await updateCalendarFilters((f) => {
    const hiddenEvents = { ...f.hiddenEvents };
    if (on) delete hiddenEvents[key];
    else hiddenEvents[key] = title;
    return { ...f, hiddenEvents };
  });
  refresh();
}

/** "Only multi-day events" — a Month switch, for condensed days. */
export async function toggleMultiDayOnlyAction(form: FormData): Promise<void> {
  const on = form.get('on') === '1';
  await updateCalendarFilters((f) => ({
    ...f,
    multiDayOnly: on ? ['month'] : [],
  }));
  refresh();
}

/** Brings one hidden event back, or all of them. */
export async function restoreEventsAction(form: FormData): Promise<void> {
  const key = form.get('eventKey');
  await updateCalendarFilters((f) => {
    if (typeof key !== 'string' || key === '') return { ...f, hiddenEvents: {} };
    const hiddenEvents = { ...f.hiddenEvents };
    delete hiddenEvents[key];
    return { ...f, hiddenEvents };
  });
  revalidatePath('/', 'layout');
}

export async function updateCalendarSettingsAction(form: FormData): Promise<void> {
  const start = str(form, 'calendarStart');
  const end = str(form, 'calendarEnd');
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const endMin = eh * 60 + em === 0 ? 24 * 60 : eh * 60 + em;
  if (endMin <= sh * 60 + sm) throw new Error(`The calendar must end after it starts (${start}–${end}); use 00:00 for midnight.`);

  await updateSettings({
    calendarStart: start,
    calendarEnd: end,
    calendarView: enumOf(form, 'calendarView', VIEWS, 'day'),
  });
  revalidatePath('/', 'layout');
}

/**
 * Where to go after an action that closes the event panel: the Calendar view
 * it was opened from. Only Calendar URLs are accepted.
 */
function backToCalendar(form: FormData): string {
  const to = String(form.get('returnTo') ?? '');
  return to.startsWith('/calendar') ? to : '/calendar';
}

/** The event panel's checkboxes: "Important in Month" and "Placeholder". */
export async function setEventMarkAction(form: FormData): Promise<void> {
  const field = form.get('field');
  if (field !== 'important' && field !== 'placeholder') throw new Error('Unknown mark.');
  await setMark(str(form, 'key'), String(form.get('title') ?? ''), field, shown(form));
  revalidatePath('/', 'layout');
}

/**
 * A multi-day event's answer to "is it a vacation?": `not` = '1' says no (for
 * every repeat), so it is not asked about again; '0' takes that back.
 */
export async function setNotVacationAction(form: FormData): Promise<void> {
  await setMark(str(form, 'key'), String(form.get('title') ?? ''), 'notVacation', form.get('not') === '1');
  revalidatePath('/', 'layout');
}

/**
 * Deletes a Google event from its calendar — for a repeating event, only this
 * occurrence — and closes the panel. TimeBlock's own calendar is managed
 * through its blocks, never from here.
 */
export async function deleteEventAction(form: FormData): Promise<void> {
  await withEnv(deleteGoogleEvent)(str(form, 'calendarId'), str(form, 'eventId'));
  revalidatePath('/', 'layout');
  redirect(backToCalendar(form));
}

// ── Categories and event times ─────────────────────────────────────────────

export type EventEditState =
  | { kind: 'idle' }
  | { kind: 'saved'; at: number; warning: string | null }
  | { kind: 'error'; message: string };

/**
 * The event panel's Category picker: a category, 'none', 'rules' (let the
 * title words decide), or 'new' (create one from the form's name, colour and
 * title words, and put the event in it). On the event's series, so every
 * repeat follows; the colour follows in Google too.
 */
export async function setEventCategoryAction(_prev: EventEditState, form: FormData): Promise<EventEditState> {
  const raw = str(form, 'choice');
  if (raw === 'new') {
    const created = await withEnv(createCategoryForEvent)(str(form, 'key'), String(form.get('title') ?? ''), {
      name: String(form.get('name') ?? ''),
      color: String(form.get('color') ?? ''),
      keywords: String(form.get('keywords') ?? ''),
    });
    if (!created.ok) return { kind: 'error', message: created.message };
    revalidatePath('/', 'layout');
    return { kind: 'saved', at: Date.now(), warning: created.warning };
  }
  const choice = raw === 'none' || raw === 'rules' ? raw : Number(raw);
  if (typeof choice === 'number' && !Number.isInteger(choice)) return { kind: 'error', message: 'Unknown category.' };
  const warning = await withEnv(chooseEventCategory)(str(form, 'key'), String(form.get('title') ?? ''), choice);
  revalidatePath('/', 'layout');
  return { kind: 'saved', at: Date.now(), warning };
}

/** One unsaved change from the calendar: a Google event or a block with a new start and end (ISO instants). */
export type CalendarEdit =
  | { id: string; kind: 'event'; calendarId: string; eventId: string; seriesId: string; start: string; end: string; scope: EventTimeScope }
  | { id: string; kind: 'block'; blockId: number; start: string; end: string };

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/**
 * Saves the calendar's unsaved changes — moved or resized on the grid, or
 * edited in the event panel — one by one: an event's new time goes to Google
 * (a repeating one for this occurrence, or this and following), a block moves
 * with its Google event. Returns what failed, by edit id; the rest is saved.
 */
export async function saveCalendarEditsAction(edits: CalendarEdit[]): Promise<{ id: string; error: string }[]> {
  const failed: { id: string; error: string }[] = [];
  const moveEvent = withEnv(changeEventTime);
  const retimeBlock = withEnv(setBlockTime);
  for (const edit of Array.isArray(edits) ? edits : []) {
    const id = text(edit?.id) ?? '?';
    try {
      const start = text(edit.start);
      const end = text(edit.end);
      if (!start || !end) throw new Error('Choose a start and an end.');
      if (edit.kind === 'block') {
        if (!Number.isInteger(edit.blockId)) throw new Error('Unknown block.');
        await retimeBlock(edit.blockId, start, end);
      } else if (edit.kind === 'event') {
        const calendarId = text(edit.calendarId);
        const eventId = text(edit.eventId);
        const seriesId = text(edit.seriesId);
        if (!calendarId || !eventId || !seriesId) throw new Error('Unknown event.');
        if (!(DateTime.fromISO(end) > DateTime.fromISO(start))) throw new Error('The end must come after the start.');
        await moveEvent({ calendarId, eventId, seriesId, start, end, scope: edit.scope === 'following' ? 'following' : 'this' });
      } else {
        throw new Error('Unknown change.');
      }
    } catch (error) {
      failed.push({ id, error: (error as Error).message });
    }
  }
  revalidatePath('/', 'layout');
  return failed;
}
