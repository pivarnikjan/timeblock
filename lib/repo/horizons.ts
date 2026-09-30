import 'server-only';
import { withDb } from '@/lib/env';
import * as store from '@timeblock/core/store/horizons';

export type { HorizonPatch } from '@timeblock/core/store/horizons';

/** Every horizon, any level or status — the hierarchy is always resolved whole. */
export const listAllHorizons = withDb(store.listAllHorizons);
export const createHorizon = withDb(store.createHorizon);
export const updateHorizon = withDb(store.updateHorizon);
/** Children are orphaned rather than cascaded. */
export const deleteHorizon = withDb(store.deleteHorizon);
