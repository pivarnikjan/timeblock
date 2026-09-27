'use server';

import { revalidatePath } from 'next/cache';
import { RITUALS } from '@/lib/db/schema';
import { enumOf, str } from '@/lib/forms';
import { completeRitual } from '@/lib/repo/rituals';

/** Ticks off a planning step so it stops nagging for that period. */
export async function completeRitualAction(form: FormData): Promise<void> {
  await completeRitual(enumOf(form, 'kind', RITUALS, 'daily'), str(form, 'period'));
  revalidatePath('/', 'layout');
}
