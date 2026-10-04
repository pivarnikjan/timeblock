import { DateTime } from 'luxon';
import type { Env } from '../env';
import { fitSegments, MIN_BLOCK_MIN } from '../blocks';
import { commitDay, deleteBlockEverywhere, moveEvent, retimeEvent, syncBlockColors } from '../google/writes';
import { rescheduleMissed, today } from '../planner';
import * as blockStore from '../store/blocks';
import { recordSlips } from '../store/reschedules';
import { completeRitual } from '../store/rituals';
import { getSettings } from '../store/settings';
import { syncCompletion } from '../store/tasks';

/**
 * What the day planner and the calendar do with blocks — the same on the
 * desktop and the phone. Syncing with the other device first (so a plan starts
 * from what was ticked off there) is the caller's job.
 */

/** Ticks segments on or off, and keeps their tasks' status in step. Progress bars move from these ticks. */
export async function tick(env: Env, segmentIds: number[], done: boolean): Promise<void> {
  const taskIds = await blockStore.setSegmentsDone(env.db, segmentIds, done);
  await syncCompletion(env.db, taskIds, await blockStore.tickedMinutesByTask(env.db));
}

/** Ticks every segment of a block. */
export async function completeBlock(env: Env, blockId: number): Promise<void> {
  await tick(env, await blockStore.segmentIdsOfBlock(env.db, blockId), true);
}

/**
 * The first step of the morning: say what actually happened on `date`.
 * Checked segments are ticked off; unchecked ones stay open and are planned
 * again with only their remaining minutes — and count as a slip of their task
 * (see `taskReschedules`; reviewing the same day again counts nothing twice).
 */
export async function reviewDay(env: Env, date: string, checkedSegmentIds: number[]): Promise<void> {
  await tick(env, checkedSegmentIds, true);
  const day = await blockStore.listForDate(env.db, date);
  await recordSlips(
    env.db,
    day.flatMap((block) =>
      block.segments
        .filter((s) => s.doneAt === null)
        .map((s) => ({ taskId: s.taskId, blockId: block.id, fromStartsAt: block.startsAt, toStartsAt: null, minutes: s.minutes, reason: 'review' as const })),
    ),
  );
  await completeRitual(env.db, 'review', date);
}

/** "Didn't get to it" on a block: its work moves to the next free slot, and the slip is counted. */
export const missBlock = rescheduleMissed;

/** Commits the day's drafts to Google, colours its blocks, and records the daily ritual as done. */
export async function commitDayPlan(env: Env, date: string): Promise<void> {
  await commitDay(env, date);
  await syncBlockColors(env, date);
  await completeRitual(env.db, 'daily', date);
}

/** Throws away the drafts from today on — blocks placed by hand included. Returns how many. */
export async function discardDrafts(env: Env): Promise<number> {
  return blockStore.deleteDraftsFrom(env.db, today(await getSettings(env.db)));
}

async function movable(env: Env, blockId: number): Promise<blockStore.BlockWithSegments> {
  const block = await blockStore.getBlock(env.db, blockId);
  if (!block) throw new Error('That block no longer exists — reload the calendar.');
  if (block.state === 'done' || blockStore.isLocked(block)) {
    throw new Error('This block has ticked-off work, so it stays where it happened.');
  }
  return block;
}

/**
 * Puts a block at `start` (in the Settings timezone), keeping its length, and
 * pins it there: windows do not apply to a block placed by hand, and
 * re-planning works around it. A committed block's Google event moves with it
 * — Google first, so if it refuses nothing has changed on either side.
 */
async function place(env: Env, block: blockStore.BlockWithSegments, start: DateTime): Promise<void> {
  const length = DateTime.fromISO(block.endsAt).diff(DateTime.fromISO(block.startsAt), 'minutes').minutes;
  const end = start.plus({ minutes: length });
  if (start.toISODate() !== end.minus({ milliseconds: 1 }).toISODate()) {
    throw new Error('A block cannot run past midnight.');
  }
  const moved = { startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()! };
  if (block.state === 'synced') await moveEvent(env, { ...block, ...moved });
  await blockStore.moveBlock(env.db, block.id, start.toISODate()!, moved.startsAt, moved.endsAt);
}

