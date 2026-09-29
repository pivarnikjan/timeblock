'use server';

import { DateTime } from 'luxon';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { num } from '@/lib/forms';
import type { ConflictTarget } from '@/lib/calendar/vacation-conflicts';
import { deleteCalendarEvent } from '@/lib/google/calendar';
import { deleteBlockEverywhere, removeVacationEvent, syncVacationEvent } from '@/lib/google/sync';
import * as blockRepo from '@/lib/repo/blocks';
import { getSettings } from '@/lib/repo/settings';
import { deleteVacation, getVacation, insertVacation, setVacationEvent, updateVacation } from '@/lib/repo/vacations';
import { listWindows } from '@/lib/repo/windows';
import { ANYTIME, closedWindows, formatWindows } from '@/lib/vacation';

export type VacationFormState =
  | { kind: 'idle' }
  /** `warning`: saved in TimeBlock, but Google Calendar could not be brought in line. */
  | { kind: 'saved'; id: number; date: string; at: number; warning: string | null }
  | { kind: 'error'; message: string };

/**
 * Creates a vacation, or updates one when the form carries an `id`. From and
 * until are local date-times in the Settings timezone; an end of 23:59 means
 * the end of that day, so a week away is entered as Mon 00:00 – Fri 23:59.
 */
export async function saveVacationAction(_prev: VacationFormState, form: FormData): Promise<VacationFormState> {
  const { timezone } = await getSettings();
  const read = (name: string) => DateTime.fromISO(String(form.get(name) ?? ''), { zone: timezone });
  const start = read('from');
  let end = read('to');
  if (!start.isValid || !end.isValid) return { kind: 'error', message: 'Enter both a start and an end.' };
  if (end.hour === 23 && end.minute === 59) end = end.plus({ minutes: 1 }).startOf('minute');
  if (end <= start) return { kind: 'error', message: 'The vacation must end after it starts.' };

  const ids = form.getAll('window').flatMap((v) => (v === ANYTIME ? [null] : Number.isInteger(Number(v)) ? [Number(v)] : []));
  if (ids.length === 0) return { kind: 'error', message: 'Choose at least one time window the vacation closes.' };

  const note = String(form.get('note') ?? '').trim();
  const values = {
    startsAt: start.toUTC().toISO()!,
    endsAt: end.toUTC().toISO()!,
    windows: formatWindows(ids),
    note: note || null,
    inGoogle: form.get('google') === 'on',
  };
  const existing = Number(form.get('id'));
  let id: number;
  if (Number.isInteger(existing) && existing > 0) {
    await updateVacation(existing, values);
    id = existing;
  } else {
    // Made from a Google event: that occurrence stops counting as busy, and is not asked about again.
    const sourceEvent = String(form.get('sourceEvent') ?? '').trim() || null;
    id = await insertVacation({ ...values, sourceEvent });
  }
  const warning = await mirrorInGoogle(id);
  revalidatePath('/', 'layout');
  return { kind: 'saved', id, date: start.toISODate()!, at: Date.now(), warning };
}

/**
 * After a save: create, update or remove the vacation's Google copy to match
 * its "Also show in Google Calendar" box. A failure leaves the vacation saved
 * and is reported; saving again retries.
 */
async function mirrorInGoogle(id: number): Promise<string | null> {
  const v = await getVacation(id);
  if (!v || (!v.inGoogle && !v.googleEventId)) return null;
  try {
    const names = new Map<number | null, string>([...(await listWindows()).map((w) => [w.id, w.name] as const), [null, 'Anytime']]);
    const eventId = await syncVacationEvent(v, closedWindows(v).flatMap((w) => names.get(w) ?? []));
    if (eventId !== v.googleEventId) await setVacationEvent(id, eventId);
    return null;
  } catch (error) {
    return `Saved, but Google Calendar could not be updated (${(error as Error).message}). Save again to retry.`;
  }
}

/**
 * A vacation made from a Google event that has since moved there: takes the
 * event's new start and end (its windows and note stay).
 */
export async function matchEventAction(form: FormData): Promise<void> {
  const id = num(form, 'id');
  const startsAt = DateTime.fromISO(String(form.get('start') ?? ''));
  const endsAt = DateTime.fromISO(String(form.get('end') ?? ''));
  if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) throw new Error('The event has no usable start and end.');
  await updateVacation(id, { startsAt: startsAt.toUTC().toISO()!, endsAt: endsAt.toUTC().toISO()! });
  const warning = await mirrorInGoogle(id);
  if (warning) throw new Error(warning);
  revalidatePath('/', 'layout');
}

/**
 * Removes a vacation; its windows open again for planning. Its Google copy
 * goes first, so if Google refuses, nothing changes.
 */
export async function deleteVacationAction(form: FormData): Promise<void> {
  const v = await getVacation(num(form, 'id'));
  if (!v) return;
  await removeVacationEvent(v);
  await deleteVacation(v.id);
  revalidatePath('/', 'layout');
  const to = String(form.get('returnTo') ?? '');
  if (to.startsWith('/calendar')) redirect(to);
}

export type CleanupState =
  | { kind: 'idle' }
  | { kind: 'done'; deleted: number; failed: { title: string; message: string }[]; at: number };

function parseTarget(value: FormDataEntryValue): ConflictTarget | null {
  try {
    const t = JSON.parse(String(value)) as Partial<ConflictTarget> & Record<string, unknown>;
    if (t.kind === 'event' && typeof t.calendarId === 'string' && typeof t.eventId === 'string') {
      return { kind: 'event', calendarId: t.calendarId, eventId: t.eventId };
    }
    if (t.kind === 'block' && Number.isInteger(t.id)) return { kind: 'block', id: Number(t.id) };
  } catch {
    // ignored: not one of ours
  }
  return null;
}

/**
 * Deletes the events and blocks ticked in a vacation's "Scheduled during this
 * vacation" list — from Google Calendar too. One failure does not stop the
 * rest; each is reported. TimeBlock's own calendar is only touched via blocks.
 */
export async function deleteDuringVacationAction(_prev: CleanupState, form: FormData): Promise<CleanupState> {
  const { targetCalendarId } = await getSettings();
  const failed: { title: string; message: string }[] = [];
  let deleted = 0;

  for (const raw of form.getAll('item')) {
    const target = parseTarget(raw);
    const title = String(form.get(`title:${raw}`) ?? 'an item');
    if (!target) continue;
    try {
      if (target.kind === 'event') {
        if (target.calendarId === targetCalendarId) throw new Error("TimeBlock's own blocks are deleted as blocks.");
        await deleteCalendarEvent(target.calendarId, target.eventId);
      } else {
        const block = await blockRepo.getBlock(target.id);
        if (block) await deleteBlockEverywhere(block);
      }
      deleted += 1;
    } catch (error) {
      failed.push({ title, message: (error as Error).message });
    }
  }

  revalidatePath('/', 'layout');
  return { kind: 'done', deleted, failed, at: Date.now() };
}
