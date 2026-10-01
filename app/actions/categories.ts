'use server';

import { revalidatePath } from 'next/cache';
import { withEnv } from '@/lib/env';
import { num } from '@/lib/forms';
import { syncCategoryColors } from '@timeblock/core/google/category-colors';
import { removeCategory, saveCategory } from '@timeblock/core/operations/events';

export type CategoryFormState =
  | { kind: 'idle' }
  | { kind: 'saved'; at: number; warning: string | null }
  | { kind: 'error'; message: string };

/** Settings → Categories: adds a category, or saves one when the form carries its `id`. Its events follow in Google. */
export async function saveCategoryAction(_prev: CategoryFormState, form: FormData): Promise<CategoryFormState> {
  const id = Number(form.get('id'));
  const result = await withEnv(saveCategory)(
    { name: String(form.get('name') ?? ''), color: String(form.get('color') ?? ''), keywords: String(form.get('keywords') ?? '') },
    Number.isInteger(id) && id > 0 ? id : undefined,
  );
  if (!result.ok) return { kind: 'error', message: result.message };
  revalidatePath('/', 'layout');
  return { kind: 'saved', at: Date.now(), warning: result.warning };
}

/** Deletes a category: its events go back to the title rules and lose the colour it gave them in Google. */
export async function deleteCategoryAction(form: FormData): Promise<void> {
  await withEnv(removeCategory)(num(form, 'id'));
  revalidatePath('/', 'layout');
}

export type RepaintState =
  | { kind: 'idle' }
  | { kind: 'done'; recoloured: number; chosenByHand: number; cleared: number; failed: number }
  | { kind: 'error'; message: string };

/** "Apply category colours in Google Calendar": every event in a category, the next three months. */
export async function applyCategoryColorsAction(): Promise<RepaintState> {
  try {
    return { kind: 'done', ...(await withEnv(syncCategoryColors)()) };
  } catch (error) {
    return { kind: 'error', message: (error as Error).message };
  }
}
