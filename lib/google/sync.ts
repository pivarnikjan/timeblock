import 'server-only';
import { indexHorizons } from '@/lib/hierarchy';
import * as blockRepo from '@/lib/repo/blocks';
import { listAllHorizons } from '@/lib/repo/horizons';
import { getSettings, updateSettings } from '@/lib/repo/settings';
import { BLOCK_ID_KEY } from './calendar';
import { calendarApi } from './client';
import { eventContent } from './event-content';

const CALENDAR_NAME = 'TimeBlock — Focus';

/**
 * TimeBlock writes only into its own secondary calendar. Nothing it does can
 * then touch a real meeting, and the whole day's blocks can be hidden with one
 * checkbox in Google Calendar.
 */
export async function ensureTargetCalendar(): Promise<string> {
  const settings = await getSettings();
  const api = calendarApi();

  if (settings.targetCalendarId) {
    try {
      await api.calendars.get({ calendarId: settings.targetCalendarId });
      return settings.targetCalendarId;
    } catch {
      // Deleted on the Google side — fall through and make a new one.
    }
  }

  const existing = await api.calendarList.list({ maxResults: 250, showHidden: true });
  const found = existing.data.items?.find((item) => item.summary === CALENDAR_NAME && item.id);
  if (found?.id) {
    await updateSettings({ targetCalendarId: found.id });
    return found.id;
  }

  const { data } = await api.calendars.insert({
    requestBody: { summary: CALENDAR_NAME, timeZone: settings.timezone },
  });
  if (!data.id) throw new Error('Google did not return an id for the new calendar');

  await updateSettings({ targetCalendarId: data.id });
  return data.id;
}

export interface CommitResult {
  created: number;
  removed: number;
  calendarId: string;
}

async function deleteEvent(calendarId: string, eventId: string): Promise<boolean> {
  try {
    await calendarApi().events.delete({ calendarId, eventId });
    return true;
  } catch (error) {
    // Already gone (deleted by hand in Google) — nothing to undo.
    if (isMissing(error)) return false;
    throw error;
  }
}

/**
 * Pushes the day's drafts to Google, replacing what TimeBlock put there before.
 *
 * Committed blocks with ticked-off work are kept (event and all) as history,
 * and so are blocks placed by hand (pinned); only untouched ones are deleted. Deletion is keyed on the block id stamped
 * into the event's private extended properties, so an event the user created
 * by hand is never a target.
 */
export async function commitDay(date: string): Promise<CommitResult> {
  const settings = await getSettings();
  const calendarId = await ensureTargetCalendar();
  const api = calendarApi();
  const byId = indexHorizons(await listAllHorizons());

  const day = await blockRepo.listForDate(date);

  let removed = 0;
  for (const block of day.filter((b) => b.state === 'synced' && !b.pinned)) {
    const shouldDelete = await blockRepo.retireBlock(block);
    if (shouldDelete && block.googleEventId && (await deleteEvent(calendarId, block.googleEventId))) removed += 1;
  }

  let created = 0;
  for (const block of day.filter((b) => b.state === 'draft')) {
    const content = eventContent(block.segments, byId);
    const { data } = await api.events.insert({
      calendarId,
      requestBody: {
        ...content,
        start: { dateTime: block.startsAt, timeZone: settings.timezone },
        end: { dateTime: block.endsAt, timeZone: settings.timezone },
        transparency: 'opaque',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1 }] },
        extendedProperties: { private: { [BLOCK_ID_KEY]: String(block.id) } },
      },
    });

    if (data.id) {
      await blockRepo.markSynced(block.id, data.id);
      created += 1;
    }
  }

  return { created, removed, calendarId };
}

export interface CommitRangeResult {
  days: number;
  created: number;
  removed: number;
}

/**
 * Commits a calendar-wide plan: every day from `from` on that holds drafts,
 * plus every day still holding TimeBlock blocks the new plan replaced — those
 * would otherwise stay in Google and double-book the work that moved.
 */
export async function commitFrom(from: string): Promise<CommitRangeResult> {
  const drafts = await blockRepo.draftDatesFrom(from);
  if (drafts.length === 0) return { days: 0, created: 0, removed: 0 };

  const dates = [...new Set([...drafts.map((d) => d.date), ...(await blockRepo.replaceableSyncedDatesFrom(from))])].sort();
  const total: CommitRangeResult = { days: drafts.length, created: 0, removed: 0 };
  for (const date of dates) {
    const result = await commitDay(date);
    total.created += result.created;
    total.removed += result.removed;
  }
  return total;
}

/** Moves a committed block's Google event to where the block now is. */
export async function moveEvent(block: blockRepo.BlockWithSegments): Promise<void> {
  if (!block.googleEventId) return;
  const settings = await getSettings();
  const calendarId = await ensureTargetCalendar();
  await calendarApi().events.patch({
    calendarId,
    eventId: block.googleEventId,
    requestBody: {
      start: { dateTime: block.startsAt, timeZone: settings.timezone },
      end: { dateTime: block.endsAt, timeZone: settings.timezone },
    },
  });
}

/**
 * Removes the day's plan: drafts locally, untouched committed blocks locally and
 * in Google. Ticked-off blocks stay — they are the record of work done.
 */
export async function clearDay(date: string): Promise<number> {
  await blockRepo.deleteDrafts(date);

  const synced = (await blockRepo.listForDate(date)).filter((b) => b.state === 'synced');
  if (synced.length === 0) return 0;

  const calendarId = await ensureTargetCalendar();
  let removed = 0;
  for (const block of synced) {
    const shouldDelete = await blockRepo.retireBlock(block);
    if (shouldDelete && block.googleEventId && (await deleteEvent(calendarId, block.googleEventId))) removed += 1;
  }
  return removed;
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status;
  return code === 404 || code === 410;
}
