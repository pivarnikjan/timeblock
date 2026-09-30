import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/rituals';
import type { RitualKind } from '@timeblock/core/db/schema';

export const completeRitual = withDb(store.completeRitual);
export const completedPeriods = withDb(store.completedPeriods);
export const isRitualDone = withDb(store.isRitualDone);

export interface RitualStep {
  kind: RitualKind;
  period: string;
  label: string;
  href: string;
  done: boolean;
}

const HREF: Record<store.RitualPlace, string> = { year: '/year', month: '/month', week: '/week', day: '/calendar?view=day' };

/** The planning steps outstanding on `date`, coarsest first, each linking to where it is done. */
export async function ritualSteps(date: string, timezone: string): Promise<RitualStep[]> {
  const steps = await withDb(store.ritualSteps)(date, timezone);
  return steps.map(({ place, ...step }) => ({ ...step, href: HREF[place] }));
}
