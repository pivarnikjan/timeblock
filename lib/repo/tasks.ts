import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/tasks';

export type { TaskPatch, TaskStatus } from '@timeblock/core/store/tasks';

export const listTasks = withDb(store.listTasks);
/** Every task, any status — progress needs the finished ones too. */
export const listAllTasks = withDb(store.listAllTasks);
export const getTask = withDb(store.getTask);
export const nextSortOrder = withDb(store.nextSortOrder);
export const createTask = withDb(store.createTask);
export const updateTask = withDb(store.updateTask);
export const setTaskStatus = withDb(store.setTaskStatus);
/** Removes a task with its planned segments; draft blocks left empty go too. */
export const deleteTask = withDb(store.deleteTask);
/** Keeps task status in step with ticked-off minutes. */
export const syncCompletion = withDb(store.syncCompletion);
