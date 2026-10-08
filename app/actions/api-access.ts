'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { replaceApiToken } from '@/lib/api/token';

/** Settings → LLM access → Replace token: clients holding the old one are locked out until given the new one. */
export async function replaceApiTokenAction(): Promise<void> {
  replaceApiToken();
  revalidatePath('/settings');
  redirect('/settings?token=replaced#llm-access');
}
