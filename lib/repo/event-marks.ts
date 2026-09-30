import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/event-marks';

export type { MarkField } from '@timeblock/core/store/event-marks';

/** Every mark, by event key. */
export const listMarks = withDb(store.listMarks);
/** Keys of events the planner may schedule over: placeholders and occurrences turned into a vacation. */
export const freeEventKeys = withDb(store.freeEventKeys);
/** Sets one mark on an event; a row with nothing left marked is removed. */
export const setMark = withDb(store.setMark);
