import 'server-only';
import { DateTime } from 'luxon';
import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { ritualLog, type RitualKind } from '@timeblock/core/db/schema';
import { keyFor } from '@timeblock/core/time/periods';

export async function completeRitual(kind: RitualKind, forPeriod: string): Promise<void> {
  await db()
    .insert(ritualLog)
    .values({ kind, forPeriod, completedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: [ritualLog.kind, ritualLog.forPeriod],
      set: { completedAt: new Date().toISOString() },
    });
}

export async function completedPeriods(pairs: { kind: RitualKind; period: string }[]): Promise<Set<string>> {
  if (pairs.length === 0) return new Set();

  // Matched as exact pairs rather than two independent IN lists, so a period
  // string shared across kinds can never mark the wrong ritual done.
  const rows = await db()
    .select()
    .from(ritualLog)
    .where(or(...pairs.map((p) => and(eq(ritualLog.kind, p.kind), eq(ritualLog.forPeriod, p.period)))));

  return new Set(rows.map((row) => `${row.kind}:${row.forPeriod}`));
}

export interface RitualStep {
  kind: RitualKind;
  period: string;
  label: string;
  href: string;
  done: boolean;
}

/**
 * The planning steps outstanding on `date`, coarsest first.
 *
 * Keyed on the period rather than the day, so a Monday spent in meetings still
 * surfaces the weekly review on Tuesday instead of silently skipping it.
 */
export async function ritualSteps(date: string, timezone: string): Promise<RitualStep[]> {
  const dt = DateTime.fromISO(date, { zone: timezone });

  const planned: Omit<RitualStep, 'done'>[] = [
    { kind: 'yearly', period: keyFor('year', dt), label: 'Set this year’s goals', href: '/year' },
    {
      kind: 'monthly',
      period: keyFor('month', dt),
      label: 'Define this month’s outcomes',
      href: '/month',
    },
    {
      kind: 'weekly',
      period: keyFor('week', dt),
      label: 'Choose this week’s priorities',
      href: '/week',
    },
    { kind: 'daily', period: date, label: 'Block out today', href: '/calendar?view=day' },
  ];

  const done = await completedPeriods(planned.map((p) => ({ kind: p.kind, period: p.period })));
  return planned.map((step) => ({ ...step, done: done.has(`${step.kind}:${step.period}`) }));
}

export async function isRitualDone(kind: RitualKind, period: string): Promise<boolean> {
  const row = await db()
    .select()
    .from(ritualLog)
    .where(and(eq(ritualLog.kind, kind), eq(ritualLog.forPeriod, period)))
    .get();
  return row !== undefined;
}
