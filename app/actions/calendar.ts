'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { VIEWS } from '@/lib/calendar/views';
import { enumOf, str } from '@/lib/forms';
import { deleteCalendarEvent } from '@/lib/google/calendar';
import { setMark } from '@/lib/repo/event-marks';
import { getSettings, updateCalendarFilters, updateSettings } from '@/lib/repo/settings';

// The checkboxes post the state they switch to: "1" = shown (ticked), anything
// else = hidden from the view.
const shown = (form: FormData) => form.get('on') === '1';

function refresh() {
  revalidatePath('/calendar');
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
  const calendarId = str(form, 'calendarId');
  const settings = await getSettings();
  if (calendarId === settings.targetCalendarId) throw new Error("TimeBlock's own blocks are deleted as blocks.");
  await deleteCalendarEvent(calendarId, str(form, 'eventId'));
  revalidatePath('/', 'layout');
  redirect(backToCalendar(form));
}
