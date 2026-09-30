import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/settings';

export type { SettingsPatch } from '@timeblock/core/store/settings';

export const getSettings = withDb(store.getSettings);
export const getCalendarFilters = withDb(store.getCalendarFilters);
/** Read-modify-write of the Calendar's grey-out state. */
export const updateCalendarFilters = withDb(store.updateCalendarFilters);
export const updateSettings = withDb(store.updateSettings);
