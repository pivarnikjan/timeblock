import { DateTime } from 'luxon';
import type { Task } from './db/schema';
import type { Env } from './env';
import { breadcrumb, indexHorizons } from './hierarchy';
import { listAllHorizons } from './store/horizons';
import { mostRescheduled } from './store/reschedules';
import { listAllTasks } from './store/tasks';

/** The periods the Dashboard looks back over, in days (null = all time). */
export const INSIGHT_PERIODS = { '30d': 30, '90d': 90, all: null } as const;
export type InsightPeriod = keyof typeof INSIGHT_PERIODS;

export const parsePeriod = (value: unknown): InsightPeriod =>
  typeof value === 'string' && value in INSIGHT_PERIODS ? (value as InsightPeriod) : '90d';

export interface RescheduledTaskRow {
  taskId: number;
  title: string;
  /** The goals it serves, outermost first. */
  goal: string[];
  status: Task['status'];
  /** Times rescheduled in the period. */
  count: number;
  /** Minutes that slipped in the period. */
  minutes: number;
  /** When it last slipped (UTC ISO). */
  last: string;
}

/**
 * The Dashboard's "Most rescheduled tasks": which tasks needed several tries
 * — moved by "Didn't get to it" or left unticked in the morning review — most
 * first, over the period. Tasks deleted since are left out.
 */
export async function rescheduledTasks(env: Env, period: InsightPeriod, limit = 25): Promise<RescheduledTaskRow[]> {
  const days = INSIGHT_PERIODS[period];
  const since = days === null ? null : DateTime.utc().minus({ days }).toISO()!;
  const [rows, tasks, horizons] = await Promise.all([mostRescheduled(env.db, since, limit), listAllTasks(env.db), listAllHorizons(env.db)]);
  const byId = indexHorizons(horizons);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return rows.flatMap((r) => {
    const task = taskById.get(r.taskId);
    if (!task) return [];
    return [{ ...r, title: task.title, goal: breadcrumb(task.horizonId, byId), status: task.status }];
  });
}
