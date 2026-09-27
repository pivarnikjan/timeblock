import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  clearPlanAction,
  commitPlanAction,
  completeBlockAction,
  generatePlanAction,
  reviewDayAction,
  toggleSegmentAction,
} from '@/app/actions/plan';
import { completeRitualAction } from '@/app/actions/rituals';
import { setTaskStatusAction } from '@/app/actions/tasks';
import { Breadcrumb, ProgressBar } from '@/components/progress';
import { Button, Card, Chip, EmptyState } from '@/components/ui';
import { ancestry, breadcrumb, formatMinutes, weekOfMonth } from '@/lib/hierarchy';
import type { DayView } from '@/lib/planner';
import * as blockRepo from '@/lib/repo/blocks';
import { isRitualDone, ritualSteps } from '@/lib/repo/rituals';
import { minutes } from '@/lib/scheduler/intervals';

/**
 * The daily planning ritual for one day — shown under the Calendar's Today
 * view: review yesterday, outstanding reviews, what the day rolls up to,
 * generate → commit, tick blocks off, and what is waiting to be scheduled.
 */
export async function PlanningPanel({ day }: { day: DayView }) {
  const { ctx } = day;
  const steps = await ritualSteps(day.date, ctx.settings.timezone);
  const review = day.isToday ? await pendingReview(day.date) : null;

  const drafts = day.blocks.filter((b) => b.state === 'draft');
  const committed = day.blocks.filter((b) => b.state !== 'draft');
  const freeMinutes = day.windowSlots.reduce((t, w) => t + w.slots.reduce((s, slot) => s + minutes(slot), 0), 0);
  const plannedMinutes = day.blocks.reduce((t, b) => t + b.segments.reduce((s, seg) => s + seg.minutes, 0), 0);
  const outstanding = steps.filter((step) => !step.done && step.kind !== 'daily' && step.kind !== 'review');

  return (
    <div className="space-y-6">
      {review && <ReviewYesterday review={review} zone={ctx.settings.timezone} />}

      {outstanding.length > 0 && (
        <Card className="border-accent/40">
          <h2 className="text-sm font-medium">Before you block out the day</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {outstanding.map((step) => (
              <li key={step.kind} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <Link href={step.href} className="text-accent underline underline-offset-2">
                  {step.label}
                </Link>
                <span className="text-xs text-muted">({step.period})</span>
                <form action={completeRitualAction} className="ml-auto">
                  <input type="hidden" name="kind" value={step.kind} />
                  <input type="hidden" name="period" value={step.period} />
                  <Button tone="ghost" type="submit">
                    Reviewed
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <GoalLadder day={day} />

      <div className="flex flex-wrap items-center gap-3">
        <form action={generatePlanAction}>
          <input type="hidden" name="date" value={day.date} />
          <Button tone="primary" type="submit">
            {day.blocks.length > 0 ? 'Re-plan the day' : 'Generate the day'}
          </Button>
        </form>
        <form action={commitPlanAction}>
          <input type="hidden" name="date" value={day.date} />
          <Button type="submit" disabled={drafts.length === 0}>
            Commit {drafts.length > 0 ? `${drafts.length} block${drafts.length === 1 ? '' : 's'}` : ''} to Google
          </Button>
        </form>
        {day.blocks.length > 0 && (
          <form action={clearPlanAction} className="ml-auto">
            <input type="hidden" name="date" value={day.date} />
            <Button tone="danger" type="submit">
              Clear the day
            </Button>
          </form>
        )}
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <Stat label="Free in windows" value={formatMinutes(freeMinutes)} />
        <Stat label="Planned" value={formatMinutes(plannedMinutes)} />
        <Stat label="Meetings" value={`${day.events.filter((e) => e.busy && e.blockId === null).length}`} />
        <Stat label="Committed" value={`${committed.length} / ${day.blocks.length}`} />
      </div>

      <BlockChecklist day={day} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">In the running today ({day.candidates.length})</h2>
          {day.candidates.length === 0 ? (
            <EmptyState>
              Nothing to schedule. Put tasks under this week&apos;s priorities, or pull something in from the backlog.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {day.candidates.map((c) => {
                const task = ctx.tasks.find((t) => t.id === c.id)!;
                const windowName = ctx.windows.find((w) => w.id === c.windowId)?.name ?? 'Anytime';
                return (
                  <li key={c.id} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <Chip>P{task.priority}</Chip>
                      <Chip title="Time window this task is scheduled in">⏱ {windowName}</Chip>
                      <span className="text-xs tabular-nums text-muted">
                        {c.remainingMin < task.estimateMin
                          ? `${formatMinutes(c.remainingMin)} left of ${formatMinutes(task.estimateMin)}`
                          : formatMinutes(task.estimateMin)}
                      </span>
                    </div>
                    <Breadcrumb trail={breadcrumb(task.horizonId, ctx.byId)} className="mt-0.5 block truncate" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Not scheduled on its own ({day.backlog.length})</h2>
          <p className="text-xs text-muted">
            Month backlogs and loose tasks. Move them into a week on the Week screen, or pull one in for today.
          </p>
          {day.backlog.length === 0 ? (
            <EmptyState>
              Nothing waiting. <Link href="/tasks" className="underline">Capture something</Link>.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {day.backlog.slice(0, 15).map((task) => (
                <li key={task.id} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <Chip>{formatMinutes(task.estimateMin)}</Chip>
                    <form action={setTaskStatusAction}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="status" value="active" />
                      <Button type="submit">Pull in</Button>
                    </form>
                  </div>
                  <Breadcrumb trail={breadcrumb(task.horizonId, ctx.byId)} className="mt-0.5 block truncate" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Review yesterday ────────────────────────────────────────────────────────

interface PendingReview {
  date: string;
  blocks: blockRepo.BlockWithSegments[];
}

/** The last planned day before today, if it still has open work and was not reviewed. */
async function pendingReview(today: string): Promise<PendingReview | null> {
  const date = await blockRepo.lastPlannedDateBefore(today);
  if (!date || (await isRitualDone('review', date))) return null;
  const blocks = (await blockRepo.listForDate(date)).filter((b) => b.segments.some((s) => s.doneAt === null));
  return blocks.length > 0 ? { date, blocks } : null;
}

function ReviewYesterday({ review, zone }: { review: PendingReview; zone: string }) {
  const label = DateTime.fromISO(review.date).toFormat('cccc d LLL');
  return (
    <Card className="border-accent">
      <h2 className="text-sm font-medium">Step 1 · Review {label}</h2>
      <p className="mt-1 text-xs text-muted">
        Tick what you actually finished. Anything left unticked is planned again with only the minutes that remain.
      </p>
      <form action={reviewDayAction} className="mt-3 space-y-3">
        <input type="hidden" name="date" value={review.date} />
        {review.blocks.map((block) => (
          <fieldset key={block.id} className="rounded-md border border-border px-3 py-2">
            <legend className="px-1 text-xs text-muted">
              {DateTime.fromISO(block.startsAt, { zone }).toFormat('HH:mm')}–
              {DateTime.fromISO(block.endsAt, { zone }).toFormat('HH:mm')}
            </legend>
            {block.segments
              .filter((s) => s.doneAt === null)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" name="segmentId" value={s.id} className="accent-[var(--accent)]" />
                  <span className="flex-1">{s.task.title}</span>
                  <span className="text-xs text-muted">{formatMinutes(s.minutes)}</span>
                </label>
              ))}
          </fieldset>
        ))}
        <Button tone="primary" type="submit">
          Save review
        </Button>
      </form>
    </Card>
  );
}

// ── Goal ladder ─────────────────────────────────────────────────────────────

/** This week's priorities, each with the chain it rolls up through and a bar per level. */
function GoalLadder({ day }: { day: DayView }) {
  const { ctx } = day;
  const weeks = ctx.horizons.filter(
    (h) => h.level === 'week' && h.status === 'active' && h.periodStart <= day.date && h.periodEnd >= day.date,
  );
  if (weeks.length === 0) {
    return (
      <p className="text-sm text-muted">
        No priorities set for this week yet — <Link href={`/week?date=${day.date}`} className="underline">choose them</Link> so
        today&apos;s work rolls up to something.
      </p>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium">What today rolls up to</h2>
      <div className="space-y-4">
        {weeks.map((week) => (
          <div key={week.id} className="grid gap-2 sm:grid-cols-3">
            {ancestry(week.id, ctx.byId).map((h) => (
              <div key={h.id} className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  {h.level === 'week' ? weekOfMonth(h.periodStart).label.split(' (')[0] : h.level === 'month' ? DateTime.fromISO(h.periodStart).toFormat('LLLL') : h.periodStart.slice(0, 4)}
                </p>
                <Link href={`/${h.level}?date=${h.periodStart}`} className="block truncate text-sm hover:underline">
                  {h.title}
                </Link>
                <ProgressBar progress={ctx.progress.get(h.id)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Block checklist ─────────────────────────────────────────────────────────

function BlockChecklist({ day }: { day: DayView }) {
  const zone = day.ctx.settings.timezone;
  if (day.blocks.length === 0) {
    return <EmptyState>No blocks yet. Generate the day to see them here.</EmptyState>;
  }
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Blocks</h2>
      {day.blocks.map((block) => {
        const allDone = block.segments.every((s) => s.doneAt !== null);
        return (
          <div key={block.id} className="rounded-md border border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="font-medium tabular-nums text-foreground">
                {DateTime.fromISO(block.startsAt, { zone }).toFormat('HH:mm')}–
                {DateTime.fromISO(block.endsAt, { zone }).toFormat('HH:mm')}
              </span>
              <span>{block.state === 'draft' ? 'draft' : block.state === 'done' ? 'kept' : 'in Google'}</span>
              {!allDone && (
                <form action={completeBlockAction} className="ml-auto">
                  <input type="hidden" name="blockId" value={block.id} />
                  <Button tone="ghost" type="submit" className="!px-1 !py-0 text-xs">
                    All done
                  </Button>
                </form>
              )}
            </div>
            <ul className="mt-1">
              {block.segments.map((s) => {
                const done = s.doneAt !== null;
                return (
                  <li key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <form action={toggleSegmentAction}>
                      <input type="hidden" name="segmentId" value={s.id} />
                      <input type="hidden" name="done" value={done ? '0' : '1'} />
                      <button
                        type="submit"
                        title={done ? 'Untick' : 'Tick off'}
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                          done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border hover:border-accent'
                        }`}
                      >
                        {done ? '✓' : ''}
                      </button>
                    </form>
                    <span className={`min-w-0 flex-1 truncate ${done ? 'text-muted line-through' : ''}`}>{s.task.title}</span>
                    <span className="text-xs tabular-nums text-muted">{formatMinutes(s.minutes)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
