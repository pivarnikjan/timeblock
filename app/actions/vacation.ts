'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { num } from '@/lib/forms';
import { withEnv } from '@/lib/env';
import type { ConflictTarget } from '@/lib/calendar/vacation-conflicts';
import { ANYTIME } from '@timeblock/core/vacation';
import * as ops from '@timeblock/core/operations/vacation';

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
  const existing = Number(form.get('id'));
  const result = await withEnv(ops.saveVacation)({
    from: String(form.get('from') ?? ''),
    to: String(form.get('to') ?? ''),
    windowIds: form.getAll('window').flatMap((v) => (v === ANYTIME ? [null] : Number.isInteger(Number(v)) ? [Number(v)] : [])),
    note: String(form.get('note') ?? ''),
    inGoogle: form.get('google') === 'on',
    id: Number.isInteger(existing) && existing > 0 ? existing : null,
    sourceEvent: String(form.get('sourceEvent') ?? ''),
  });
  if (!result.ok) return { kind: 'error', message: result.message };
  revalidatePath('/', 'layout');
  return { kind: 'saved', id: result.id, date: result.date, at: Date.now(), warning: result.warning };
}

/**
 * A vacation made from a Google event that has since moved there: takes the
 * event's new start and end (its windows and note stay).
 */
export async function matchEventAction(form: FormData): Promise<void> {
  await withEnv(ops.matchVacationToEvent)(num(form, 'id'), String(form.get('start') ?? ''), String(form.get('end') ?? ''));
  revalidatePath('/', 'layout');
}

/**
 * Removes a vacation; its windows open again for planning. Its Google copy
 * goes first, so if Google refuses, nothing changes.
 */
export async function deleteVacationAction(form: FormData): Promise<void> {
  await withEnv(ops.removeVacation)(num(form, 'id'));
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
  const items = form.getAll('item').flatMap((raw) => {
    const target = parseTarget(raw);
    return target ? [{ target, title: String(form.get(`title:${raw}`) ?? 'an item') }] : [];
  });
  const { deleted, failed } = await withEnv(ops.deleteDuringVacation)(items);
  revalidatePath('/', 'layout');
  return { kind: 'done', deleted, failed, at: Date.now() };
}
