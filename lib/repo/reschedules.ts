import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/reschedules';

/** How many times each task was rescheduled, all time. */
export const rescheduleCounts = withDb(store.rescheduleCounts);