/** A block dragged on the calendar: moved by whole days and minutes. */
export async function moveBlockBy(env: Env, blockId: number, deltaDays: number, deltaMinutes: number): Promise<void> {
  if (![blockId, deltaDays, deltaMinutes].every(Number.isInteger)) throw new Error('A move needs whole numbers.');
  if (deltaDays === 0 && deltaMinutes === 0) return;
  const block = await movable(env, blockId);
  const { timezone } = await getSettings(env.db);
  await place(env, block, DateTime.fromISO(block.startsAt, { zone: timezone }).plus({ days: deltaDays, minutes: deltaMinutes }));
}

/** A block given a new day and start time (`HH:mm`, in the Settings timezone), snapped to 5 minutes. */
export async function moveBlockTo(env: Env, blockId: number, date: string, startTime: string): Promise<void> {
  const block = await movable(env, blockId);
  const { timezone } = await getSettings(env.db);
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone: timezone });
  if (!start.isValid) throw new Error('Choose a day and a start time.');
  const snapped = start.set({ minute: Math.round(start.minute / 5) * 5, second: 0, millisecond: 0 });
  await place(env, block, snapped);
}

/**
 * A block given a new time and length by hand (dragged or resized on the
 * calendar, or edited in its panel): `startsAt` and `endsAt` are instants,
 * snapped to 5 minutes in the Settings timezone. Moved only, it keeps its work;
 * made longer or shorter, its work follows (see `fitSegments`). It is pinned
 * there, and a committed block's Google event follows — Google first, so a
 * refusal changes nothing.
 */
export async function setBlockTime(env: Env, blockId: number, startsAt: string, endsAt: string): Promise<void> {
  const block = await movable(env, blockId);
  const { timezone } = await getSettings(env.db);
  const snap = (iso: string) => {
    const t = DateTime.fromISO(iso, { zone: timezone });
    return t.isValid ? t.set({ minute: Math.round(t.minute / 5) * 5, second: 0, millisecond: 0 }) : null;
  };
  const start = snap(startsAt);
  const end = snap(endsAt);
  if (!start || !end) throw new Error('Choose a day, a start and an end.');
  const length = end.diff(start, 'minutes').minutes;
  if (length < MIN_BLOCK_MIN) throw new Error(`A block lasts at least ${MIN_BLOCK_MIN} minutes.`);
  if (start.toISODate() !== end.minus({ milliseconds: 1 }).toISODate()) throw new Error('A block cannot run past midnight.');

  const oldLength = DateTime.fromISO(block.endsAt).diff(DateTime.fromISO(block.startsAt), 'minutes').minutes;
  if (length === oldLength) return place(env, block, start);

  const fitted = fitSegments(block.segments, oldLength, length);
  const at = { date: start.toISODate()!, startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()! };
  const segments = block.segments.map((s, i) => ({ ...s, minutes: fitted[i] })).filter((s) => s.minutes > 0);
  if (block.state === 'synced') await retimeEvent(env, { ...block, ...at, segments });
  await blockStore.retimeBlock(env.db, block.id, at, new Map(block.segments.map((s, i) => [s.id, fitted[i]])));
}

/** Hands a block placed by hand back to the planner: the next plan may move or replace it. */
export async function unpinBlock(env: Env, blockId: number): Promise<void> {
  await blockStore.setPinned(env.db, blockId, false);
}

/**
 * Deletes a block. A committed block's Google event goes too (Google first, so
 * a refusal changes nothing). A block with ticked-off work is history and
 * stays. Its tasks are planned again next time.
 */
export async function deleteBlock(env: Env, blockId: number): Promise<void> {
  const block = await blockStore.getBlock(env.db, blockId);
  if (block) await deleteBlockEverywhere(env, block);
}
