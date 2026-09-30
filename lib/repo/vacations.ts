import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/vacations';

export type { VacationValues } from '@timeblock/core/store/vacations';

/** Vacations that have not ended by `after` (UTC ISO), earliest first — all when omitted. */
export const listVacations = withDb(store.listVacations);
/** Vacations overlapping [from, to) (UTC ISO). */
export const vacationsBetween = withDb(store.vacationsBetween);
export const getVacation = withDb(store.getVacation);
export const insertVacation = withDb(store.insertVacation);
/** Vacations made from a Google event, by that event (`calendarId|eventId`). */
export const vacationsBySourceEvent = withDb(store.vacationsBySourceEvent);
export const updateVacation = withDb(store.updateVacation);
export const setVacationEvent = withDb(store.setVacationEvent);
export const deleteVacation = withDb(store.deleteVacation);
