import { DateTime } from 'luxon';
import { listCalendars, listRangeEvents } from '@timeblock/core/google/reads';
import { listCategories } from '@timeblock/core/store/categories';
import { listAllHorizons } from '@timeblock/core/store/horizons';
import { getSettings } from '@timeblock/core/store/settings';
import { listAllTasks } from '@timeblock/core/store/tasks';
import { listWindows } from '@timeblock/core/store/windows';
import { CommandError, needGoogle, type Command } from './command';

export const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'a date, YYYY-MM-DD' } as const;
export const TIME = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', description: 'a 24-hour time, HH:mm' } as const;

/** An instant as the user reads it: local to the Settings timezone, to the minute. */
export const localTime = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm");

const LONGEST_RANGE_DAYS = 92;

const getContext: Command = {
  name: 'get_context',
  description:
    'Start here. Returns today’s date, weekday and the timezone every date and time is in, the Google calendars (with their ids and whether they can be written to), the time windows and the event categories. Call it before creating or changing anything, so that "tomorrow" or "next Friday" become the right dates.',
  input: { type: 'object', properties: {}, additionalProperties: false },
  readOnly: true,
  destructive: false,
  async run(env) {
    const settings = await getSettings(env.db);
    const now = DateTime.now().setZone(settings.timezone);
    const status = env.google.status();
    let calendars: Record<string, unknown>[] = [];
    let googleError: string | null = null;
    if (status === 'connected') {
      try {
        calendars = (await listCalendars(env)).map((c) => ({
          id: c.id,
          name: c.summary,
          primary: c.primary,
          // TimeBlock's own calendar holds its blocks: they are planned, not written here.
          writable: c.writable && c.id !== settings.targetCalendarId,
          timeblockOwn: c.id === settings.targetCalendarId,
        }));
      } catch (error) {
        googleError = (error as Error).message;
      }
    }
    return {
      now: now.toFormat("yyyy-MM-dd'T'HH:mm"),
      today: now.toISODate(),
      weekday: now.setLocale('en').toFormat('cccc'),
      timezone: settings.timezone,
      google: { status, error: googleError },
      calendars,
      timeWindows: (await listWindows(env.db)).map((w) => ({ id: w.id, name: w.name, start: w.startTime, end: w.endTime, weekdays: w.weekdays })),
      categories: (await listCategories(env.db)).map((c) => ({ id: c.id, name: c.name })),
    };
  },
};

const listEvents: Command = {
  name: 'list_events',
  description:
    'Lists what is on the calendar between two dates (both included): Google events on every shown calendar, plus TimeBlock’s own blocks and vacations. Each event comes with the calendarId and eventId needed to change or delete it. Times are local to the timezone from get_context.',
  input: {
    type: 'object',
    properties: {
      from: { ...DATE, description: 'first day, YYYY-MM-DD' },
      to: { ...DATE, description: `last day, YYYY-MM-DD; at most ${LONGEST_RANGE_DAYS} days after the first. Left out: the same day.` },
      search: { type: 'string', description: 'only events whose title contains this text (case does not matter)' },
    },
    required: ['from'],
    additionalProperties: false,
  },
  readOnly: true,
  destructive: false,
  async run(env, input: { from: string; to?: string; search?: string }) {
    needGoogle(env);
    const settings = await getSettings(env.db);
    const zone = settings.timezone;
    const from = DateTime.fromISO(input.from, { zone });
    const to = DateTime.fromISO(input.to ?? input.from, { zone });
    if (!from.isValid || !to.isValid) throw new CommandError(400, 'from and to must be real dates.');
    if (to < from) throw new CommandError(400, 'to must not be before from.');
    if (to.diff(from, 'days').days > LONGEST_RANGE_DAYS) throw new CommandError(400, `Ask for at most ${LONGEST_RANGE_DAYS} days at a time.`);

    const calendars = await listCalendars(env);
    const byId = new Map(calendars.map((c) => [c.id, c]));
    const needle = input.search?.trim().toLowerCase();
    const events = (await listRangeEvents(env, from.toISODate()!, to.plus({ days: 1 }).toISODate()!, zone, calendars))
      .filter((e) => !needle || e.title.toLowerCase().includes(needle))
      .map((e) => {
        const start = DateTime.fromISO(e.start).setZone(zone);
        const end = DateTime.fromISO(e.end).setZone(zone);
        const kind = e.blockId ? 'timeblock-block' : e.vacationId ? 'timeblock-vacation' : 'event';
        return {
          calendarId: e.calendarId,
          eventId: e.id,
          title: e.title,
          weekday: start.setLocale('en').toFormat('ccc'),
          // An all-day event is given by its days, the last one included.
          start: e.allDay ? start.toISODate() : start.toFormat("yyyy-MM-dd'T'HH:mm"),
          end: e.allDay ? end.minus({ days: 1 }).toISODate() : end.toFormat("yyyy-MM-dd'T'HH:mm"),
          allDay: e.allDay,
          repeats: e.recurring,
          busy: e.busy,
          calendar: byId.get(e.calendarId)?.summary ?? e.calendarId,
          kind,
          // Blocks and vacations are TimeBlock's to move; read-only calendars nobody's.
          editable: kind === 'event' && (byId.get(e.calendarId)?.writable ?? false),
        };
      });
    return { timezone: zone, from: from.toISODate(), to: to.toISODate(), count: events.length, events };
  },
};

