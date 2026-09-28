import 'server-only';
import { indexHorizons } from '@/lib/hierarchy';
import * as blockRepo from '@/lib/repo/blocks';
import { listAllHorizons } from '@/lib/repo/horizons';
import { getSettings, updateSettings } from '@/lib/repo/settings';
import type { Vacation } from '@/lib/db/schema';
import { blockColorId, colorUpdate, windowColors } from '@/lib/calendar/colors';
import { listWindows } from '@/lib/repo/windows';
import { BLOCK_COLOR_KEY, BLOCK_ID_KEY } from './calendar';
import { calendarApi, connectionState } from './client';
import { eventContent } from './event-content';
import { vacationEventBody } from './vacation-event';

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
  const byId = indexHorizons(await listAllHorizons());
  const colors = windowColors(await listWindows());

  const day = await blockRepo.listForDate(date);

  let removed = 0;
  for (const block of day.filter((b) => b.state === 'synced' && !b.pinned)) {
    const shouldDelete = await blockRepo.retireBlock(block);
    if (shouldDelete && block.googleEventId && (await deleteEvent(calendarId, block.googleEventId))) removed += 1;
  }

  let created = 0;
  for (const block of day.filter((b) => b.state === 'draft')) {
    if (await insertBlockEvent(block, calendarId, settings.timezone, byId, colors)) created += 1;
  }

  return { created, removed, calendarId };
}

/**
 * Creates a draft block's event in TimeBlock's calendar and marks the block
 * committed. The event takes the Google colour nearest its window's (`colors`,
 * by window id), and that colour is recorded on it: a colour changed in Google
 * later is then recognised as chosen by hand, and wins.
 */
async function insertBlockEvent(
  block: blockRepo.BlockWithSegments,
  calendarId: string,
  timeZone: string,
  byId: ReturnType<typeof indexHorizons>,
  colors: Map<number, string>,
): Promise<boolean> {
  const content = eventContent(block.segments, byId);
  const colorId = colorIdOf(block, colors);
  const { data } = await calendarApi().events.insert({
    calendarId,
    requestBody: {
      ...content,
      colorId,
      start: { dateTime: block.startsAt, timeZone },
      end: { dateTime: block.endsAt, timeZone },
      transparency: 'opaque',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1 }] },
      extendedProperties: { private: { [BLOCK_ID_KEY]: String(block.id), [BLOCK_COLOR_KEY]: colorId } },
    },
  });
  if (!data.id) return false;
  await blockRepo.markSynced(block.id, data.id);
  return true;
}

/**
 * Deletes the Google events of committed blocks a reschedule replaces (already
 * gone is fine). Returns how many were deleted.
 */
export async function removeBlockEvents(blocks: blockRepo.BlockWithSegments[]): Promise<number> {
  const withEvents = blocks.filter((b) => b.state === 'synced' && b.googleEventId);
  if (withEvents.length === 0) return 0;
  const calendarId = await ensureTargetCalendar();
  let removed = 0;
  for (const block of withEvents) if (await deleteEvent(calendarId, block.googleEventId!)) removed += 1;
  return removed;
}

/**
 * Sends just these draft blocks to Google — unlike `commitDay`, every other
 * TimeBlock event on their days is left exactly as it is. Returns how many
 * events were created.
 */
export async function commitBlocks(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const settings = await getSettings();
  const calendarId = await ensureTargetCalendar();
  const byId = indexHorizons(await listAllHorizons());
  const colors = windowColors(await listWindows());
  let created = 0;
  for (const id of ids) {
    const block = await blockRepo.getBlock(id);
    if (block?.state === 'draft' && (await insertBlockEvent(block, calendarId, settings.timezone, byId, colors))) created += 1;
  }
  return created;
}

/** The Google colour a block's event should have (see `blockColorId`). */
function colorIdOf(block: blockRepo.BlockWithSegments, colors: Map<number, string>): string {
  return blockColorId(block.windowId !== null ? colors.get(block.windowId) : null, block.segments[0]?.task.energy ?? 'deep');
}

export interface ColorSyncResult {
  /** Events given their window's colour. */
  recoloured: number;
  /** Events left alone because someone chose their colour in Google. */
  chosenByHand: number;
}

/**
 * Brings the colours of TimeBlock's events in Google in line with the rule the
 * calendar shows: each block in its window's colour (the nearest Google has),
 * work with no window in its energy's — except an event whose colour was chosen
 * by hand in Google, which is never touched. Every event it colours is stamped
 * with that colour, so a later change in Google is recognised as a choice.
 *
 * Covers committed blocks from the local date `from` on (all of them when
 * omitted). Does nothing when Google is not connected or nothing is committed.
 */
