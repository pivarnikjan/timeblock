import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/windows';

/** Time windows earliest first — the order Settings, the Calendar legend and the planner use. */
export const listWindows = withDb(store.listWindows);
export const createWindow = withDb(store.createWindow);
export const updateWindow = withDb(store.updateWindow);
/** Everything that used the window goes back to inheriting. */
export const deleteWindow = withDb(store.deleteWindow);
