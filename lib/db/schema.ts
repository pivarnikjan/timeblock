import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%SZ','now'))`;

/**
 * Named stretches of the day that work is allowed to land in, e.g.
 * Learning 10:30–14:00 and Work 14:00–17:30. A task is only ever scheduled
 * inside the window it resolves to (its own, else inherited up the goal chain).
 */
export const timeWindows = sqliteTable('time_windows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** Local HH:mm. */
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  /** ISO weekdays the window applies on, comma separated: 1 = Monday … 7 = Sunday. */
  weekdays: text('weekdays').notNull().default('1,2,3,4,5'),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Band colour on the Calendar, `#rrggbb`; null = the palette colour for its position. */
  color: text('color'),
});

/**
 * Altitudes of planning, from the 40,000ft yearly view down to the week.
 * A single table for every level keeps "does this week ladder up to the year?"
 * a plain parent walk instead of a join across four shapes.
 */
export const horizons = sqliteTable(
  'horizons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    level: text('level', { enum: ['year', 'quarter', 'month', 'week'] }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    parentId: integer('parent_id'),
    /** Inclusive local date, YYYY-MM-DD. */
    periodStart: text('period_start').notNull(),
    /** Inclusive local date, YYYY-MM-DD. */
    periodEnd: text('period_end').notNull(),
    status: text('status', { enum: ['active', 'done', 'dropped'] })
      .notNull()
      .default('active'),
    /** Time window inherited by everything below this horizon, unless overridden. */
    windowId: integer('window_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('horizons_level_period_idx').on(t.level, t.periodStart),
    index('horizons_parent_idx').on(t.parentId),
  ],
);

/** Energy shape of a task: a label and a colour, used to order work inside a window. */
export const ENERGY = ['deep', 'shallow', 'admin'] as const;

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    notes: text('notes'),
    /** The single week priority or month outcome this task serves. */
    horizonId: integer('horizon_id'),
    estimateMin: integer('estimate_min').notNull().default(60),
    /** 1 = highest. */
    priority: integer('priority').notNull().default(3),
    energy: text('energy', { enum: ENERGY }).notNull().default('deep'),
    /** Local date, YYYY-MM-DD. */
    dueDate: text('due_date'),
    status: text('status', { enum: ['backlog', 'active', 'done', 'dropped'] })
      .notNull()
      .default('backlog'),
    /** Overrides the window inherited from the goal chain. */
    windowId: integer('window_id'),
    /** Sequence within a priority; imports and new tasks append, so course order holds. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (t) => [index('tasks_status_idx').on(t.status), index('tasks_horizon_idx').on(t.horizonId)],
);

/**
 * One calendar event's worth of time. A block holds one or more task segments,
 * which is how several short tasks share a single 30–60 minute calendar window.
 * `draft` blocks exist only locally; nothing reaches Google until a plan is committed.
 */
export const blocks = sqliteTable(
  'blocks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Local date the block belongs to, YYYY-MM-DD. */
    date: text('date').notNull(),
    /** UTC ISO instants. */
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    windowId: integer('window_id'),
    googleEventId: text('google_event_id'),
    state: text('state', { enum: ['draft', 'synced', 'done', 'cancelled'] })
      .notNull()
      .default('draft'),
    /**
     * Placed by hand (dragged on the calendar). Planning works around a pinned
     * block instead of replacing it, and it may sit outside any window.
     */
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [index('blocks_date_idx').on(t.date, t.state)],
);

/** A task's share of a block. Ticking segments off is what moves progress. */
export const blockSegments = sqliteTable(
  'block_segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    blockId: integer('block_id').notNull(),
    taskId: integer('task_id').notNull(),
    minutes: integer('minutes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /** UTC ISO instant the segment was completed; null while open. */
    doneAt: text('done_at'),
  },
  (t) => [
    index('block_segments_block_idx').on(t.blockId),
    index('block_segments_task_idx').on(t.taskId),
  ],
);

/** Single-row table (id is pinned to 1) holding the shape of a working day. */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  timezone: text('timezone').notNull().default('Europe/Vienna'),
  /** Local HH:mm bounds of the day shown on the timeline. */
  dayStart: text('day_start').notNull().default('06:00'),
  dayEnd: text('day_end').notNull().default('18:00'),
  /** Minutes of protected gap around every meeting, and the break after every block. */
  bufferMin: integer('buffer_min').notNull().default(15),
  maxFocusBlockMin: integer('max_focus_block_min').notNull().default(60),
  minBlockMin: integer('min_block_min').notNull().default(30),
  lunchStart: text('lunch_start').notNull().default('12:00'),
  lunchMin: integer('lunch_min').notNull().default(30),
  /** Window used by tasks with no window anywhere up their goal chain. */
  defaultWindowId: integer('default_window_id'),
  /** Google calendar the app writes its blocks into. Created on first sync. */
  targetCalendarId: text('target_calendar_id'),
  /** Hours the Calendar screen shows, local HH:mm. An end of 00:00 means midnight. */
  calendarStart: text('calendar_start').notNull().default('05:00'),
  calendarEnd: text('calendar_end').notNull().default('00:00'),
  /** View the Calendar opens in: day, 3days, workweek, week, month. */
  calendarView: text('calendar_view').notNull().default('week'),
  /** Greyed-out calendars and events, and per-view "multi-day only" — JSON, see lib/calendar/filters.ts. */
  calendarFilters: text('calendar_filters').notNull().default('{}'),
  updatedAt: text('updated_at').notNull().default(now),
});

/** 'review' records that a planned day was looked back on (ticked off) the next morning. */
export const RITUALS = ['daily', 'weekly', 'monthly', 'yearly', 'review'] as const;

/**
 * Which planning rituals have been completed for which period.
 * Keyed by period rather than by date so a Monday missed still prompts on Tuesday.
 */
export const ritualLog = sqliteTable(
  'ritual_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: RITUALS }).notNull(),
    /** '2026', '2026-08', '2026-W33', '2026-08-12'. */
    forPeriod: text('for_period').notNull(),
    completedAt: text('completed_at').notNull().default(now),
  },
  (t) => [uniqueIndex('ritual_log_kind_period_idx').on(t.kind, t.forPeriod)],
);

export type TimeWindow = typeof timeWindows.$inferSelect;
export type NewTimeWindow = typeof timeWindows.$inferInsert;
export type Horizon = typeof horizons.$inferSelect;
export type NewHorizon = typeof horizons.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type BlockSegment = typeof blockSegments.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type RitualKind = (typeof RITUALS)[number];
export type Energy = (typeof ENERGY)[number];
