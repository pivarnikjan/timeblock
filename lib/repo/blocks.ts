import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/blocks';

export { isFixed, isLocked, type BlockWithSegments, type DraftBlock, type SegmentWithTask } from '@timeblock/core/store/blocks';

export const listForDate = withDb(store.listForDate);
/** Blocks on the local dates `from` … `to` (inclusive), for the multi-day calendar views. */
export const listForRange = withDb(store.listForRange);
/** Blocks from the local date `from` onwards. */
export const listFrom = withDb(store.listFrom);
/** Blocks that have an event in Google Calendar, optionally from a local date on. */
export const listCommitted = withDb(store.listCommitted);
export const getBlock = withDb(store.getBlock);
export const lastPlannedDateBefore = withDb(store.lastPlannedDateBefore);
export const tickedMinutesByTask = withDb(store.tickedMinutesByTask);
export const doneOnByTask = withDb(store.doneOnByTask);
export const insertDraft = withDb(store.insertDraft);
export const replaceDrafts = withDb(store.replaceDrafts);
export const replaceDraftsFrom = withDb(store.replaceDraftsFrom);
export const deleteDraftsFrom = withDb(store.deleteDraftsFrom);
export const draftDatesFrom = withDb(store.draftDatesFrom);
export const moveBlock = withDb(store.moveBlock);
export const relocateDone = withDb(store.relocateDone);
export const deleteBlock = withDb(store.deleteBlock);
export const deleteBlocks = withDb(store.deleteBlocks);
export const setPinned = withDb(store.setPinned);
export const markSynced = withDb(store.markSynced);
export const retireBlock = withDb(store.retireBlock);
export const deleteDrafts = withDb(store.deleteDrafts);
export const setSegmentsDone = withDb(store.setSegmentsDone);
export const segmentIdsOfBlock = withDb(store.segmentIdsOfBlock);
