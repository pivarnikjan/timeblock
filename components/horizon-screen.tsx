import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  addTaskToHorizonAction,
  createHorizonAction,
  deleteHorizonAction,
  moveTaskToHorizonAction,
  setHorizonStatusAction,
  updateHorizonAction,
} from '@/app/actions/horizons';
import { setTaskStatusAction } from '@/app/actions/tasks';
import type { Horizon, Task, TimeWindow } from '@timeblock/core/db/schema';
import {
  breadcrumb,
  findUnconnected,
  formatMinutes,
  remainingMinutes,
  weekOfMonth,
  yearsLabel,
} from '@timeblock/core/hierarchy';
import { loadContext, outlook, type Outlook, type PlanningContext } from '@/lib/planner';
import { periodFor, resolvePeriod, reviewParentLevel, shift, type Level } from '@timeblock/core/time/periods';
import { Breadcrumb, OutlookBadge, ProgressBar } from '@/components/progress';
import { Button, Card, Chip, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';

type ReviewLevel = 'year' | 'month' | 'week';

const COPY: Record<ReviewLevel, { title: string; subtitle: string; noun: string; nouns: string }> = {
  year: {
    title: 'Year',
    subtitle: 'The 40,000ft view. Expand a goal to drill down through its months, weeks and tasks.',
    noun: 'yearly goal',
    nouns: 'yearly goals',
  },
  month: {
    title: 'Month',
    subtitle: 'What has to be true by month end. Each outcome serves one yearly goal; its weeks and backlog sit underneath.',
    noun: 'monthly outcome',
    nouns: 'monthly outcomes',
  },
  week: {
    title: 'Week',
    subtitle: 'The few priorities this week is about. Tasks under them are scheduled as soon as there is room — the week is their deadline.',
    noun: 'weekly priority',
    nouns: 'weekly priorities',
  },
};

/** Everything a screen needs, resolved once. */
interface Scope {
  ctx: PlanningContext;
  outlook: Outlook;
  childrenOf: (id: number) => Horizon[];
  tasksOf: (id: number) => Task[];
}

function buildScope(ctx: PlanningContext, look: Outlook): Scope {
  const live = (h: Horizon) => h.status !== 'dropped';
  return {
    ctx,
    outlook: look,
    childrenOf: (id) =>
      ctx.horizons.filter((h) => h.parentId === id && live(h)).sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
    tasksOf: (id) =>
      ctx.tasks.filter((t) => t.horizonId === id && t.status !== 'dropped').sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function HorizonScreen({ level, date }: { level: ReviewLevel; date?: string }) {
  const ctx = await loadContext();
  const look = await outlook(ctx);
  const scope = buildScope(ctx, look);

  const period = resolvePeriod(level, ctx.settings.timezone, date);
  const anchor = DateTime.fromISO(period.start, { zone: ctx.settings.timezone });
  // A yearly goal over several years is listed on each of them.
  const items = ctx.horizons
    .filter((h) =>
      h.level === level && (level === 'year' ? h.periodStart <= period.end && h.periodEnd >= period.start : h.periodStart === period.start),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const parentLevel = reviewParentLevel(level);
  const parentOptions = parentLevel
    ? ctx.horizons.filter(
        (h) =>
          h.level === parentLevel && h.status !== 'dropped' && h.periodStart <= period.end && h.periodEnd >= period.start,
      )
    : [];

  const copy = COPY[level];
  const href = (offset: number) => `/${level}?date=${periodFor(level, shift(level, anchor, offset)).start}`;
  const heading = level === 'week' ? weekOfMonth(period.start).label : period.label;

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <NavLink href={href(-1)}>← Previous</NavLink>
            <NavLink href={`/${level}`}>Current</NavLink>
            <NavLink href={href(1)}>Next →</NavLink>
          </>
        }
      />

      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-medium">{heading}</h2>
        <span className="text-xs text-muted">
          {period.start} → {period.end}
        </span>
      </div>

      {level === 'month' && <WeeksOfMonth scope={scope} monthStart={period.start} />}
      {level === 'week' && <MoveIntoWeek scope={scope} weekStart={period.start} weekEnd={period.end} priorities={items} />}

      {items.length === 0 ? (
        <EmptyState>
          No {copy.nouns} yet for {heading}.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <HorizonCard
              key={item.id}
              horizon={item}
              scope={scope}
              parentOptions={parentOptions}
              parentLevel={parentLevel}
              period={period}
            />
          ))}
        </ul>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium">Add a {copy.noun}</h3>
        <form action={createHorizonAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="level" value={level} />
          <input type="hidden" name="periodStart" value={period.start} />
          <input type="hidden" name="periodEnd" value={period.end} />
          <div className="sm:col-span-2">
            <Field label="Outcome">
              <Input name="title" required placeholder={`e.g. ${placeholderFor(level)}`} />
            </Field>
          </div>
          {parentLevel && (
            <Field label={`Serves which ${parentLevel === 'year' ? 'yearly goal' : 'monthly outcome'}?`}>
              <ParentSelect options={parentOptions} />
            </Field>
          )}
          <Field label="Time window for everything below">
            <WindowSelect windows={ctx.windows} />
          </Field>
          {level === 'year' && <UntilYearField firstYear={Number(period.start.slice(0, 4))} />}
          <div className="sm:col-span-2">
            <Field label="Why it matters / what done looks like">
              <Textarea name="description" rows={2} />
            </Field>
          </div>
          <div>
            <Button tone="primary" type="submit">
              Add
            </Button>
          </div>
        </form>
      </Card>

      <NotConnected scope={scope} />
    </div>
  );
}

function placeholderFor(level: Level): string {
  if (level === 'year') return 'CIS-ITSM Certification';
  if (level === 'month') return 'ServiceNow ITSM Fundamentals';
  return 'IT Service Management';
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/**
 * The parent is a required, explicit choice: a goal to serve, or "standalone"
 * on purpose. There is no silent default, so the chain cannot break by accident.
 */
function ParentSelect({ options, selected }: { options: Horizon[]; selected?: number | null }) {
  const value = selected === undefined ? '' : selected === null ? 'standalone' : String(selected);
  return (
    <Select name="parentId" defaultValue={value} required>
      <option value="" disabled>
        Choose…
      </option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.level === 'week' ? `${weekOfMonth(option.periodStart).label} · ` : ''}
          {option.title}
        </option>
      ))}
      <option value="standalone">No parent (standalone)</option>
    </Select>
  );
}