export async function syncBlockColors(from?: string): Promise<ColorSyncResult> {
  const result: ColorSyncResult = { recoloured: 0, chosenByHand: 0 };
  const settings = await getSettings();
  if (connectionState().status !== 'connected' || !settings.targetCalendarId) return result;

  const blocks = await blockRepo.listCommitted(from);
  if (blocks.length === 0) return result;
  const byEvent = new Map(blocks.map((b) => [b.googleEventId!, b]));
  const colors = windowColors(await listWindows());

  const api = calendarApi();
  const calendarId = settings.targetCalendarId;
  let pageToken: string | undefined;
  do {
    const { data } = await api.events.list({
      calendarId,
      timeMin: blocks[0].startsAt,
      timeMax: blocks.reduce((max, b) => (b.endsAt > max ? b.endsAt : max), blocks[0].endsAt),
      singleEvents: true,
      maxResults: 2500,
      pageToken,
    });
    for (const event of data.items ?? []) {
      const block = event.id ? byEvent.get(event.id) : undefined;
      if (!block || event.status === 'cancelled') continue;

      const stamps = event.extendedProperties?.private ?? {};
      const update = colorUpdate(
        { colorId: event.colorId ?? null, plannedColorId: stamps[BLOCK_COLOR_KEY] ?? null },
        colorIdOf(block, colors),
      );
      if (update === 'chosen-by-hand') result.chosenByHand += 1;
      if (typeof update === 'string') continue;
      const colorId = update.set;

      await api.events.patch({
        calendarId,
        eventId: event.id!,
        // The whole private map is sent, so the block id stamped beside the colour is kept.
        requestBody: { colorId, extendedProperties: { private: { ...stamps, [BLOCK_COLOR_KEY]: colorId } } },
      });
      result.recoloured += 1;
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return result;
}

export interface CommitRangeResult {
  days: number;
  created: number;
  removed: number;
  /** Earlier TimeBlock events given their window's colour on the way. */
  recoloured?: number;
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
  // Blocks committed earlier (or before blocks took their window's colour) follow the same colours.
  total.recoloured = (await syncBlockColors(from)).recoloured;
  return total;
}

/**
 * Deletes a block that has no ticked work: its Google event first (so a
 * refusal changes nothing), then the block. Its tasks are planned again later.
 */
export async function deleteBlockEverywhere(block: blockRepo.BlockWithSegments): Promise<void> {
  if (block.state === 'done' || blockRepo.isLocked(block)) {
    throw new Error('This block has ticked-off work, so it stays as a record of what was done.');
  }
  if (block.state === 'synced') await removeBlockEvent(block);
  await blockRepo.deleteBlock(block.id);
}

/** Removes a committed block's event from TimeBlock's calendar (already gone is fine). */
export async function removeBlockEvent(block: blockRepo.BlockWithSegments): Promise<void> {
  if (!block.googleEventId) return;
  await deleteEvent(await ensureTargetCalendar(), block.googleEventId);
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

/**
 * Brings a vacation's Google copy in line with it: created when wanted and
 * missing, updated when wanted and present, removed when no longer wanted.
 * Returns the event id to store (null when there is none). The copy lives in
 * TimeBlock's own calendar, like blocks.
 */
export async function syncVacationEvent(v: Vacation, windowNames: string[]): Promise<string | null> {
  if (!v.inGoogle) {
    if (v.googleEventId) await deleteEvent(await ensureTargetCalendar(), v.googleEventId);
    return null;
  }
  const settings = await getSettings();
  const calendarId = await ensureTargetCalendar();
  const requestBody = vacationEventBody(v, settings.timezone, windowNames);
  if (v.googleEventId) {
    try {
      await calendarApi().events.update({ calendarId, eventId: v.googleEventId, requestBody });
      return v.googleEventId;
    } catch (error) {
      // Deleted by hand in Google: make a new one below.
      if (!isMissing(error)) throw error;
    }
  }
  const { data } = await calendarApi().events.insert({ calendarId, requestBody });
  if (!data.id) throw new Error('Google did not return an id for the vacation event');
  return data.id;
}

/** Removes a vacation's Google copy, if it has one (already gone is fine). */
export async function removeVacationEvent(v: Pick<Vacation, 'googleEventId'>): Promise<void> {
  if (v.googleEventId) await deleteEvent(await ensureTargetCalendar(), v.googleEventId);
}
