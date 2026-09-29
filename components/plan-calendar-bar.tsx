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
        <Button
          type="submit"
          name="intent"
          value="reschedule-preview"
          disabled={pending}
          title="Move the planned work that no longer fits — after new meetings or blocks you moved — and everything after it"
        >
          Reschedule…
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
          next plan works around it. New meetings since? <strong>Reschedule…</strong> shows how many tasks no longer fit and,
          once you confirm, moves just those — and everything after them.
        </p>
      )}
      {state.kind === 'error' && <p className="text-sm text-red-500">Could not finish: {state.message}</p>}
      {state.kind === 'discarded' && <p className="text-sm text-muted">Discarded {plural(state.blocks, 'draft block')}.</p>}
      {state.kind === 'committed' && (
        <p className="text-sm text-emerald-600">
          Committed: {plural(state.result.created, 'event')} created across {plural(state.result.days, 'day')}
          {state.result.removed > 0 ? `, ${plural(state.result.removed, 'earlier event')} replaced` : ''}
          {state.result.recoloured ? `, ${plural(state.result.recoloured, 'earlier event')} given its window's colour` : ''}.
        </p>
      )}
      {state.kind === 'planned' && <PlanSummary summary={state.summary} />}
      {state.kind === 'reschedule-preview' && (
        <form action={action}>
          <ReschedulePreview summary={state.summary} pending={pending} />
        </form>
      )}
      {state.kind === 'rescheduled' && <RescheduleDone result={state.result} />}
    </section>
  );
}

type RescheduleSummary = Extract<PlanCalendarState, { kind: 'reschedule-preview' }>['summary'];

/** The titles of the first few impacted tasks, then "and N more". */
function taskList(tasks: RescheduleSummary['impacted'], shown = 6): string {
  const head = tasks.slice(0, shown).map((t) => t.title).join(', ');
  return tasks.length > shown ? `${head} and ${tasks.length - shown} more` : head;
}

/** Nothing for a reschedule to do (mirrors `rescheduleIsEmpty` in the planner). */
const isEmpty = (s: RescheduleSummary) => s.removed === 0 && s.added === 0 && s.doneAhead === 0;

/** Weeks of sequential sessions that start again — a vacation or a missed day broke them. */
function Restarts({ restarts }: { restarts: RescheduleSummary['restarts'] }) {
  if (restarts.length === 0) return null;
  return (
    <>
      {restarts.map((r, i) => (
        <p key={i} className="text-xs text-amber-600">
          ↻ The week starting with “{r.first}” cannot be finished within one week, so it starts again from its first session
          {r.on ? ` on ${day(r.on)}` : ', but does not fit in the next three months'}
          {r.redone > 0 && ` — ${plural(r.redone, 'session')} already done ${r.redone === 1 ? 'is' : 'are'} done again`}; the weeks after
          it move back.
        </p>
      ))}
    </>
  );
}

function RescheduleNotes({ summary: s, done = false }: { summary: RescheduleSummary; done?: boolean }) {
  return (
    <>
      <Restarts restarts={s.restarts} />
      {s.finished.length > 0 && (
        <p className="text-xs text-muted">
          ✓ Already finished, so no longer planned: {taskList(s.finished)} — {done ? 'their blocks were taken off' : 'their blocks come off'} the
          calendar.
        </p>
      )}
      {s.doneAhead > 0 && (
        <p className="text-xs text-muted">
          ✓ {plural(s.doneAhead, 'block')} you ticked off ahead of time {done ? (s.doneAhead === 1 ? 'was moved' : 'were moved') : s.doneAhead === 1 ? 'moves' : 'move'} back
          to when you did {s.doneAhead === 1 ? 'it' : 'them'}, freeing {s.doneAhead === 1 ? 'its slot' : 'their slots'} for what comes next.
        </p>
      )}
      {s.unfinished.length > 0 && (
        <p className="text-xs text-amber-600">
          Does not fit in the next three months: {s.unfinished.map((u) => `${u.title} (${formatMinutes(u.minutes)})`).join(', ')}.
        </p>
      )}
      {s.problem && <p className="text-xs text-red-500">Google Calendar could not be read, so meetings were not avoided: {s.problem}</p>}
    </>
  );
}

