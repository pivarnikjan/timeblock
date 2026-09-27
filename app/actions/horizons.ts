'use server';

import { revalidatePath } from 'next/cache';
import * as repo from '@/lib/repo/horizons';
import { createTask, updateTask } from '@/lib/repo/tasks';
import { parseDuration } from '@/lib/csv/duration';
import { enumOf, num, optNum, optStr, str } from '@/lib/forms';

const LEVELS = ['year', 'quarter', 'month', 'week'] as const;
const STATUSES = ['active', 'done', 'dropped'] as const;

// One local app, a handful of screens — refreshing the whole tree is cheaper
// than tracking which pages a horizon change can reach.
function refresh() {
  revalidatePath('/', 'layout');
}

/**
 * The parent select sends a horizon id, or "standalone" when the item is
 * deliberately unlinked. Either way it was an explicit choice — the form will
 * not submit without one.
 */
const parentOf = (form: FormData) => optNum(form, 'parentId');

export async function createHorizonAction(form: FormData): Promise<void> {
  await repo.createHorizon({
    level: enumOf(form, 'level', LEVELS, 'week'),
    title: str(form, 'title'),
    description: optStr(form, 'description'),
    periodStart: str(form, 'periodStart'),
    periodEnd: str(form, 'periodEnd'),
    parentId: parentOf(form),
    windowId: optNum(form, 'windowId'),
  });
  refresh();
}

export async function updateHorizonAction(form: FormData): Promise<void> {
  await repo.updateHorizon(num(form, 'id'), {
    title: str(form, 'title'),
    description: optStr(form, 'description'),
    parentId: parentOf(form),
    windowId: optNum(form, 'windowId'),
  });
  refresh();
}

export async function setHorizonStatusAction(form: FormData): Promise<void> {
  await repo.updateHorizon(num(form, 'id'), {
    status: enumOf(form, 'status', STATUSES, 'active'),
  });
  refresh();
}

export async function deleteHorizonAction(form: FormData): Promise<void> {
  await repo.deleteHorizon(num(form, 'id'));
  refresh();
}

/** Quick-add from a horizon row: "title + duration", linked straight to it. */
export async function addTaskToHorizonAction(form: FormData): Promise<void> {
  const minutes = parseDuration(str(form, 'duration'));
  if (minutes === null) throw new Error(`Could not read a duration from "${form.get('duration')}"`);
  await createTask({ title: str(form, 'title'), estimateMin: minutes, horizonId: num(form, 'horizonId') });
  refresh();
}

/** Weekly planning: move a task from a month's backlog into a week priority. */
export async function moveTaskToHorizonAction(form: FormData): Promise<void> {
  await updateTask(num(form, 'taskId'), { horizonId: num(form, 'horizonId') });
  refresh();
}