const TASK_STATUSES = ['backlog', 'active', 'done', 'dropped'] as const;

const listTasks: Command = {
  name: 'list_tasks',
  description:
    'Lists TimeBlock’s tasks — by default the open ones (backlog and active) — each with its id, estimate in minutes, priority (1 = highest), due date, status and the goal it serves.',
  input: {
    type: 'object',
    properties: {
      statuses: { type: 'array', items: { type: 'string', enum: TASK_STATUSES }, description: 'which statuses to list; left out: backlog and active' },
      search: { type: 'string', description: 'only tasks whose title contains this text (case does not matter)' },
      goalId: { type: 'integer', description: 'only tasks directly under this goal (an id from list_goals)' },
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'how many to return at most; left out: 200' },
    },
    additionalProperties: false,
  },
  readOnly: true,
  destructive: false,
  async run(env, input: { statuses?: string[]; search?: string; goalId?: number; limit?: number }) {
    const statuses = new Set(input.statuses?.length ? input.statuses : ['backlog', 'active']);
    const needle = input.search?.trim().toLowerCase();
    const goals = new Map((await listAllHorizons(env.db)).map((h) => [h.id, h]));
    const matching = (await listAllTasks(env.db)).filter(
      (t) => statuses.has(t.status) && (!needle || t.title.toLowerCase().includes(needle)) && (input.goalId === undefined || t.horizonId === input.goalId),
    );
    const tasks = matching.slice(0, input.limit ?? 200).map((t) => ({
      taskId: t.id,
      title: t.title,
      estimateMin: t.estimateMin,
      priority: t.priority,
      energy: t.energy,
      dueDate: t.dueDate,
      status: t.status,
      goalId: t.horizonId,
      goal: t.horizonId ? (goals.get(t.horizonId)?.title ?? null) : null,
      windowId: t.windowId,
      sequential: t.sequential,
      notes: t.notes,
    }));
    return { total: matching.length, count: tasks.length, tasks };
  },
};

const listGoals: Command = {
  name: 'list_goals',
  description:
    'Lists the goals tasks can be put under: yearly goals, month outcomes and week priorities, each with its id, its parent and the period it covers. A task under a week priority is planned automatically; one under a month outcome waits in its backlog.',
  input: {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['year', 'month', 'week'], description: 'only goals of this level' },
      on: { ...DATE, description: 'only goals whose period includes this date, YYYY-MM-DD' },
      includeFinished: { type: 'boolean', description: 'also goals that are done or dropped; left out: active ones only' },
    },
    additionalProperties: false,
  },
  readOnly: true,
  destructive: false,
  async run(env, input: { level?: string; on?: string; includeFinished?: boolean }) {
    const goals = (await listAllHorizons(env.db))
      .filter((h) => (!input.level || h.level === input.level) && (input.includeFinished || h.status === 'active'))
      .filter((h) => !input.on || (h.periodStart <= input.on && input.on <= h.periodEnd))
      .map((h) => ({ goalId: h.id, level: h.level, title: h.title, parentId: h.parentId, from: h.periodStart, to: h.periodEnd, status: h.status }));
    return { count: goals.length, goals };
  },
};

export const readCommands: Command[] = [getContext, listEvents, listTasks, listGoals];