/** "3 blocks are replaced by 4", "2 new blocks", "2 blocks come off" — whichever applies. */
function blockChanges(s: RescheduleSummary, done = false): string {
  if (s.removed > 0 && s.added > 0) {
    return `${plural(s.removed, 'block')} ${done ? '' : s.removed === 1 ? 'is ' : 'are '}replaced by ${s.added}`;
  }
  if (s.added > 0) return `${plural(s.added, 'new block')}`;
  return `${plural(s.removed, 'block')} ${done ? 'taken off' : s.removed === 1 ? 'comes off' : 'come off'}`;
}

/** What the confirm button does, in a few words. */
function confirmLabel(s: RescheduleSummary): string {
  if (s.impacted.length > 0) return `Reschedule ${plural(s.impacted.length, 'task')}`;
  return 'Update the calendar';
}

/** Step one of "Reschedule": what would move, and a button to go ahead. */
function ReschedulePreview({ summary: s, pending }: { summary: RescheduleSummary; pending: boolean }) {
  if (isEmpty(s)) {
    return (
      <div className="space-y-1.5 text-sm">
        <p>Nothing to reschedule — every planned block still fits where it is.</p>
        <RescheduleNotes summary={s} />
        <Button tone="ghost" type="submit" name="intent" value="cancel" disabled={pending}>
          Close
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2.5 text-sm">
      {s.impacted.length > 0 ? (
        <p>
          <strong>{plural(s.impacted.length, 'task')} impacted</strong>
          {s.firstChange && <> from {day(s.firstChange)}</>}: {taskList(s.impacted)}.
        </p>
      ) : (
        <p>
          <strong>No task has to move</strong> — only work you already finished changes.
        </p>
      )}
      {(s.removed > 0 || s.added > 0) && (
        <p className="text-xs text-muted">
          {blockChanges(s)}
          {s.kept > 0 && `; ${plural(s.kept, 'block')} stay${s.kept === 1 ? 's' : ''} exactly where ${s.kept === 1 ? 'it is' : 'they are'}`}.
          {s.conflicts > 0 && ` ${plural(s.conflicts, 'block')} collide${s.conflicts === 1 ? 's' : ''} with a meeting or vacation.`}
          {s.released > 0 &&
            ` ${plural(s.released, 'block')} you placed by hand ${s.released === 1 ? 'has' : 'have'} a meeting on ${s.released === 1 ? 'it' : 'them'} and will be moved too.`}
          {s.toGoogle ? ' Google Calendar is updated too.' : ' The new blocks are drafts — commit them when you are happy.'}
        </p>
      )}
      <RescheduleNotes summary={s} />
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" type="submit" name="intent" value="reschedule" disabled={pending}>
          {pending ? 'Rescheduling…' : confirmLabel(s)}
        </Button>
        <Button tone="ghost" type="submit" name="intent" value="cancel" disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RescheduleDone({ result: r }: { result: Extract<PlanCalendarState, { kind: 'rescheduled' }>['result'] }) {
  if (isEmpty(r)) return <p className="text-sm text-muted">Nothing to reschedule — every planned block still fits.</p>;
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-emerald-600">
        {r.impacted.length > 0 ? `Rescheduled ${plural(r.impacted.length, 'task')}` : 'Calendar updated'}
        {(r.removed > 0 || r.added > 0) && `: ${blockChanges(r, true)}`}
        {r.kept > 0 && `, ${r.kept} left as they were`}
        {r.toGoogle && r.created > 0 && ` · ${plural(r.created, 'event')} created in Google Calendar`}.{' '}
        {r.firstChange && (
          <Link href={`/calendar?view=workweek&date=${r.firstChange}`} className="text-accent underline underline-offset-2">
            Review from {day(r.firstChange)} →
          </Link>
        )}
      </p>
      <RescheduleNotes summary={r} done />
    </div>
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
      <Restarts restarts={s.restarts} />
      {s.unfinished.length > 0 && (
        <p className="text-xs text-amber-600">
          Did not fit in the next three months: {s.unfinished.map((u) => `${u.title} (${formatMinutes(u.minutes)})`).join(', ')}.
        </p>
      )}
      {s.later.count > 0 && s.later.until && (
        <p className="text-xs text-muted">
          {plural(s.later.count, 'dated task')} fall after the next three months (until {day(s.later.until)}) and will be
          planned when their dates come closer.
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