/**
 * "Runs until": the last year of a yearly goal. Running into a later year makes
 * it one goal over both, and takes in a same-titled goal set for that year.
 */
function UntilYearField({ firstYear, selected }: { firstYear: number; selected?: number }) {
  const years = Array.from({ length: 6 }, (_, i) => firstYear + i);
  return (
    <Field label="Runs until">
      <Select name="untilYear" defaultValue={selected ?? firstYear}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y === firstYear ? `${y} (this year only)` : `end of ${y}`}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function WindowSelect({ windows, selected }: { windows: TimeWindow[]; selected?: number | null }) {
  return (
    <Select name="windowId" defaultValue={selected ?? ''}>
      <option value="">Inherit</option>
      {windows.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name} ({w.startTime}–{w.endTime})
        </option>
      ))}
    </Select>
  );
}

function windowName(ctx: PlanningContext, id: number | null) {
  return id === null ? null : ctx.windows.find((w) => w.id === id)?.name ?? null;
}

function HorizonCard({
  horizon,
  scope,
  parentOptions,
  parentLevel,
  period,
}: {
  horizon: Horizon;
  scope: Scope;
  parentOptions: Horizon[];
  parentLevel: Level | null;
  /** The period on screen: a goal over several years shows this year's part. */
  period: { start: string; end: string };
}) {
  const { ctx } = scope;
  const done = horizon.status === 'done';
  const trail = breadcrumb(horizon.parentId, ctx.byId);
  const ownWindow = windowName(ctx, horizon.windowId);

  return (
    <li className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="min-w-0 flex-1">
          {horizon.level !== 'year' && <Breadcrumb trail={trail} className="mb-0.5 block" />}
          <p className={`font-medium ${done ? 'text-muted line-through' : ''}`}>{horizon.title}</p>
          {horizon.description && <p className="mt-0.5 text-sm text-muted">{horizon.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OutlookBadge outlook={scope.outlook.horizons.get(horizon.id)} />
            {ownWindow && <Chip title="Everything below inherits this window">⏱ {ownWindow}</Chip>}
            {horizon.level === 'year' && horizon.periodStart.slice(0, 4) !== horizon.periodEnd.slice(0, 4) && (
              <Chip title="One goal over several years; listed on each of them">📅 {yearsLabel(horizon)}</Chip>
            )}
            {horizon.status === 'dropped' && <Chip>dropped</Chip>}
          </div>
        </div>
        <ProgressBar progress={ctx.progress.get(horizon.id)} />
      </div>

      <div className="border-t border-border px-4 py-3">
        {horizon.level === 'year' && <YearTree horizon={horizon} scope={scope} period={period} />}
        {horizon.level === 'month' && <MonthDetail horizon={horizon} scope={scope} />}
        {horizon.level === 'week' && <WeekDetail horizon={horizon} scope={scope} />}
      </div>

      <details className="border-t border-border">
        <summary className="cursor-pointer px-4 py-2 text-xs text-muted hover:text-foreground">Edit</summary>
        <div className="space-y-3 px-4 pb-4">
          <form action={updateHorizonAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={horizon.id} />
            <div className="sm:col-span-2">
              <Field label="Outcome">
                <Input name="title" defaultValue={horizon.title} required />
              </Field>
            </div>
            {parentLevel && (
              <Field label={`Serves which ${parentLevel === 'year' ? 'yearly goal' : 'monthly outcome'}?`}>
                <ParentSelect options={parentOptions} selected={horizon.parentId} />
              </Field>
            )}
            <Field label="Time window for everything below">
              <WindowSelect windows={ctx.windows} selected={horizon.windowId} />
            </Field>
            {horizon.level === 'year' && (
              <UntilYearField firstYear={Number(horizon.periodStart.slice(0, 4))} selected={Number(horizon.periodEnd.slice(0, 4))} />
            )}
            <div className="sm:col-span-2">
              <Field label="Why it matters / what done looks like">
                <Textarea name="description" rows={2} defaultValue={horizon.description ?? ''} />
              </Field>
            </div>
            <div>
              <Button type="submit">Save</Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <StatusButton id={horizon.id} status="active" current={horizon.status} label="Active" />
            <StatusButton id={horizon.id} status="done" current={horizon.status} label="Done" />
            <StatusButton id={horizon.id} status="dropped" current={horizon.status} label="Dropped" />
            <span className="text-xs text-muted">Period ends {horizon.periodEnd}</span>
            <form action={deleteHorizonAction} className="ml-auto">
              <input type="hidden" name="id" value={horizon.id} />
              <Button tone="danger" type="submit">
                Delete
              </Button>
            </form>
          </div>
        </div>
      </details>
    </li>
  );
}

// ── drill-down pieces ────────────────────────────────────────────────────────

function Row({
  label,
  horizon,
  scope,
  children,
}: {
  label: string;
  horizon: Horizon;
  scope: Scope;
  children?: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 py-1.5">
        <span className="text-xs text-muted transition-transform group-open:rotate-90">▶</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {label}
          {horizon.status === 'done' && <span className="ml-2 text-xs text-emerald-600">done</span>}
        </span>
        <OutlookBadge outlook={scope.outlook.horizons.get(horizon.id)} />
        <ProgressBar progress={scope.ctx.progress.get(horizon.id)} compact />
      </summary>
      <div className="ml-5 border-l border-border pl-3">{children}</div>
    </details>
  );
}

function TaskLine({ task, scope, showForecast = true }: { task: Task; scope: Scope; showForecast?: boolean }) {
  const ticked = scope.ctx.ticked.get(task.id) ?? 0;
  const left = remainingMinutes(task, ticked);
  const finish = scope.outlook.tasks.get(task.id);
  const done = task.status === 'done';

  return (
    <div className="flex flex-wrap items-center gap-2 py-1 text-sm">
      <form action={setTaskStatusAction}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="status" value={done ? 'backlog' : 'done'} />
        <button
          type="submit"
          title={done ? 'Reopen' : 'Mark done'}
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border hover:border-accent'
          }`}
        >
          {done ? '✓' : ''}
        </button>
      </form>
      <span className={`min-w-0 flex-1 truncate ${done ? 'text-muted line-through' : ''}`}>{task.title}</span>
      <span className="text-xs tabular-nums text-muted">
        {done ? formatMinutes(task.estimateMin) : ticked > 0 ? `${formatMinutes(left)} left of ${formatMinutes(task.estimateMin)}` : formatMinutes(task.estimateMin)}
      </span>
      {showForecast && !done && finish && (
        <span className="text-[11px] text-muted">→ {DateTime.fromISO(finish).toFormat('ccc d LLL')}</span>
      )}
    </div>
  );
}

function YearTree({ horizon, scope, period }: { horizon: Horizon; scope: Scope; period: { start: string; end: string } }) {
  const all = scope.childrenOf(horizon.id);
  // A goal over several years shows the months of the year on screen; the rest are on their own year.
  const months = all.filter((m) => m.periodStart <= period.end && m.periodEnd >= period.start);
  const elsewhere = all.length - months.length;
  const own = scope.tasksOf(horizon.id);
  if (all.length === 0 && own.length === 0) {
    return <p className="text-xs text-muted">No monthly outcomes serve this goal yet — add them on the Month screen.</p>;
  }
  return (
    <div>
      {elsewhere > 0 && (
        <p className="pb-1 text-xs text-muted">
          {period.start.slice(0, 4)}&apos;s months below · {elsewhere} more {elsewhere === 1 ? 'is' : 'are'} on the other years
          of {yearsLabel(horizon)}.
        </p>
      )}
      {months.map((month) => (
        <Row key={month.id} horizon={month} scope={scope} label={`${DateTime.fromISO(month.periodStart).toFormat('LLL yyyy')} · ${month.title}`}>
          <MonthDetail horizon={month} scope={scope} />
        </Row>
      ))}
      {own.map((t) => (
        <TaskLine key={t.id} task={t} scope={scope} />
      ))}
    </div>
  );
}

function MonthDetail({ horizon, scope }: { horizon: Horizon; scope: Scope }) {
  const weeks = scope.childrenOf(horizon.id);
  const backlog = scope.tasksOf(horizon.id);
  const candidateWeeks = scope.ctx.horizons.filter(
    (h) => h.level === 'week' && h.status === 'active' && h.periodStart <= horizon.periodEnd && h.periodEnd >= horizon.periodStart,
  );

  return (
    <div>
      {weeks.length === 0 && backlog.length === 0 && (
        <p className="py-1 text-xs text-muted">No weeks or tasks under this outcome yet.</p>
      )}
      {weeks.map((week) => (
        <Row key={week.id} horizon={week} scope={scope} label={`${weekOfMonth(week.periodStart).label.split(' (')[0]} · ${week.title}`}>
          <WeekDetail horizon={week} scope={scope} />
        </Row>
      ))}
      {backlog.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted">
            Month backlog — scheduled once moved into a week (or on its due date, if it has one)
          </p>
          {backlog.map((task) => (
            <div key={task.id} className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <TaskLine task={task} scope={scope} showForecast={task.dueDate !== null} />
              </div>
              {task.status !== 'done' && candidateWeeks.length > 0 && (
                <form action={moveTaskToHorizonAction} className="flex items-center gap-1">
                  <input type="hidden" name="taskId" value={task.id} />
                  <Select name="horizonId" required defaultValue="" className="!w-auto !py-1 text-xs">
                    <option value="" disabled>
                      Move into week…
                    </option>
                    {candidateWeeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {weekOfMonth(w.periodStart).label.split(' (')[0]} · {w.title}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" className="!py-1 text-xs">
                    Move
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekDetail({ horizon, scope }: { horizon: Horizon; scope: Scope }) {
  const tasks = scope.tasksOf(horizon.id);
  return (
    <div>
      {tasks.length === 0 && <p className="py-1 text-xs text-muted">No tasks under this priority yet.</p>}
      {tasks.map((task) => (
        <TaskLine key={task.id} task={task} scope={scope} />
      ))}
      <form action={addTaskToHorizonAction} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="horizonId" value={horizon.id} />
        <Input name="title" required placeholder="Add a task…" className="!w-auto flex-1 !py-1 text-xs" />
        <Input name="duration" required placeholder="e.g. 1h 25m" className="!w-28 !py-1 text-xs" />
        <Button type="submit" className="!py-1 text-xs">
          Add
        </Button>
      </form>
    </div>
  );
}

/**
 * The month's planning weeks by the ISO Thursday rule, with what each one holds —
 * so "week 1" always means the same dates, and an empty week reads as buffer.
 */
function WeeksOfMonth({ scope, monthStart }: { scope: Scope; monthStart: string }) {
  const month = DateTime.fromISO(monthStart);
  let monday = month.startOf('week');
  if (monday.plus({ days: 3 }).month !== month.month) monday = monday.plus({ weeks: 1 });

  const weeks: DateTime[] = [];
  for (let w = monday; w.plus({ days: 3 }).month === month.month; w = w.plus({ weeks: 1 })) weeks.push(w);

  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {weeks.map((w) => {
        const start = w.toISODate()!;
        const priorities = scope.ctx.horizons.filter((h) => h.level === 'week' && h.periodStart === start && h.status !== 'dropped');
        return (
          <Link
            key={start}
            href={`/week?date=${start}`}
            className="rounded-md border border-border bg-surface px-3 py-2 text-xs hover:border-accent"
          >
            <p className="font-medium">{weekOfMonth(start).label.split(' (')[0]}</p>
            <p className="text-muted">{weekOfMonth(start).label.split(' (')[1]?.replace(')', '')}</p>
            <p className={`mt-1 ${priorities.length === 0 ? 'text-amber-600' : 'text-muted'}`}>
              {priorities.length === 0 ? 'free — buffer' : priorities.map((p) => p.title).join(', ')}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Weekly planning: the backlog of every month outcome this week touches, each
 * task one click from becoming this week's work.
 */
function MoveIntoWeek({
  scope,
  weekStart,
  weekEnd,
  priorities,
}: {
  scope: Scope;
  weekStart: string;
  weekEnd: string;
  priorities: Horizon[];
}) {
  const months = scope.ctx.horizons.filter(
    (h) => h.level === 'month' && h.status === 'active' && h.periodStart <= weekEnd && h.periodEnd >= weekStart,
  );
  const backlog = months.flatMap((m) =>
    scope.tasksOf(m.id).filter((t) => t.status === 'backlog' || t.status === 'active').map((t) => ({ task: t, month: m })),
  );
  const targets = priorities.filter((p) => p.status === 'active');
  if (backlog.length === 0) return null;

  return (
    <Card>
      <h3 className="text-sm font-medium">Move into this week</h3>
      <p className="mt-1 text-xs text-muted">
        Month backlog tasks are not scheduled until they belong to a week. Pick what this week is for.
      </p>
      {targets.length === 0 && (
        <p className="mt-2 text-xs text-amber-600">Add a weekly priority below first — tasks move under one.</p>
      )}
      <ul className="mt-3 space-y-1">
        {backlog.map(({ task, month }) => (
          <li key={task.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
            <span className="text-xs text-muted">{month.title}</span>
            <span className="text-xs tabular-nums text-muted">{formatMinutes(task.estimateMin)}</span>
            {targets.length > 0 && (
              <form action={moveTaskToHorizonAction} className="flex items-center gap-1">
                <input type="hidden" name="taskId" value={task.id} />
                <Select name="horizonId" required defaultValue={targets.length === 1 ? String(targets[0].id) : ''} className="!w-auto !py-1 text-xs">
                  <option value="" disabled>
                    Under…
                  </option>
                  {targets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </Select>
                <Button type="submit" className="!py-1 text-xs">
                  Move
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NotConnected({ scope }: { scope: Scope }) {
  const loose = findUnconnected(scope.ctx.horizons, scope.ctx.tasks);
  if (loose.horizons.length === 0 && loose.tasks.length === 0) return null;

  return (
    <Card className="border-amber-500/40">
      <h3 className="text-sm font-medium">Not connected</h3>
      <p className="mt-1 text-xs text-muted">
        These don&apos;t roll up to anything, so they are missing from every progress bar above them. Standalone on
        purpose? That&apos;s fine — this list is just a reminder.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {loose.horizons.map((h) => (
          <li key={`h${h.id}`}>
            <Link href={`/${h.level}?date=${h.periodStart}`} className="underline underline-offset-2">
              {h.level === 'week' ? weekOfMonth(h.periodStart).label.split(' (')[0] : DateTime.fromISO(h.periodStart).toFormat('LLL yyyy')} · {h.title}
            </Link>
          </li>
        ))}
        {loose.tasks.map((t) => (
          <li key={`t${t.id}`}>
            <Link href="/tasks" className="underline underline-offset-2">
              Task · {t.title}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatusButton({
  id,
  status,
  current,
  label,
}: {
  id: number;
  status: Horizon['status'];
  current: Horizon['status'];
  label: string;
}) {
  return (
    <form action={setHorizonStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" tone={current === status ? 'primary' : 'default'}>
        {label}
      </Button>
    </form>
  );
}
