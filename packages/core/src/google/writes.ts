import { blockColorId, colorUpdate, windowColors } from '../calendar/colors';
import type { Vacation } from '../db/schema';
import type { Env } from '../env';
import { indexHorizons } from '../hierarchy';
import * as blockStore from '../store/blocks';
import { listAllHorizons } from '../store/horizons';
import { getSettings, updateSettings } from '../store/settings';
import { listWindows } from '../store/windows';
import { isGone } from './calendar-api';
import { eventContent } from './event-content';
import { BLOCK_COLOR_KEY, BLOCK_ID_KEY } from './events';
import { vacationEventBody } from './vacation-event';

export const CALENDAR_NAME = 'TimeBlock — Focus';

/**
 * TimeBlock writes only into its own secondary calendar. Nothing it does can
 * then touch a real meeting, and the whole day's blocks can be hidden with one
 * checkbox in Google Calendar.
 */
export async function ensureTargetCalendar(env: Env): Promise<string> {
  const settings = await getSettings(env.db);
  const api = env.google.calendar();

  if (settings.targetCalendarId) {
    try {
      await api.getCalendar(settings.targetCalendarId);
      return settings.targetCalendarId;
    } catch {
      // Deleted on the Google side — fall through and make a new one.
    }
  }

  const existing = await api.listCalendars({ showHidden: true });
  const found = existing.find((item) => item.summary === CALENDAR_NAME && item.id);
  if (found?.id) {
    await updateSettings(env.db, { targetCalendarId: found.id });
    return found.id;
  }

  const { id } = await api.insertCalendar({ summary: CALENDAR_NAME, timeZone: settings.timezone });
  await updateSettings(env.db, { targetCalendarId: id });
  return id;
}

export interface CommitResult {
  created: number;
  /** Leftover TimeBlock events in Google that no block stands behind any more (duplicates), deleted. */
  removed: number;
  calendarId: string;
}

async function deleteEvent(env: Env, calendarId: string, eventId: string): Promise<boolean> {
  try {
    await env.google.calendar().deleteEvent(calendarId, eventId);
    return true;
  } catch (error) {
    // Already gone (deleted by hand in Google) — nothing to undo.
    if (isGone(error)) return false;
    throw error;
  }
}

/**
 * Pushes the day's drafts to Google. Blocks already committed stay as they are
 * — a new plan only fills the gaps they leave — so committing never replaces
 * work that is already there. See `commitDrafts` for why it is idempotent.
 */
export async function commitDay(env: Env, date: string): Promise<CommitResult> {
  return commitDrafts(env, await blockStore.listForDate(env.db, date));
}

/** A TimeBlock event in Google, and the block id stamped on it. */
interface StampedEvent {
  id: string;
  blockId: number;
}

/**
 * TimeBlock's block events in its own calendar between two instants. Only
 * events carrying a block id count: an event made by hand in that calendar,
 * or a vacation's copy, is never touched.
 */
