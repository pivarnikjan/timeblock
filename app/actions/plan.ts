'use server';

import { revalidatePath } from 'next/cache';
import { num, str } from '@/lib/forms';
import { redirect } from 'next/navigation';
import { withEnv } from '@/lib/env';
import { clearDay, commitFrom, type CommitRangeResult } from '@/lib/google/sync';
import {
  generateDay,
  planCalendar,
  previewReschedule,
  reschedule,
  today,
  type CalendarPlanSummary,
  type RescheduleResult,
  type RescheduleSummary,
} from '@/lib/planner';
import { getSettings } from '@/lib/repo/settings';
import { syncQuietly } from '@/lib/sync/service';
import * as ops from '@timeblock/core/operations/plan';

function refresh() {
  revalidatePath('/', 'layout');
}

/** Plans start from what the phone knows too — above all, work ticked off there. */
const pullFromPhone = () => syncQuietly(30_000);

export async function generatePlanAction(form: FormData): Promise<void> {
  await pullFromPhone();
  await generateDay(str(form, 'date'));
  refresh();
}

/** Commits the day's drafts to Google and records the daily ritual as done. */
export async function commitPlanAction(form: FormData): Promise<void> {
  const date = str(form, 'date');
  await pullFromPhone();
  await withEnv(ops.commitDayPlan)(date);
  refresh();
}

export async function clearPlanAction(form: FormData): Promise<void> {
  await clearDay(str(form, 'date'));
  refresh();
}

const tick = withEnv(ops.tick);

/** Ticks one segment on or off. Progress bars move from these ticks. */
export async function toggleSegmentAction(form: FormData): Promise<void> {
  await tick([num(form, 'segmentId')], form.get('done') === '1');
  refresh();
}

/** Ticks every segment of a block. */
export async function completeBlockAction(form: FormData): Promise<void> {
  await withEnv(ops.completeBlock)(num(form, 'blockId'));
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
  await withEnv(ops.reviewDay)(date, checked);
  refresh();
}

// ── Calendar-wide planning ──────────────────────────────────────────────────

export type PlanCalendarState =
  | { kind: 'idle' }
  | { kind: 'planned'; summary: CalendarPlanSummary }
  | { kind: 'committed'; result: CommitRangeResult }
  | { kind: 'discarded'; blocks: number }
  | { kind: 'reschedule-preview'; summary: RescheduleSummary }
  | { kind: 'rescheduled'; result: RescheduleResult }
  | { kind: 'error'; message: string };

/**
 * The Calendar's plan bar: one form, several buttons. "plan" lays every task
 * out from today on as drafts; "commit" sends those drafts to Google;
 * "discard" throws the drafts away (blocks placed by hand included).
 * "reschedule-preview" counts the tasks a reschedule would move, "reschedule"
 * (the confirmation) moves them, and "cancel" drops the preview.
 */
export async function planCalendarAction(_prev: PlanCalendarState, form: FormData): Promise<PlanCalendarState> {
  const intent = form.get('intent');
  try {
    const from = today(await getSettings());
    let state: PlanCalendarState;
    if (intent === 'cancel') return { kind: 'idle' };
    if (intent === 'plan' || intent === 'commit' || intent === 'reschedule-preview') await pullFromPhone();
    if (intent === 'reschedule-preview') return { kind: 'reschedule-preview', summary: await previewReschedule() };
    if (intent === 'commit') state = { kind: 'committed', result: await commitFrom(from) };
    else if (intent === 'discard') state = { kind: 'discarded', blocks: await withEnv(ops.discardDrafts)() };
    else if (intent === 'reschedule') state = { kind: 'rescheduled', result: await reschedule() };
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
  await withEnv(ops.moveBlockBy)(blockId, deltaDays, deltaMinutes);
  refresh();
}

/** Hands a block placed by hand back to the planner: the next plan may move or replace it. */
export async function unpinBlockAction(form: FormData): Promise<void> {
  await withEnv(ops.unpinBlock)(num(form, 'blockId'));
  refresh();
}

/**
 * Deletes a block from the event panel. A committed block's Google event goes
 * too (Google first, so a refusal changes nothing). A block with ticked-off
 * work is history and stays. Its tasks are planned again next time.
 */
export async function deleteBlockAction(form: FormData): Promise<void> {
  await withEnv(ops.deleteBlock)(num(form, 'blockId'));
  refresh();
  const to = String(form.get('returnTo') ?? '');
  redirect(to.startsWith('/calendar') ? to : '/calendar');
}
