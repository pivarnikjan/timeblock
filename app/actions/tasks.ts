'use server';

import { revalidatePath } from 'next/cache';
import { ENERGY } from '@/lib/db/schema';
import { enumOf, num, optNum, optStr, str } from '@/lib/forms';
import * as repo from '@/lib/repo/tasks';

const STATUSES = ['backlog', 'active', 'done', 'dropped'] as const;

function refresh() {
  revalidatePath('/', 'layout');
}

export async function createTaskAction(form: FormData): Promise<void> {
  await repo.createTask({
    title: str(form, 'title'),
    notes: optStr(form, 'notes'),
    horizonId: optNum(form, 'horizonId'),
    estimateMin: optNum(form, 'estimateMin') ?? 60,
    priority: optNum(form, 'priority') ?? 3,
    energy: enumOf(form, 'energy', ENERGY, 'deep'),
    dueDate: optStr(form, 'dueDate'),
    status: enumOf(form, 'status', STATUSES, 'backlog'),
    windowId: optNum(form, 'windowId'),
    sequential: form.get('sequential') === 'on',
  });
  refresh();
}

export async function updateTaskAction(form: FormData): Promise<void> {
  await repo.updateTask(num(form, 'id'), {
    title: str(form, 'title'),
    notes: optStr(form, 'notes'),
    horizonId: optNum(form, 'horizonId'),
    estimateMin: optNum(form, 'estimateMin') ?? 60,
    priority: optNum(form, 'priority') ?? 3,
    energy: enumOf(form, 'energy', ENERGY, 'deep'),
    dueDate: optStr(form, 'dueDate'),
    windowId: optNum(form, 'windowId'),
    sequential: form.get('sequential') === 'on',
  });
  refresh();
}

export async function setTaskStatusAction(form: FormData): Promise<void> {
  await repo.setTaskStatus(num(form, 'id'), enumOf(form, 'status', STATUSES, 'backlog'));
  refresh();
}

export async function deleteTaskAction(form: FormData): Promise<void> {
  await repo.deleteTask(num(form, 'id'));
  refresh();
}
