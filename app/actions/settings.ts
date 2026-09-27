'use server';

import { revalidatePath } from 'next/cache';
import { clearCredentials } from '@/lib/google/credentials';
import { num, optNum, optStr, str } from '@/lib/forms';
import { updateSettings } from '@/lib/repo/settings';
import { createWindow, deleteWindow, updateWindow } from '@/lib/repo/windows';
import { parseHexColor } from '@/lib/calendar/colors';

export async function updateDayShapeAction(form: FormData): Promise<void> {
  await updateSettings({
    timezone: str(form, 'timezone'),
    dayStart: str(form, 'dayStart'),
    dayEnd: str(form, 'dayEnd'),
    bufferMin: num(form, 'bufferMin'),
    maxFocusBlockMin: num(form, 'maxFocusBlockMin'),
    minBlockMin: num(form, 'minBlockMin'),
    lunchStart: str(form, 'lunchStart'),
    lunchMin: num(form, 'lunchMin'),
  });
  revalidatePath('/', 'layout');
}

export async function setTargetCalendarAction(form: FormData): Promise<void> {
  await updateSettings({ targetCalendarId: optStr(form, 'targetCalendarId') });
  revalidatePath('/', 'layout');
}

/** Removes the local refresh token. The grant itself stays until revoked in Google. */
export async function disconnectGoogleAction(): Promise<void> {
  clearCredentials();
  revalidatePath('/', 'layout');
}

/** Weekday checkboxes arrive as repeated `weekdays` fields; stored as "1,2,3,4,5". */
function weekdaysOf(form: FormData): string {
  const days = form
    .getAll('weekdays')
    .map(Number)
    .filter((d) => d >= 1 && d <= 7)
    .sort();
  return days.length > 0 ? days.join(',') : '1,2,3,4,5';
}

function assertOrder(start: string, end: string) {
  if (start >= end) throw new Error(`A window must end after it starts (${start}–${end})`);
}

export async function createWindowAction(form: FormData): Promise<void> {
  const startTime = str(form, 'startTime');
  const endTime = str(form, 'endTime');
  assertOrder(startTime, endTime);
  await createWindow({
    name: str(form, 'name'),
    startTime,
    endTime,
    weekdays: weekdaysOf(form),
    sortOrder: optNum(form, 'sortOrder') ?? 99,
    color: parseHexColor(form.get('color')),
  });
  revalidatePath('/', 'layout');
}

export async function updateWindowAction(form: FormData): Promise<void> {
  const startTime = str(form, 'startTime');
  const endTime = str(form, 'endTime');
  assertOrder(startTime, endTime);
  await updateWindow(num(form, 'id'), {
    name: str(form, 'name'),
    startTime,
    endTime,
    weekdays: weekdaysOf(form),
    color: parseHexColor(form.get('color')),
  });
  revalidatePath('/', 'layout');
}

export async function deleteWindowAction(form: FormData): Promise<void> {
  await deleteWindow(num(form, 'id'));
  revalidatePath('/', 'layout');
}

export async function setDefaultWindowAction(form: FormData): Promise<void> {
  await updateSettings({ defaultWindowId: optNum(form, 'defaultWindowId') });
  revalidatePath('/', 'layout');
}
