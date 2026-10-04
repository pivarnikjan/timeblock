'use client';

import Link from 'next/link';
import { DateTime } from 'luxon';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { missBlockAction, type MissedState } from '@/app/actions/plan';
import { Button } from '@/components/ui';
import { calendarHref, type CalendarView } from '@timeblock/core/calendar/views';

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/**
 * "Didn't get to it": for a block whose work was not done in its time. The
 * unticked work moves to the next free slot in its window, and each task's
 * slip is counted (see the Dashboard).
 */
export function MissedButton({ blockId, zone, view }: { blockId: number; zone: string; view: CalendarView }) {
  const [state, action, pending] = useActionState<MissedState, FormData>(missBlockAction, { kind: 'idle' });
  const router = useRouter();
  const movedTo = state.kind === 'moved' ? state.result.to : null;

  // Follow the work to where it went, so its panel stays open there.
  useEffect(() => {
    if (!movedTo) return;
    const date = DateTime.fromISO(movedTo.startsAt, { zone }).toISODate()!;
    router.replace(calendarHref(view, date, `block:${movedTo.blockId}`), { scroll: false });
  }, [movedTo, router, view, zone]);

  if (state.kind === 'moved') {
    const { to, shifted, counts, problem } = state.result;
    const start = DateTime.fromISO(to.startsAt, { zone });
    const end = DateTime.fromISO(to.endsAt, { zone });
    return (
      <div className="space-y-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-2 text-xs">
        <p>
          ↻ Moved to <strong>{start.toFormat('ccc d LLL · HH:mm')} – {end.toFormat('HH:mm')}</strong>, pinned (📌).{' '}
          <Link href={calendarHref(view, start.toISODate()!, `block:${to.blockId}`)} scroll={false} className="text-accent underline underline-offset-2">
            Open it →
          </Link>
        </p>
        {shifted > 0 && (
          <p className="text-muted">
            {shifted === 1 ? 'The next block' : `The next ${shifted} blocks`} of its course moved after it, so the course stays in order.
          </p>
        )}
        {counts.map((c) => (
          <p key={c.taskId} className="text-muted">
            “{c.title}” — rescheduled for the {ordinal(c.count)} time.
          </p>
        ))}
        {problem && <p className="text-amber-600">Google Calendar could not be read, so meetings were not avoided: {problem}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="blockId" value={blockId} />
      <Button type="submit" disabled={pending} className="w-full" title="Move the unticked work to the next free slot in its window, and count it as rescheduled">
        {pending ? 'Finding a slot…' : '↻ Didn’t get to it — find the next slot'}
      </Button>
      <p className="text-xs text-muted">
        Tick off what you did first; the rest moves to the first free slot in its window and counts as a reschedule on the Dashboard.
      </p>
      {state.kind === 'error' && <p className="text-xs text-red-500">{state.message}</p>}
    </form>
  );
}