async function stampedEvents(env: Env, calendarId: string, timeMin: string, timeMax: string): Promise<StampedEvent[]> {
  const out: StampedEvent[] = [];
  let pageToken: string | undefined;
  do {
    const page = await env.google.calendar().listEvents(calendarId, { timeMin, timeMax, pageToken });
    for (const event of page.items) {
      const blockId = Number(event.extendedProperties?.private?.[BLOCK_ID_KEY]);
      if (event.id && event.status !== 'cancelled' && Number.isInteger(blockId) && blockId > 0) out.push({ id: event.id, blockId });
    }
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/**
 * Sends the drafts among `blocks` to Google, idempotently:
 *
 * - A draft whose id is already stamped on an event (a commit cut short after
 *   Google created it) takes that event over instead of getting a second one.
 * - With `sweep`, TimeBlock events across the blocks' span that no block
 *   stands behind any more — left over by an interrupted commit or an older
 *   plan — are deleted, so Google never shows the same work twice.
 *
 * Committing the same drafts twice therefore leaves Google exactly as once.
 */
async function commitDrafts(env: Env, blocks: blockStore.BlockWithSegments[], sweep = true): Promise<CommitResult> {
  const calendarId = await ensureTargetCalendar(env);
  if (blocks.length === 0) return { created: 0, removed: 0, calendarId };

  const settings = await getSettings(env.db);
  const byId = indexHorizons(await listAllHorizons(env.db));
  const colors = windowColors(await listWindows(env.db));

  const timeMin = blocks.reduce((min, b) => (b.startsAt < min ? b.startsAt : min), blocks[0].startsAt);
  const timeMax = blocks.reduce((max, b) => (b.endsAt > max ? b.endsAt : max), blocks[0].endsAt);
  const stamped = await stampedEvents(env, calendarId, timeMin, timeMax);
  const known = new Set((await blockStore.listCommitted(env.db)).map((b) => b.googleEventId!));
  const unclaimed = new Map<number, string>();
  for (const e of stamped) if (!known.has(e.id) && !unclaimed.has(e.blockId)) unclaimed.set(e.blockId, e.id);

  let created = 0;
  for (const block of blocks.filter((b) => b.state === 'draft')) {
    const existing = unclaimed.get(block.id);
    const eventId = await writeBlockEvent(env, block, calendarId, settings.timezone, byId, colors, existing);
    if (!eventId) continue;
    known.add(eventId);
    if (!existing) created += 1;
  }

  let removed = 0;
  if (sweep) for (const e of stamped) if (!known.has(e.id) && (await deleteEvent(env, calendarId, e.id))) removed += 1;
  return { created, removed, calendarId };
}

/**
 * Gives a draft block its event in TimeBlock's calendar — a new one, or
 * `existing` brought up to date — and marks the block committed. Returns the
 * event id, or null when Google returned none. The event takes the Google
 * colour nearest its window's (`colors`, by window id), and that colour is
 * recorded on it: a colour changed in Google later is then recognised as
 * chosen by hand, and wins.
 */
async function writeBlockEvent(
  env: Env,
  block: blockStore.BlockWithSegments,
  calendarId: string,
  timeZone: string,
  byId: ReturnType<typeof indexHorizons>,
  colors: Map<number, string>,
  existing?: string,
): Promise<string | null> {
  const content = eventContent(block.segments, byId);
  const colorId = colorIdOf(block, colors);
  const body = {
    ...content,
    colorId,
    start: { dateTime: block.startsAt, timeZone },
    end: { dateTime: block.endsAt, timeZone },
    transparency: 'opaque',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1 }] },
    extendedProperties: { private: { [BLOCK_ID_KEY]: String(block.id), [BLOCK_COLOR_KEY]: colorId } },
  };
  const api = env.google.calendar();
  const event = existing ? await api.patchEvent(calendarId, existing, body) : await api.insertEvent(calendarId, body);
  if (!event.id) return null;
  await blockStore.markSynced(env.db, block.id, event.id);
  return event.id;
}

/**
 * Deletes the Google events of committed blocks a reschedule replaces (already
 * gone is fine). Returns how many were deleted.
 */
export async function removeBlockEvents(env: Env, blocks: blockStore.BlockWithSegments[]): Promise<number> {
  const withEvents = blocks.filter((b) => b.state === 'synced' && b.googleEventId);
  if (withEvents.length === 0) return 0;
  const calendarId = await ensureTargetCalendar(env);
  let removed = 0;
  for (const block of withEvents) if (await deleteEvent(env, calendarId, block.googleEventId!)) removed += 1;
  return removed;
}

/**
 * Sends just these draft blocks to Google — unlike `commitDay`, every other
 * TimeBlock event on their days is left exactly as it is. Returns how many
 * events were created.
 */
export async function commitBlocks(env: Env, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const blocks = (await Promise.all(ids.map((id) => blockStore.getBlock(env.db, id)))).filter((b) => b !== null);
  return (await commitDrafts(env, blocks, false)).created;
}

