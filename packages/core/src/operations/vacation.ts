import { DateTime } from 'luxon';
import type { ConflictTarget } from '../calendar/vacation-conflicts';
import type { Env } from '../env';
import { deleteCalendarEvent } from '../google/reads';
import { deleteBlockEverywhere, removeVacationEvent, syncVacationEvent } from '../google/writes';
import * as blockStore from '../store/blocks';
import { getSettings } from '../store/settings';
import { deleteVacation, getVacation, insertVacation, setVacationEvent, updateVacation } from '../store/vacations';
import { listWindows } from '../store/windows';
import { closedWindows, formatWindows } from '../vacation';

export interface VacationInput {
  /** Local date-times (`2026-10-05T00:00`) in the Settings timezone. */
  from: string;
  /** An end of 23:59 means the end of that day, so a week away is Mon 00:00 – Fri 23:59. */
  to: string;
  /** Windows the vacation closes; `null` is Anytime (work with no window). */
  windowIds: (number | null)[];
  note: string;
  inGoogle: boolean;
  /** Set to update an existing vacation. */
  id?: number | null;
  /** When made from a Google event (`calendarId|eventId`): that occurrence stops counting as busy. */
  sourceEvent?: string | null;
}

export type VacationSaved =
  /** `warning`: saved in TimeBlock, but Google Calendar could not be brought in line. */
  | { ok: true; id: number; date: string; warning: string | null }
  | { ok: false; message: string };

/** Creates a vacation, or updates one when the input carries an `id`. */
export async function saveVacation(env: Env, input: VacationInput): Promise<VacationSaved> {
  const { timezone } = await getSettings(env.db);
  const start = DateTime.fromISO(input.from, { zone: timezone });
  let end = DateTime.fromISO(input.to, { zone: timezone });
  if (!start.isValid || !end.isValid) return { ok: false, message: 'Enter both a start and an end.' };
  if (end.hour === 23 && end.minute === 59) end = end.plus({ minutes: 1 }).startOf('minute');
  if (end <= start) return { ok: false, message: 'The vacation must end after it starts.' };
  if (input.windowIds.length === 0) return { ok: false, message: 'Choose at least one time window the vacation closes.' };

  const note = input.note.trim();
  const values = {
    startsAt: start.toUTC().toISO()!,
    endsAt: end.toUTC().toISO()!,
    windows: formatWindows(input.windowIds),
    note: note || null,
    inGoogle: input.inGoogle,
  };
  let id: number;
  if (input.id && input.id > 0) {
    await updateVacation(env.db, input.id, values);
    id = input.id;
  } else {
    id = await insertVacation(env.db, { ...values, sourceEvent: input.sourceEvent?.trim() || null });
  }
  const warning = await mirrorInGoogle(env, id);
  return { ok: true, id, date: start.toISODate()!, warning };
}

/**
 * After a save: create, update or remove the vacation's Google copy to match
 * its "Also show in Google Calendar" box. A failure leaves the vacation saved
 * and is reported; saving again retries.
 */
async function mirrorInGoogle(env: Env, id: number): Promise<string | null> {
  const v = await getVacation(env.db, id);
  if (!v || (!v.inGoogle && !v.googleEventId)) return null;
  try {
    const names = new Map<number | null, string>([...(await listWindows(env.db)).map((w) => [w.id, w.name] as const), [null, 'Anytime']]);
    const eventId = await syncVacationEvent(env, v, closedWindows(v).flatMap((w) => names.get(w) ?? []));
    if (eventId !== v.googleEventId) await setVacationEvent(env.db, id, eventId);
    return null;
  } catch (error) {
    return `Saved, but Google Calendar could not be updated (${(error as Error).message}). Save again to retry.`;
  }
}

/**
 * A vacation made from a Google event that has since moved there: takes the
 * event's new start and end (its windows and note stay).
 */
export async function matchVacationToEvent(env: Env, id: number, start: string, end: string): Promise<void> {
  const startsAt = DateTime.fromISO(start);
  const endsAt = DateTime.fromISO(end);
  if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) throw new Error('The event has no usable start and end.');
  await updateVacation(env.db, id, { startsAt: startsAt.toUTC().toISO()!, endsAt: endsAt.toUTC().toISO()! });
  const warning = await mirrorInGoogle(env, id);
  if (warning) throw new Error(warning);
}

/**
 * Removes a vacation; its windows open again for planning. Its Google copy
 * goes first, so if Google refuses, nothing changes.
 */
export async function removeVacation(env: Env, id: number): Promise<void> {
  const v = await getVacation(env.db, id);
  if (!v) return;
  await removeVacationEvent(env, v);
  await deleteVacation(env.db, v.id);
}

export interface CleanupResult {
  deleted: number;
  failed: { title: string; message: string }[];
}

/**
 * Deletes the events and blocks picked in a vacation's "Scheduled during this
 * vacation" list — from Google Calendar too. One failure does not stop the
 * rest; each is reported. TimeBlock's own calendar is only touched via blocks.
 */
export async function deleteDuringVacation(env: Env, items: { target: ConflictTarget; title: string }[]): Promise<CleanupResult> {
  const { targetCalendarId } = await getSettings(env.db);
  const result: CleanupResult = { deleted: 0, failed: [] };
  for (const { target, title } of items) {
    try {
      if (target.kind === 'event') {
        if (target.calendarId === targetCalendarId) throw new Error("TimeBlock's own blocks are deleted as blocks.");
        await deleteCalendarEvent(env, target.calendarId, target.eventId);
      } else {
        const block = await blockStore.getBlock(env.db, target.id);
        if (block) await deleteBlockEverywhere(env, block);
      }
      result.deleted += 1;
    } catch (error) {
      result.failed.push({ title, message: (error as Error).message });
    }
  }
  return result;
}

/**
 * Deletes a Google event from its calendar — for a repeating event, only this
 * occurrence. TimeBlock's own calendar is managed through its blocks, never
 * from here.
 */
export async function deleteGoogleEvent(env: Env, calendarId: string, eventId: string): Promise<void> {
  const settings = await getSettings(env.db);
  if (calendarId === settings.targetCalendarId) throw new Error("TimeBlock's own blocks are deleted as blocks.");
  await deleteCalendarEvent(env, calendarId, eventId);
}
