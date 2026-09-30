'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clearCredentials } from '@/lib/google/credentials';
import { num, optNum, optStr, str } from '@/lib/forms';
import { updateSettings } from '@/lib/repo/settings';
import { syncBlockColors } from '@/lib/google/sync';
import { createWindow, deleteWindow, listWindows, updateWindow } from '@/lib/repo/windows';
import { parseHexColor, windowColors } from '@timeblock/core/calendar/colors';

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
  const before = windowColors(await listWindows());
  await updateWindow(num(form, 'id'), {
    name: str(form, 'name'),
    startTime,
    endTime,
    weekdays: weekdaysOf(form),
    color: parseHexColor(form.get('color')),
  });
  await followColors(before);
}

export async function deleteWindowAction(form: FormData): Promise<void> {
  const before = windowColors(await listWindows());
  await deleteWindow(num(form, 'id'));
  await followColors(before);
}

/**
 * After a window changed: when any window's colour is now different (its own,
 * or a default shifted by a deletion), TimeBlock's events in Google are
 * repainted to match.
 */
async function followColors(before: Map<number, string>): Promise<void> {
  revalidatePath('/', 'layout');
  const after = windowColors(await listWindows());
  if ([...before].some(([id, color]) => after.get(id) !== color)) await recolourGoogleAction();
}

/**
 * Settings → Time windows → "Apply window colours in Google Calendar": gives
 * every TimeBlock event in Google its window's colour, except those coloured by
 * hand, and reports back on the Settings page.
 */
export async function recolourGoogleAction(): Promise<void> {
  let query: string;
  try {
    const result = await syncBlockColors();
    query = `recoloured=${result.recoloured}&byHand=${result.chosenByHand}`;
  } catch (error) {
    query = `colorError=${encodeURIComponent((error as Error).message)}`;
  }
  revalidatePath('/', 'layout');
  redirect(`/settings?${query}#windows`);
}

export async function setDefaultWindowAction(form: FormData): Promise<void> {
  await updateSettings({ defaultWindowId: optNum(form, 'defaultWindowId') });
  revalidatePath('/', 'layout');
}
