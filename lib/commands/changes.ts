import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { ENERGY, type Task } from '@timeblock/core/db/schema';
import type { Env } from '@timeblock/core/env';
import { isGone } from '@timeblock/core/google/calendar-api';
import { changeEventTime } from '@timeblock/core/google/event-time';
import { parseEvent, type CalendarSummary } from '@timeblock/core/google/events';
import { listCalendars } from '@timeblock/core/google/reads';
import { createEvent, editEventDetails, planNewEvent } from '@timeblock/core/operations/events';
import { deleteGoogleEvent } from '@timeblock/core/operations/vacation';
import { listAllHorizons } from '@timeblock/core/store/horizons';
import { getSettings } from '@timeblock/core/store/settings';
import * as taskStore from '@timeblock/core/store/tasks';
import { listWindows } from '@timeblock/core/store/windows';
import { CommandError, needGoogle, type Command } from './command';
import { DATE, TIME } from './reads';
import type { JsonSchema } from './schema';

/**
 * Changes are previewed, then applied (decision_log.md, ADR-001): `preview_changes`
 * works out what a list of changes would do and keeps it as a change set;
 * `apply_changes` carries that set out — unless what it touches has changed in
 * the meantime, in which case nothing is done and a new preview is needed.
 */

const TASK_STATUSES = ['backlog', 'active', 'done', 'dropped'] as const;

