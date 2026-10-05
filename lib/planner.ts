import 'server-only';
import { env, withEnv } from '@/lib/env';
import * as planOps from '@timeblock/core/operations/plan';
import * as planner from '@timeblock/core/planner';
import type { BusySpan } from '@timeblock/core/scheduler/day';

export {
  FORECAST_DAYS,
  PLAN_CALENDAR_DAYS,
  rescheduleIsEmpty,
  schedulableOn,
  today,
  type CalendarLoad,
  type CalendarPlanSummary,
  type DayView,
  type HorizonOutlook,
  type Outlook,
  type PlanningContext,
  type RescheduleResult,
  type RescheduleSummary,
  type SessionRestart,
  type WindowSlots,
} from '@timeblock/core/planner';

/** Everything planning needs, loaded once per request and resolved as a whole. */
export const loadContext = withEnv(planner.loadContext);
/** Reads the day's calendar, degrading to an empty day rather than an error page. */
export const loadCalendar = withEnv(planner.loadCalendar);
/** Builds a fresh proposal for `date` and stores it as drafts. */
export const generateDay = withEnv(planner.generateDay);
/** "Plan calendar": every schedulable task laid out from today on, as drafts. */
export const planCalendar = withEnv(planner.planCalendar);
/** "Reschedule", step one: what a reschedule would change. */
export const previewReschedule = withEnv(planner.previewReschedule);
/** "Reschedule", confirmed. */
export const reschedule = withEnv(planner.reschedule);
export const loadDay = withEnv(planner.loadDay);
/** Ticks off the work of committed blocks whose time has passed. Cheap; called before anything reads the plan. */
export const completeElapsed = withEnv(planOps.completeElapsed);

/** Where everything is heading: each task's expected finish, and each horizon's outlook. */
export function outlook(ctx: planner.PlanningContext, todaysBusy: BusySpan[] = []): Promise<planner.Outlook> {
  return planner.outlook(env(), ctx, todaysBusy);
}
