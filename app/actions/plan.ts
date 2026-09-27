'use server';

import { revalidatePath } from 'next/cache';
import { num, str } from '@/lib/forms';
import { clearDay, commitDay } from '@/lib/google/sync';
import { generateDay } from '@/lib/planner';
import * as blockRepo from '@/lib/repo/blocks';
import { completeRitual } from '@/lib/repo/rituals';
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