const TASK_FIELDS = {
  title: { type: 'string', minLength: 1, maxLength: 300 },
  estimateMin: { type: 'integer', minimum: 1, maximum: 6000, description: 'how long it takes, in minutes (1h 25m = 85)' },
  priority: { type: 'integer', minimum: 1, maximum: 4, description: '1 = highest, 4 = lowest' },
  energy: { type: 'string', enum: ENERGY },
  dueDate: { ...DATE, description: 'due date, YYYY-MM-DD; an empty text clears it', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
  status: { type: 'string', enum: TASK_STATUSES, description: 'backlog waits; active is planned as soon as there is room' },
  goalId: { type: 'integer', description: 'the goal it serves (an id from list_goals); 0 for none' },
  windowId: { type: 'integer', description: 'the time window it is planned in (an id from get_context); 0 to inherit' },
  notes: { type: 'string', maxLength: 5000 },
  sequential: { type: 'boolean', description: 'a session of a training plan: one a day, in order, never split' },
} as const satisfies Record<string, JsonSchema>;

const EVENT_REF = {
  calendarId: { type: 'string', minLength: 1, description: 'from list_events' },
  eventId: { type: 'string', minLength: 1, description: 'from list_events' },
} as const satisfies Record<string, JsonSchema>;

const kind = (name: string): JsonSchema => ({ type: 'string', const: name });

const CHANGE: JsonSchema = {
  description: 'One change; "kind" says which.',
  anyOf: [
    {
      type: 'object',
      description: 'Create an event in a Google calendar. Leave out both times for an all-day event.',
      properties: {
        kind: kind('create_event'),
        title: { type: 'string', minLength: 1, maxLength: 300 },
        date: { ...DATE, description: 'the day it starts, YYYY-MM-DD' },
        startTime: TIME,
        endTime: { ...TIME, description: 'a 24-hour time, HH:mm; at or before the start means the next day' },
        endDate: { ...DATE, description: 'all-day events only: the last day it covers, YYYY-MM-DD' },
        calendarId: { type: 'string', description: 'a writable calendar from get_context; left out: the primary calendar' },
        description: { type: 'string', maxLength: 8000 },
        location: { type: 'string', maxLength: 500 },
        recurrence: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'repeat rules, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=FR"]; left out: it does not repeat' },
      },
      required: ['kind', 'title', 'date'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Change a Google event: its time, title, description or location. Only the fields given change; a new start without a new end keeps the length.',
      properties: {
        kind: kind('update_event'),
        ...EVENT_REF,
        title: { type: 'string', minLength: 1, maxLength: 300 },
        date: { ...DATE, description: 'the day it moves to, YYYY-MM-DD' },
        startTime: TIME,
        endTime: TIME,
        description: { type: 'string', maxLength: 8000 },
        location: { type: 'string', maxLength: 500 },
        scope: {
          type: 'string',
          enum: ['this', 'following'],
          description: 'for a repeating event: "this" occurrence only (the default), or "following" — this and every later repeat (time changes only)',
        },
      },
      required: ['kind', 'calendarId', 'eventId'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Delete a Google event — for a repeating event, only this occurrence.',
      properties: { kind: kind('delete_event'), ...EVENT_REF },
      required: ['kind', 'calendarId', 'eventId'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Create a task. Left out: 60 minutes, priority 3, deep, backlog.',
      properties: { kind: kind('create_task'), ...TASK_FIELDS },
      required: ['kind', 'title'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Change a task. Only the fields given change.',
      properties: { kind: kind('update_task'), taskId: { type: 'integer', description: 'from list_tasks' }, ...TASK_FIELDS },
      required: ['kind', 'taskId'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Delete a task, with whatever was planned for it.',
      properties: { kind: kind('delete_task'), taskId: { type: 'integer', description: 'from list_tasks' } },
      required: ['kind', 'taskId'],
      additionalProperties: false,
    },
  ],
};

interface TaskFields {
  title?: string;
  estimateMin?: number;
  priority?: number;
  energy?: (typeof ENERGY)[number];
  dueDate?: string;
  status?: (typeof TASK_STATUSES)[number];
  goalId?: number;
  windowId?: number;
  notes?: string;
  sequential?: boolean;
}

export type Change =
  | { kind: 'create_event'; title: string; date: string; startTime?: string; endTime?: string; endDate?: string; calendarId?: string; description?: string; location?: string; recurrence?: string[] }
  | { kind: 'update_event'; calendarId: string; eventId: string; title?: string; date?: string; startTime?: string; endTime?: string; description?: string; location?: string; scope?: 'this' | 'following' }
  | { kind: 'delete_event'; calendarId: string; eventId: string }
  | ({ kind: 'create_task'; title: string } & TaskFields)
  | ({ kind: 'update_task'; taskId: number } & TaskFields)
  | { kind: 'delete_task'; taskId: number };

/** One change worked out against the data as it is now. */
interface Planned {
  /** One line a person can check: what happens, to what, when. */
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** What the change was worked out from; a different one at apply time means the preview is out of date. */
  basis: string;
  execute(): Promise<Record<string, unknown>>;
}

/** What several changes of one preview look up, looked up once. */
class Lookups {
  private calendarList?: Promise<CalendarSummary[]>;
  private settingsRow?: ReturnType<typeof getSettings>;
  private goalIds?: Promise<Map<number, string>>;
  private windowIds?: Promise<Map<number, string>>;
  constructor(readonly env: Env) {}

  settings = () => (this.settingsRow ??= getSettings(this.env.db));
  calendars = () => (this.calendarList ??= listCalendars(this.env));
  goals = () => (this.goalIds ??= listAllHorizons(this.env.db).then((all) => new Map(all.map((h) => [h.id, h.title]))));
  windows = () => (this.windowIds ??= listWindows(this.env.db).then((all) => new Map(all.map((w) => [w.id, w.name]))));
}

const day = (dt: DateTime) => dt.setLocale('en').toFormat('ccc d LLL yyyy');

/** "Thu 8 Oct 2026 12:00–13:00", or "Thu 8 Oct 2026 – Sat 10 Oct 2026 (all day)". */
function when(startIso: string, endIso: string, allDay: boolean, zone: string): string {
  const start = DateTime.fromISO(startIso).setZone(zone);
  const end = DateTime.fromISO(endIso).setZone(zone);
  if (allDay) {
    const last = end.minus({ days: 1 });
    return `${last.hasSame(start, 'day') ? day(start) : `${day(start)} – ${day(last)}`} (all day)`;
  }
  return `${day(start)} ${start.toFormat('HH:mm')}–${end.hasSame(start, 'day') ? '' : `${day(end)} `}${end.toFormat('HH:mm')}`;
}

const minutes = (min: number) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`);

async function planCreateEvent(look: Lookups, change: Extract<Change, { kind: 'create_event' }>): Promise<Planned> {
  needGoogle(look.env);
  const { timezone } = await look.settings();
  const plan = await planNewEvent(look.env, change);
  const at = when(plan.start, plan.end, plan.allDay, timezone);
  const repeats = plan.body.recurrence?.length ? ` · repeats (${plan.body.recurrence.join(' ')})` : '';
  return {
    summary: `Create event "${plan.body.summary}" · ${at}${repeats} · calendar ${plan.calendarName}`,
    after: { title: plan.body.summary, when: at, calendar: plan.calendarName },
    basis: '',
    execute: async () => ({ ...(await createEvent(look.env, change)) }),
  };
}

/** An existing event as Google has it now, and what the preview is held against. */
async function existingEvent(look: Lookups, calendarId: string, eventId: string) {
  needGoogle(look.env);
  const settings = await look.settings();
  if (calendarId === settings.targetCalendarId) throw new Error('TimeBlock’s own blocks and vacations are changed in TimeBlock, not as events.');
  const calendar = (await look.calendars()).find((c) => c.id === calendarId);
  if (!calendar) throw new Error(`No calendar "${calendarId}" is shown in TimeBlock.`);
  if (!calendar.writable) throw new Error(`The calendar "${calendar.summary}" is read-only.`);

  const raw = await look.env.google
    .calendar()
    .getEvent(calendarId, eventId)
    .catch((error) => {
      if (isGone(error)) throw new Error('No such event — it may have been deleted. List the events again.');
      throw error;
    });
  const event = parseEvent(raw, calendarId, settings.timezone);
  if (!event) throw new Error('That event is cancelled.');
  const basis = JSON.stringify([raw.status, raw.summary, raw.start, raw.end, raw.recurrence, raw.description, raw.location]);
  return { event, raw, calendar, basis, zone: settings.timezone };
}

async function planUpdateEvent(look: Lookups, change: Extract<Change, { kind: 'update_event' }>): Promise<Planned> {
  const { event, raw, calendar, basis, zone } = await existingEvent(look, change.calendarId, change.eventId);
  const scope = change.scope ?? 'this';
  const details = { title: change.title, description: change.description, location: change.location };
  const wantsDetails = Object.values(details).some((v) => v !== undefined);
  const wantsTime = change.date !== undefined || change.startTime !== undefined || change.endTime !== undefined;
  if (!wantsDetails && !wantsTime) throw new Error('Nothing to change: give a new time, title, description or location.');
  if (scope === 'following' && wantsDetails) throw new Error('"following" changes the time only — change the title, description or location in a change of their own.');

  let start = DateTime.fromISO(event.start).setZone(zone);
  let end = DateTime.fromISO(event.end).setZone(zone);
  if (wantsTime) {
    if (event.allDay) throw new Error('All-day events are moved in Google Calendar.');
    const length = end.diff(start);
    const date = change.date ?? start.toISODate()!;
    start = DateTime.fromISO(`${date}T${change.startTime ?? start.toFormat('HH:mm')}`, { zone });
    if (change.endTime) {
      end = DateTime.fromISO(`${date}T${change.endTime}`, { zone });
      if (end <= start) end = end.plus({ days: 1 });
    } else {
      end = start.plus(length);
    }
    if (!start.isValid || !end.isValid) throw new Error('That is not a real date and time.');
  }

  const title = change.title?.trim() ?? event.title;
  const was = when(event.start, event.end, event.allDay, zone);
  const becomes = when(start.toUTC().toISO()!, end.toUTC().toISO()!, event.allDay, zone);
  const parts = [
    wantsTime ? `${was} → ${becomes}` : was,
    change.title !== undefined ? `renamed "${title}"` : null,
    change.description !== undefined ? 'new description' : null,
    change.location !== undefined ? `location "${change.location.trim()}"` : null,
    event.recurring ? (scope === 'following' ? 'this and every following repeat' : 'this occurrence only') : null,
  ].filter(Boolean);

  return {
    summary: `Change event "${event.title}" · ${parts.join(' · ')} · calendar ${calendar.summary}`,
    before: { title: event.title, when: was, description: raw.description ?? '', location: raw.location ?? '' },
    after: { title, when: becomes, description: change.description ?? raw.description ?? '', location: change.location ?? raw.location ?? '' },
    basis,
    async execute() {
      // Details first: a change for "this and following" may give the occurrence a new series.
      if (wantsDetails) await editEventDetails(look.env, change.calendarId, change.eventId, details);
      if (!wantsTime) return {};
      const moved = await changeEventTime(look.env, {
        calendarId: change.calendarId,
        eventId: change.eventId,
        seriesId: event.seriesId,
        start: start.toUTC().toISO()!,
        end: end.toUTC().toISO()!,
        scope,
      });
      return { seriesId: moved.seriesId, newSeries: moved.split };
    },
  };
}

async function planDeleteEvent(look: Lookups, change: Extract<Change, { kind: 'delete_event' }>): Promise<Planned> {
  const { event, calendar, basis, zone } = await existingEvent(look, change.calendarId, change.eventId);
  const at = when(event.start, event.end, event.allDay, zone);
  return {
    summary: `Delete event "${event.title}" · ${at}${event.recurring ? ' · this occurrence only' : ''} · calendar ${calendar.summary}`,
    before: { title: event.title, when: at },
    basis,
    async execute() {
      await deleteGoogleEvent(look.env, change.calendarId, change.eventId);
      return {};
    },
  };
}

/** A task's fields as the store takes them, checked; only those given. */
async function taskValues(look: Lookups, fields: TaskFields): Promise<taskStore.TaskPatch> {
  const values: taskStore.TaskPatch = {};
  if (fields.title !== undefined) values.title = fields.title.trim();
  if (fields.estimateMin !== undefined) values.estimateMin = fields.estimateMin;
  if (fields.priority !== undefined) values.priority = fields.priority;
  if (fields.energy !== undefined) values.energy = fields.energy;
  if (fields.notes !== undefined) values.notes = fields.notes.trim() || null;
  if (fields.sequential !== undefined) values.sequential = fields.sequential;
  if (fields.dueDate !== undefined) {
    if (fields.dueDate !== '' && !DateTime.fromISO(fields.dueDate).isValid) throw new Error(`${fields.dueDate} is not a real date.`);
    values.dueDate = fields.dueDate || null;
  }
  if (fields.goalId !== undefined) {
    if (fields.goalId !== 0 && !(await look.goals()).has(fields.goalId)) throw new Error(`There is no goal ${fields.goalId} — see list_goals.`);
    values.horizonId = fields.goalId || null;
  }
  if (fields.windowId !== undefined) {
    if (fields.windowId !== 0 && !(await look.windows()).has(fields.windowId)) throw new Error(`There is no time window ${fields.windowId} — see get_context.`);
    values.windowId = fields.windowId || null;
  }
  return values;
}

async function describeTask(look: Lookups, task: Pick<Task, 'title' | 'estimateMin' | 'priority' | 'energy' | 'dueDate' | 'status' | 'horizonId' | 'windowId' | 'notes' | 'sequential'>) {
  return {
    title: task.title,
    estimate: minutes(task.estimateMin),
    priority: task.priority,
    energy: task.energy,
    dueDate: task.dueDate,
    status: task.status,
    goal: task.horizonId ? ((await look.goals()).get(task.horizonId) ?? null) : null,
    window: task.windowId ? ((await look.windows()).get(task.windowId) ?? null) : null,
    notes: task.notes,
    sequential: task.sequential,
  };
}

const taskLine = (t: Awaited<ReturnType<typeof describeTask>>) =>
  [`${t.estimate}`, `priority ${t.priority}`, t.energy, t.status, t.dueDate ? `due ${t.dueDate}` : null, t.goal ? `under "${t.goal}"` : null, t.window ? `window ${t.window}` : null, t.sequential ? 'sequential' : null]
    .filter(Boolean)
    .join(' · ');

async function planCreateTask(look: Lookups, change: Extract<Change, { kind: 'create_task' }>): Promise<Planned> {
  const { status, ...fields } = change;
  const values = { estimateMin: 60, priority: 3, energy: 'deep' as const, dueDate: null, horizonId: null, windowId: null, notes: null, sequential: false, ...(await taskValues(look, fields)) };
  const title = change.title.trim();
  if (title === '') throw new Error('Give the task a title.');
  const after = await describeTask(look, { ...values, title, status: status ?? 'backlog' });
  return {
    summary: `Create task "${title}" · ${taskLine(after)}`,
    after,
    basis: '',
    async execute() {
      const task = await taskStore.createTask(look.env.db, { ...values, title, status: status ?? 'backlog' });
      if (status === 'done') await taskStore.setTaskStatus(look.env.db, task.id, 'done');
      return { taskId: task.id };
    },
  };
}

const taskBasis = (t: Task) => JSON.stringify([t.title, t.estimateMin, t.priority, t.energy, t.dueDate, t.status, t.horizonId, t.windowId, t.notes, t.sequential]);

async function existingTask(look: Lookups, id: number): Promise<Task> {
  const task = await taskStore.getTask(look.env.db, id);
  if (!task) throw new Error(`There is no task ${id} — list the tasks again.`);
  return task;
}

async function planUpdateTask(look: Lookups, change: Extract<Change, { kind: 'update_task' }>): Promise<Planned> {
  const task = await existingTask(look, change.taskId);
  const { status, ...fields } = change;
  const values = await taskValues(look, fields);
  if (values.title === '') throw new Error('Give the task a title.');
  if (Object.keys(values).length === 0 && status === undefined) throw new Error('Nothing to change: give at least one field.');
  const before = await describeTask(look, task);
  const after = await describeTask(look, { ...task, ...values, status: status ?? task.status });
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k] ?? '—'} → ${after[k] ?? '—'}`);
  return {
    summary: `Change task "${task.title}" · ${changed.length > 0 ? changed.join(' · ') : 'nothing would change'}`,
    before,
    after,
    basis: taskBasis(task),
    async execute() {
      if (Object.keys(values).length > 0) await taskStore.updateTask(look.env.db, task.id, values);
      if (status !== undefined && status !== task.status) await taskStore.setTaskStatus(look.env.db, task.id, status);
      return { taskId: task.id };
    },
  };
}

async function planDeleteTask(look: Lookups, change: Extract<Change, { kind: 'delete_task' }>): Promise<Planned> {
  const task = await existingTask(look, change.taskId);
  const before = await describeTask(look, task);
  return {
    summary: `Delete task "${task.title}" · ${taskLine(before)} · with whatever is planned for it`,
    before,
    basis: taskBasis(task),
    async execute() {
      await taskStore.deleteTask(look.env.db, task.id);
      return {};
    },
  };
}

function plan(look: Lookups, change: Change): Promise<Planned> {
  switch (change.kind) {
    case 'create_event':
      return planCreateEvent(look, change);
    case 'update_event':
      return planUpdateEvent(look, change);
    case 'delete_event':
      return planDeleteEvent(look, change);
    case 'create_task':
      return planCreateTask(look, change);
    case 'update_task':
      return planUpdateTask(look, change);
    case 'delete_task':
      return planDeleteTask(look, change);
  }
}

// ── Change sets ────────────────────────────────────────────────────────────

/** How long a preview may wait for its apply. */
export const CHANGE_SET_MINUTES = 15;

interface ChangeSet {
  expires: number;
  changes: Change[];
  basis: string[];
}

// On globalThis so previews survive the module being reloaded in development.
const shared = globalThis as { __timeblockChangeSets?: Map<string, ChangeSet> };
const changeSets = (): Map<string, ChangeSet> => (shared.__timeblockChangeSets ??= new Map());

function forgetExpired(now: number): void {
  for (const [id, set] of changeSets()) if (set.expires <= now) changeSets().delete(id);
}

const previewChanges: Command = {
  name: 'preview_changes',
  description:
    'Prepares one or many changes — creating, changing and deleting calendar events and tasks — WITHOUT making them. Returns a line per change saying exactly what would happen, and a changeSetId. Show those lines to the user; when they agree, call apply_changes with the changeSetId. Every change is checked first: if any has a problem, nothing is prepared and each problem is listed. All dates and times are local to the timezone from get_context.',
  input: {
    type: 'object',
    properties: { changes: { type: 'array', items: CHANGE, minItems: 1, maxItems: 200, description: 'the changes, in the order they are to be made' } },
    required: ['changes'],
    additionalProperties: false,
  },
  // Nothing in TimeBlock or Google changes; the prepared set lives in memory until applied or expired.
  readOnly: true,
  destructive: false,
  async run(env, input: { changes: Change[] }) {
    const look = new Lookups(env);
    const planned: Planned[] = [];
    const problems: string[] = [];
    for (const [i, change] of input.changes.entries()) {
      try {
        planned.push(await plan(look, change));
      } catch (error) {
        if (error instanceof CommandError && error.status === 409) throw error;
        problems.push(`changes[${i}] (${change.kind}): ${(error as Error).message}`);
      }
    }
    if (problems.length > 0) {
      throw new CommandError(422, `Nothing was prepared: ${problems.length} of ${input.changes.length} changes ${problems.length === 1 ? 'has' : 'have'} a problem.`, problems);
    }

    const now = Date.now();
    forgetExpired(now);
    const changeSetId = randomUUID();
    const expires = now + CHANGE_SET_MINUTES * 60_000;
    changeSets().set(changeSetId, { expires, changes: input.changes, basis: planned.map((p) => p.basis) });
    return {
      changeSetId,
      expiresAt: new Date(expires).toISOString(),
      count: planned.length,
      changes: planned.map((p, index) => ({ index, kind: input.changes[index].kind, summary: p.summary, before: p.before, after: p.after })),
      next: 'Nothing has changed yet. Show these summaries to the user and, once they agree, call apply_changes with this changeSetId.',
    };
  },
};

const applyChanges: Command = {
  name: 'apply_changes',
  description:
    'Carries out a change set prepared by preview_changes — only after the user has seen its summaries and agreed. If anything it touches has changed since the preview, nothing is done and a new preview is needed. A change set can be applied once, within 15 minutes.',
  input: {
    type: 'object',
    properties: { changeSetId: { type: 'string', minLength: 1, description: 'from preview_changes' } },
    required: ['changeSetId'],
    additionalProperties: false,
  },
  readOnly: false,
  destructive: true,
  async run(env, input: { changeSetId: string }) {
    forgetExpired(Date.now());
    const set = changeSets().get(input.changeSetId);
    if (!set) throw new CommandError(404, 'No such change set — it was applied already, or its 15 minutes are over. Preview the changes again.');

    // Worked out again against the data as it is now: the preview must still be true.
    const look = new Lookups(env);
    const planned: Planned[] = [];
    const stale: string[] = [];
    for (const [i, change] of set.changes.entries()) {
      try {
        const now = await plan(look, change);
        if (now.basis !== set.basis[i]) stale.push(`changes[${i}] (${change.kind}): what it changes was itself changed after the preview.`);
        planned.push(now);
      } catch (error) {
        stale.push(`changes[${i}] (${change.kind}): ${(error as Error).message}`);
      }
    }
    if (stale.length > 0) {
      changeSets().delete(input.changeSetId);
      throw new CommandError(409, 'Nothing was applied: the calendar or the tasks changed after the preview. Preview the changes again.', stale);
    }

    // From here on it is spent, whatever happens: a second apply must not repeat what the first one did.
    changeSets().delete(input.changeSetId);
    const results: Record<string, unknown>[] = [];
    let applied = 0;
    for (const [index, p] of planned.entries()) {
      try {
        results.push({ index, ok: true, summary: p.summary, ...(await p.execute()) });
        applied += 1;
      } catch (error) {
        results.push({ index, ok: false, summary: p.summary, error: (error as Error).message });
      }
    }
    const failed = planned.length - applied;
    return {
      applied,
      failed,
      results,
      next: failed > 0 ? 'Some changes failed and were NOT made — tell the user which, with the reason. The others are done.' : 'All done.',
    };
  },
};

export const changeCommands: Command[] = [previewChanges, applyChanges];
