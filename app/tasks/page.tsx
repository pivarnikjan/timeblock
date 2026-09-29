import { DateTime } from 'luxon';
import {
  createTaskAction,
  deleteTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from '@/app/actions/tasks';
import { WindowSelect } from '@/components/horizon-screen';
import { Breadcrumb } from '@/components/progress';
import { ENERGY, type Horizon, type Task, type TimeWindow } from '@/lib/db/schema';
import { breadcrumb, indexHorizons, type HorizonIndex } from '@/lib/hierarchy';
import { listAllHorizons } from '@/lib/repo/horizons';
import { getSettings } from '@/lib/repo/settings';
import { listTasks } from '@/lib/repo/tasks';
import { listWindows } from '@/lib/repo/windows';
import { nowIn } from '@/lib/time/periods';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const PRIORITIES = [
  { value: 1, label: '1 — must happen' },
  { value: 2, label: '2 — important' },
  { value: 3, label: '3 — normal' },
  { value: 4, label: '4 — someday' },
];

const ENERGY_LABEL: Record<(typeof ENERGY)[number], string> = {
  deep: 'Deep — needs a long, quiet slot',
  shallow: 'Shallow — fine between meetings',
  admin: 'Admin — fill the fragments',
};

const ENERGY_COLOR: Record<(typeof ENERGY)[number], string> = {
  deep: 'text-deep',
  shallow: 'text-shallow',
  admin: 'text-admin',
};

export default async function TasksPage() {
  const settings = await getSettings();
  const today = nowIn(settings.timezone).toISODate()!;

  const [open, done, horizons, windows] = await Promise.all([
    listTasks(['backlog', 'active']),
    listTasks(['done']),
    listAllHorizons(),
    listWindows(),
  ]);
  const byId = indexHorizons(horizons);

  // A task serves one week priority (scheduled from that Monday) or one month
  // outcome (its backlog). Current and future periods only.
  const live = horizons.filter((h) => h.status === 'active' && h.periodEnd >= today);
  const horizonOptions: Option[] = [
    ...live.filter((h) => h.level === 'week').map((h) => ({ ...h, group: 'Week priorities — scheduled from their Monday' })),
    ...live.filter((h) => h.level === 'month').map((h) => ({ ...h, group: 'Month outcomes — backlog until moved into a week' })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        subtitle="The backlog the daily planner draws from. Mark work active to make it schedulable today."
      />

      <Card>
        <h2 className="mb-3 text-sm font-medium">Capture a task</h2>
        <form action={createTaskAction} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Task">
              <Input name="title" required placeholder="What needs doing?" />
            </Field>
          </div>
          <Field label="Estimate (minutes)">
            <Input name="estimateMin" type="number" min={5} step={5} defaultValue={60} />
          </Field>
          <Field label="Priority">
            <Select name="priority" defaultValue={3}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Energy">
            <Select name="energy" defaultValue="deep">
              {ENERGY.map((e) => (
                <option key={e} value={e}>
                  {ENERGY_LABEL[e]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input name="dueDate" type="date" />
          </Field>
          <Field label="Serves which goal?">
            <HorizonSelect options={horizonOptions} byId={byId} />
          </Field>
          <Field label="Time window">
            <WindowSelect windows={windows} />
          </Field>
          <SequentialField />
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea name="notes" rows={2} />
            </Field>
          </div>
          <div>
            <Button tone="primary" type="submit">
              Add task
            </Button>
          </div>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Open ({open.length})</h2>
        {open.length === 0 ? (
          <EmptyState>Nothing captured yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {open.map((task) => (
              <TaskRow key={task.id} task={task} horizons={horizonOptions} today={today} byId={byId} windows={windows} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Done ({done.length})</h2>
          <ul className="space-y-2">
            {done.slice(0, 20).map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-2 text-sm"
              >
                <span className="flex-1 text-muted line-through">{task.title}</span>
                <form action={setTaskStatusAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value="backlog" />
                  <Button tone="ghost" type="submit">
                    Reopen
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type Option = Horizon & { group: string };

/** The "sequential session" box: one a day, in order, a week's sessions inside one week. */
function SequentialField({ checked = false }: { checked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm sm:col-span-2">
      <input type="checkbox" name="sequential" defaultChecked={checked} className="mt-1" />
      <span>
        Sequential session
        <span className="block text-xs text-muted">
          Like a training plan: never two on one day, never before the one ahead of it is done, and a week&apos;s
          sessions all within one week — an interrupted week starts again from its first session.
        </span>
      </span>
    </label>
  );
}

function HorizonSelect({ options, selected, byId }: { options: Option[]; selected?: number | null; byId: HorizonIndex }) {
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <Select name="horizonId" defaultValue={selected ?? ''}>
      <option value="">— not connected —</option>
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {options
            .filter((o) => o.group === group)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {breadcrumb(o.id, byId).slice(1).join(' › ') || o.title}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

function TaskRow({
  task,
  horizons,
  today,
  byId,
  windows,
}: {
  task: Task;
  horizons: Option[];
  today: string;
  byId: HorizonIndex;
  windows: TimeWindow[];
}) {
  const overdue = task.dueDate !== null && task.dueDate < today;
  const window = windows.find((w) => w.id === task.windowId);

  return (
    <li className="rounded-lg border border-border bg-surface">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
          <span className="flex-1 text-sm font-medium">{task.title}</span>
          <Chip>P{task.priority}</Chip>
          <span className={`text-xs font-medium ${ENERGY_COLOR[task.energy]}`}>{task.energy}</span>
          <Chip>{task.estimateMin}m</Chip>
          {task.dueDate && (
            <span className={`text-xs ${overdue ? 'font-medium text-red-500' : 'text-muted'}`}>
              due {DateTime.fromISO(task.dueDate).toFormat('d LLL')}
            </span>
          )}
          {window && <Chip title="Own time window">⏱ {window.name}</Chip>}
          <Chip>{task.status}</Chip>
          <Breadcrumb trail={breadcrumb(task.horizonId, byId)} className="basis-full" />
        </summary>

        <div className="space-y-3 border-t border-border p-4">
          <form action={updateTaskAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={task.id} />
            <div className="sm:col-span-2">
              <Field label="Task">
                <Input name="title" defaultValue={task.title} required />
              </Field>
            </div>
            <Field label="Estimate (minutes)">
              <Input
                name="estimateMin"
                type="number"
                min={5}
                step={5}
                defaultValue={task.estimateMin}
              />
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue={task.priority}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Energy">
              <Select name="energy" defaultValue={task.energy}>
                {ENERGY.map((e) => (
                  <option key={e} value={e}>
                    {ENERGY_LABEL[e]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input name="dueDate" type="date" defaultValue={task.dueDate ?? ''} />
            </Field>
            <Field label="Serves which goal?">
              <HorizonSelect options={horizons} selected={task.horizonId} byId={byId} />
            </Field>
            <Field label="Time window">
              <WindowSelect windows={windows} selected={task.windowId} />
            </Field>
            <SequentialField checked={task.sequential} />
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Textarea name="notes" rows={2} defaultValue={task.notes ?? ''} />
              </Field>
            </div>
            <div>
              <Button type="submit">Save</Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <StatusButton id={task.id} status="active" current={task.status} label="Active" />
            <StatusButton id={task.id} status="backlog" current={task.status} label="Backlog" />
            <StatusButton id={task.id} status="done" current={task.status} label="Done" />
            <StatusButton id={task.id} status="dropped" current={task.status} label="Dropped" />
            <form action={deleteTaskAction} className="ml-auto">
              <input type="hidden" name="id" value={task.id} />
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

function StatusButton({
  id,
  status,
  current,
  label,
}: {
  id: number;
  status: Task['status'];
  current: Task['status'];
  label: string;
}) {
  return (
    <form action={setTaskStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" tone={current === status ? 'primary' : 'default'}>
        {label}
      </Button>
    </form>
  );
}
