import 'server-only';
import { withEnv } from '@/lib/env';
import * as writes from '@timeblock/core/google/writes';

export type { ColorSyncResult, CommitRangeResult, CommitResult } from '@timeblock/core/google/writes';

/** TimeBlock's own secondary calendar, created when missing. */
export const ensureTargetCalendar = withEnv(writes.ensureTargetCalendar);
/** Pushes the day's drafts to Google, replacing what TimeBlock put there before. */
export const commitDay = withEnv(writes.commitDay);
export const removeBlockEvents = withEnv(writes.removeBlockEvents);
export const commitBlocks = withEnv(writes.commitBlocks);
/** Each TimeBlock event in Google in its window's colour, except those coloured by hand. */
export const syncBlockColors = withEnv(writes.syncBlockColors);
/** Commits a calendar-wide plan from `from` on. */
export const commitFrom = withEnv(writes.commitFrom);
export const deleteBlockEverywhere = withEnv(writes.deleteBlockEverywhere);
export const removeBlockEvent = withEnv(writes.removeBlockEvent);
export const moveEvent = withEnv(writes.moveEvent);
export const clearDay = withEnv(writes.clearDay);
export const syncVacationEvent = withEnv(writes.syncVacationEvent);
export const removeVacationEvent = withEnv(writes.removeVacationEvent);