/** The Google colour a block's event should have (see `blockColorId`). */
function colorIdOf(block: blockStore.BlockWithSegments, colors: Map<number, string>): string {
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
export async function syncBlockColors(env: Env, from?: string): Promise<ColorSyncResult> {
  const result: ColorSyncResult = { recoloured: 0, chosenByHand: 0 };
  const settings = await getSettings(env.db);
  if (env.google.status() !== 'connected' || !settings.targetCalendarId) return result;

  const blocks = await blockStore.listCommitted(env.db, from);
  if (blocks.length === 0) return result;
  const byEvent = new Map(blocks.map((b) => [b.googleEventId!, b]));
  const colors = windowColors(await listWindows(env.db));

  const api = env.google.calendar();
  const calendarId = settings.targetCalendarId;
  let pageToken: string | undefined;
  do {
    const page = await api.listEvents(calendarId, {
      timeMin: blocks[0].startsAt,
      timeMax: blocks.reduce((max, b) => (b.endsAt > max ? b.endsAt : max), blocks[0].endsAt),
      pageToken,
    });
    for (const event of page.items) {
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

      // The whole private map is sent, so the block id stamped beside the colour is kept.
      await api.patchEvent(calendarId, event.id!, { colorId, extendedProperties: { private: { ...stamps, [BLOCK_COLOR_KEY]: colorId } } });
      result.recoloured += 1;
    }
    pageToken = page.nextPageToken ?? undefined;
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
 * Commits a calendar-wide plan: every draft from `from` on goes to Google.
 * Blocks committed earlier stay where they are (the plan filled the gaps around
 * them), and TimeBlock events no block stands behind any more are cleared out
 * on the way — so committing twice never doubles anything.
 */
export async function commitFrom(env: Env, from: string): Promise<CommitRangeResult> {
  const drafts = await blockStore.draftDatesFrom(env.db, from);
  if (drafts.length === 0) return { days: 0, created: 0, removed: 0 };

  const { created, removed } = await commitDrafts(env, await blockStore.listFrom(env.db, from));
  // Blocks committed earlier (or before blocks took their window's colour) follow the same colours.
  const recoloured = (await syncBlockColors(env, from)).recoloured;
  return { days: drafts.length, created, removed, recoloured };
}

/**
 * Deletes a block that has no ticked work: its Google event first (so a
 * refusal changes nothing), then the block. Its tasks are planned again later.
 */
export async function deleteBlockEverywhere(env: Env, block: blockStore.BlockWithSegments): Promise<void> {
  if (block.state === 'done' || blockStore.isLocked(block)) {
    throw new Error('This block has ticked-off work, so it stays as a record of what was done.');
  }
  if (block.state === 'synced') await removeBlockEvent(env, block);
  await blockStore.deleteBlock(env.db, block.id);
}

/** Removes a committed block's event from TimeBlock's calendar (already gone is fine). */
export async function removeBlockEvent(env: Env, block: blockStore.BlockWithSegments): Promise<void> {
  if (!block.googleEventId) return;
  await deleteEvent(env, await ensureTargetCalendar(env), block.googleEventId);
}

/** Moves a committed block's Google event to where the block now is. */
export async function moveEvent(env: Env, block: blockStore.BlockWithSegments): Promise<void> {
  if (!block.googleEventId) return;
  const settings = await getSettings(env.db);
  const calendarId = await ensureTargetCalendar(env);
  await env.google.calendar().patchEvent(calendarId, block.googleEventId, {
    start: { dateTime: block.startsAt, timeZone: settings.timezone },
    end: { dateTime: block.endsAt, timeZone: settings.timezone },
  });
}

/**
 * Brings a committed block's Google event in line after its time and length
 * were changed by hand: the new times, and the title and task list for the
 * work it now holds. Its colour is left alone.
 */
export async function retimeEvent(env: Env, block: blockStore.BlockWithSegments): Promise<void> {
  if (!block.googleEventId) return;
  const settings = await getSettings(env.db);
  const calendarId = await ensureTargetCalendar(env);
  const { summary, description } = eventContent(block.segments, indexHorizons(await listAllHorizons(env.db)));
  await env.google.calendar().patchEvent(calendarId, block.googleEventId, {
    summary,
    description,
    start: { dateTime: block.startsAt, timeZone: settings.timezone },
    end: { dateTime: block.endsAt, timeZone: settings.timezone },
  });
}

/**
 * Removes the day's plan: drafts locally, untouched committed blocks locally and
 * in Google. Ticked-off blocks stay — they are the record of work done.
 */
export async function clearDay(env: Env, date: string): Promise<number> {
  await blockStore.deleteDrafts(env.db, date);

  const synced = (await blockStore.listForDate(env.db, date)).filter((b) => b.state === 'synced');
  if (synced.length === 0) return 0;

  const calendarId = await ensureTargetCalendar(env);
  let removed = 0;
  for (const block of synced) {
    const shouldDelete = await blockStore.retireBlock(env.db, block);
    if (shouldDelete && block.googleEventId && (await deleteEvent(env, calendarId, block.googleEventId))) removed += 1;
  }
  return removed;
}

/**
 * Brings a vacation's Google copy in line with it: created when wanted and
 * missing, updated when wanted and present, removed when no longer wanted.
 * Returns the event id to store (null when there is none). The copy lives in
 * TimeBlock's own calendar, like blocks.
 */
export async function syncVacationEvent(env: Env, v: Vacation, windowNames: string[]): Promise<string | null> {
  if (!v.inGoogle) {
    if (v.googleEventId) await deleteEvent(env, await ensureTargetCalendar(env), v.googleEventId);
    return null;
  }
  const settings = await getSettings(env.db);
  const calendarId = await ensureTargetCalendar(env);
  const body = vacationEventBody(v, settings.timezone, windowNames);
  const api = env.google.calendar();
  if (v.googleEventId) {
    try {
      await api.updateEvent(calendarId, v.googleEventId, body);
      return v.googleEventId;
    } catch (error) {
      // Deleted by hand in Google: make a new one below.
      if (!isGone(error)) throw error;
    }
  }
  const event = await api.insertEvent(calendarId, body);
  if (!event.id) throw new Error('Google did not return an id for the vacation event');
  return event.id;
}

/** Removes a vacation's Google copy, if it has one (already gone is fine). */
export async function removeVacationEvent(env: Env, v: Pick<Vacation, 'googleEventId'>): Promise<void> {
  if (v.googleEventId) await deleteEvent(env, await ensureTargetCalendar(env), v.googleEventId);
}
