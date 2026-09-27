'use client';

import Link from 'next/link';
import { DateTime } from 'luxon';
import { useActionState, type MouseEvent } from 'react';
import { planCalendarAction, type PlanCalendarState } from '@/app/actions/plan';
import { Button } from '@/components/ui';
import { formatMinutes } from '@/lib/hierarchy';

const day = (date: string) => DateTime.fromISO(date).toFormat('ccc d LLL');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface DraftOverview {
  blocks: number;
  days: number;
  first: string | null;
  last: string | null;
}

/**
 * "Plan calendar": one click lays every task into its window, day after day
 * from today, until all of it has a place. The result is drafts on the grid —
 * drag any of them to adjust — and nothing reaches Google until "Commit".
 */
export function PlanCalendarBar({ drafts, googleConnected }: { drafts: DraftOverview; googleConnected: boolean }) {
  const [state, action, pending] = useActionState<PlanCalendarState, FormData>(planCalendarAction, { kind: 'idle' });

  const confirmCommit = (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(`Send ${plural(drafts.blocks, 'block')} to Google Calendar? TimeBlock's earlier blocks from today on that you did not pin are replaced.`)) {
      e.preventDefault();
    }
  };
  const confirmDiscard = (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(`Throw away ${plural(drafts.blocks, 'draft block')}, including any you moved by hand?`)) e.preventDefault();
  };

  return (
    <section className="space-y-2 rounded-lg border border-border bg-surface px-4 py-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <Button tone="primary" type="submit" name="intent" value="plan" disabled={pending}>
          {pending ? 'Working…' : 'Plan calendar'}
        </Button>
        {drafts.blocks > 0 && (
          <>
            <Button
              type="submit"
              name="intent"
              value="commit"
              disabled={pending || !googleConnected}
              onClick={confirmCommit}
              title={googleConnected ? undefined : 'Connect Google Calendar in Settings first'}
            >
              Commit {plural(drafts.blocks, 'block')} to Google
            </Button>
            <Button tone="ghost" type="submit" name="intent" value="discard" disabled={pending} onClick={confirmDiscard}>
              Discard drafts
            </Button>
            {drafts.first && (
              <span className="text-xs text-muted">
                Draft plan: {drafts.first === drafts.last ? day(drafts.first) : `${day(drafts.first)} – ${day(drafts.last!)}`} ·{' '}
                {plural(drafts.days, 'day')}
              </span>
            )}
          </>
        )}
      </form>

      {state.kind === 'idle' && (
        <p className="text-xs text-muted">
          Lays every scheduled task into its window, day after day from today, until all of it has a place — around your
          meetings, and keeping each course in order. Drag any block to adjust it; a block you move is pinned (📌) and the
          next plan works around it.
        </p>
      )}
      {state.kind === 'error' && <p className="text-sm text-red-500">Could not finish: {state.message}</p>}
      {state.kind === 'discarded' && <p className="text-sm text-muted">Discarded {plural(state.blocks, 'draft block')}.</p>}
      {state.kind === 'committed' && (
        <p className="text-sm text-emerald-600">
          Committed: {plural(state.result.created, 'event')} created across {plural(state.result.days, 'day')}
          {state.result.removed > 0 ? `, ${plural(state.result.removed, 'earlier event')} replaced` : ''}.
        </p>
      )}
      {state.kind === 'planned' && <PlanSummary summary={state.summary} />}
    </section>
  );
}

function PlanSummary({ summary: s }: { summary: Extract<PlanCalendarState, { kind: 'planned' }>['summary'] }) {
  return (
    <div className="space-y-1.5 text-sm">
      {s.firstDate && s.lastDate ? (
        <p>
          Planned <strong>{plural(s.tasksPlaced, 'task')}</strong> · {formatMinutes(s.plannedMinutes)} in{' '}
          {plural(s.blocks, 'block')} over {plural(s.days, 'day')} ({day(s.firstDate)} – {day(s.lastDate)}).{' '}
          <Link href={`/calendar?view=workweek&date=${s.firstDate}`} className="text-accent underline underline-offset-2">
            Review from {day(s.firstDate)} →
          </Link>
        </p>
      ) : (
        <p>Nothing to plan — no open task is in a week yet or marked active.</p>
      )}
      {s.pinned > 0 && <p className="text-xs text-muted">Worked around {plural(s.pinned, 'block')} you placed by hand.</p>}
      {s.unfinished.length > 0 && (
        <p className="text-xs text-amber-600">
          Did not fit in the next three months: {s.unfinished.map((u) => `${u.title} (${formatMinutes(u.minutes)})`).join(', ')}.
        </p>
      )}
      {s.notScheduled > 0 && (
        <p className="text-xs text-muted">
          {plural(s.notScheduled, 'open task')} {s.notScheduled === 1 ? 'is' : 'are'} not in any week and was left out — move{' '}
          {s.notScheduled === 1 ? 'it' : 'them'} into a week on the <Link href="/week" className="underline">Week</Link> screen,
          or mark {s.notScheduled === 1 ? 'it' : 'them'} active.
        </p>
      )}
      {s.problem && <p className="text-xs text-red-500">Google Calendar could not be read, so meetings were not avoided: {s.problem}</p>}
    </div>
  );
}
