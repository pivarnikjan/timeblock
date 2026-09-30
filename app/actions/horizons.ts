'use server';

import { revalidatePath } from 'next/cache';
import { withDb } from '@/lib/env';
import * as repo from '@/lib/repo/horizons';
import { updateTask } from '@/lib/repo/tasks';
import { addHorizon, editHorizon, quickAddTask } from '@timeblock/core/operations/horizons';
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

/** A yearly goal's last year ("Runs until"), when the form has one. */
const untilYearOf = (form: FormData) => optNum(form, 'untilYear') ?? undefined;

export async function createHorizonAction(form: FormData): Promise<void> {
  const level = enumOf(form, 'level', LEVELS, 'week');
  const untilYear = level === 'year' ? untilYearOf(form) : undefined;
  // A goal over several years takes in a same-titled goal already set for one of them.
  await withDb(addHorizon)(
    {
      level,
      title: str(form, 'title'),
      description: optStr(form, 'description'),
      periodStart: str(form, 'periodStart'),
      periodEnd: untilYear ? `${untilYear}-12-31` : str(form, 'periodEnd'),
      parentId: parentOf(form),
      windowId: optNum(form, 'windowId'),
    },
    untilYear,
  );
  refresh();
}

export async function updateHorizonAction(form: FormData): Promise<void> {
  await withDb(editHorizon)(
    num(form, 'id'),
    {
      title: str(form, 'title'),
      description: optStr(form, 'description'),
      parentId: parentOf(form),
      windowId: optNum(form, 'windowId'),
    },
    untilYearOf(form),
  );
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
  await withDb(quickAddTask)(num(form, 'horizonId'), str(form, 'title'), str(form, 'duration'));
  refresh();
}

/** Weekly planning: move a task from a month's backlog into a week priority. */
export async function moveTaskToHorizonAction(form: FormData): Promise<void> {
  await updateTask(num(form, 'taskId'), { horizonId: num(form, 'horizonId') });
  refresh();
}
