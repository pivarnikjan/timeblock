'use server';

import { DateTime } from 'luxon';
import { revalidatePath } from 'next/cache';
import { num, str } from '@/lib/forms';
import { redirect } from 'next/navigation';
import { clearDay, commitDay, commitFrom, deleteBlockEverywhere, moveEvent, type CommitRangeResult } from '@/lib/google/sync';
import { generateDay, planCalendar, today, type CalendarPlanSummary } from '@/lib/planner';
import * as blockRepo from '@/lib/repo/blocks';
import { completeRitual } from '@/lib/repo/rituals';
import { getSettings } from '@/lib/repo/settings';
import { syncCompletion } from '@/lib/repo/tasks';

function refresh() {
  revalidatePath('/', 'layout');
}

export async function generatePlanAction(form: FormData): Promise<void> {
  await generateDay(str(form, 'date'));
  refresh();
}

/** Commits the day's drafts to Google and records the daily ritual as done. */
export async function commitPlanAction(form: FormData): Promise<void> {
  const date = str(form, 'date');
  await commitDay(date);
  await completeRitual('daily', date);
  refresh();
}

export async function clearPlanAction(form: FormData): Promise<void> {
  await clearDay(str(form, 'date'));
  refresh();
}

async function tick(segmentIds: number[], done: boolean) {
  const taskIds = await blockRepo.setSegmentsDone(segmentIds, done);
  await syncCompletion(taskIds, await blockRepo.tickedMinutesByTask());
}

/** Ticks one segment on or off. Progress bars move from these ticks. */
export async function toggleSegmentAction(form: FormData): Promise<void> {
  await tick([num(form, 'segmentId')], form.get('done') === '1');
  refresh();
}

/** Ticks every segment of a block. */
export async function completeBlockAction(form: FormData): Promise<void> {
  await tick(await blockRepo.segmentIdsOfBlock(num(form, 'blockId')), true);
  refresh();
}

/**
 * The first step of the morning: say what actually happened yesterday.
 * Checked segments are ticked off; unchecked ones stay open and are planned
 * again today with only their remaining minutes.
 */
export async function reviewDayAction(form: FormData): Promise<void> {
  const date = str(form, 'date');
  const checked = form.getAll('segmentId').map(Number).filter(Number.isFinite);
  await tick(checked, true);
  await completeRitual('review', date);
  refresh();
}

// ── Calendar-wide planning ──────────────────────────────────────────────────

export type PlanCalendarState =
  | { kind: 'idle' }
  | { kind: 'planned'; summary: CalendarPlanSummary }
  | { kind: 'committed'; result: CommitRangeResult }
  | { kind: 'discarded'; blocks: number }
  | { kind: 'error'; message: string };

/**
 * The Calendar's plan bar: one form, three buttons. "plan" lays every task
 * out from today on as drafts; "commit" sends those drafts to Google;
 * "discard" throws the drafts away (blocks placed by hand included).
 */
export async function planCalendarAction(_prev: PlanCalendarState, form: FormData): Promise<PlanCalendarState> {
  const intent = form.get('intent');
  try {
    const from = today(await getSettings());
    let state: PlanCalendarState;
    if (intent === 'commit') state = { kind: 'committed', result: await commitFrom(from) };
    else if (intent === 'discard') state = { kind: 'discarded', blocks: await blockRepo.deleteDraftsFrom(from) };
    else state = { kind: 'planned', summary: await planCalendar() };
    refresh();
    return state;
  } catch (error) {
    return { kind: 'error', message: (error as Error).message };
  }
}

/**
 * A block dragged on the calendar. It keeps its length, moves by whole days
 * and 5-minute steps, and is pinned there: windows do not apply to a block
 * placed by hand, and re-planning works around it. A committed block's Google
 * event moves with it.
 */
export async function moveBlockAction(blockId: number, deltaDays: number, deltaMinutes: number): Promise<void> {
  if (![blockId, deltaDays, deltaMinutes].every(Number.isInteger)) throw new Error('A move needs whole numbers.');
  if (deltaDays === 0 && deltaMinutes === 0) return;

  const block = await blockRepo.getBlock(blockId);
  if (!block) throw new Error('That block no longer exists — reload the calendar.');
  if (block.state === 'done' || blockRepo.isLocked(block)) {
    throw new Error('This block has ticked-off work, so it stays where it happened.');
  }

  const { timezone } = await getSettings();
  const start = DateTime.fromISO(block.startsAt, { zone: timezone }).plus({ days: deltaDays, minutes: deltaMinutes });
  const length = DateTime.fromISO(block.endsAt).diff(DateTime.fromISO(block.startsAt), 'minutes').minutes;
  const end = start.plus({ minutes: length });
  if (start.toISODate() !== end.minus({ milliseconds: 1 }).toISODate()) {
    throw new Error('A block cannot run past midnight.');
  }

  const moved = { startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()! };
  // Google first: if it refuses, nothing has changed on either side.
  if (block.state === 'synced') await moveEvent({ ...block, ...moved });
  await blockRepo.moveBlock(blockId, start.toISODate()!, moved.startsAt, moved.endsAt);
  refresh();
}

/** Hands a block placed by hand back to the planner: the next plan may move or replace it. */
export async function unpinBlockAction(form: FormData): Promise<void> {
  await blockRepo.setPinned(num(form, 'blockId'), false);
  refresh();
}

/**
 * Deletes a block from the event panel. A committed block's Google event goes
 * too (Google first, so a refusal changes nothing). A block with ticked-off
 * work is history and stays. Its tasks are planned again next time.
 */
export async function deleteBlockAction(form: FormData): Promise<void> {
  const block = await blockRepo.getBlock(num(form, 'blockId'));
  if (block) await deleteBlockEverywhere(block);
  refresh();
  const to = String(form.get('returnTo') ?? '');
  redirect(to.startsWith('/calendar') ? to : '/calendar');
}
