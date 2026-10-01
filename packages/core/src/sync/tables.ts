/**
 * What syncs between devices, table by table: everything the user decides.
 * The sync bookkeeping (`sync_*`) and the migration ledger stay on each device.
 */
export interface SyncTable {
  table: string;
  /** The column naming a row on every device. */
  key: string;
  /** Columns that stay on this device — per-device preferences. */
  local?: readonly string[];
  /** Only rows matching this SQL condition leave the device. */
  exportWhere?: string;
  /** A deleted row leaves a tombstone only when this SQL condition (over OLD) holds. */
  tombstoneWhen?: string;
  /** One row every device has from the start (settings): never inserted or removed by a merge. */
  singleton?: boolean;
  /** Columns unique together: two devices creating the same one keep the row with the smaller id. */
  unique?: readonly string[];
}

/**
 * Draft blocks are a proposal on the device that planned them: they reach
 * the other devices once committed (a block never becomes a draft again), and
 * deleting one — which every re-plan does, by the hundred — leaves no tombstone.
 */
const SHARED_BLOCK = "state <> 'draft'";

/**
 * In the order deletions are merged: a task before its segments before their
 * block, since whether finished work survives a deletion depends on the rest.
 */
export const SYNC_TABLES: readonly SyncTable[] = [
  // The Calendar's default view is chosen per device: the phone opens on a day.
  { table: 'settings', key: 'id', singleton: true, local: ['calendar_view'] },
  { table: 'time_windows', key: 'id' },
  { table: 'horizons', key: 'id' },
  { table: 'tasks', key: 'id' },
  {
    table: 'block_segments',
    key: 'id',
    exportWhere: `block_id IN (SELECT id FROM blocks WHERE ${SHARED_BLOCK})`,
    // Segments are deleted before their block, so the block is still there to ask.
    tombstoneWhen: "coalesce((SELECT state FROM blocks WHERE id = OLD.block_id), '') <> 'draft'",
  },
  { table: 'blocks', key: 'id', exportWhere: SHARED_BLOCK, tombstoneWhen: `OLD.${SHARED_BLOCK}` },
  { table: 'vacations', key: 'id' },
  { table: 'event_categories', key: 'id' },
  { table: 'event_marks', key: 'key' },
  { table: 'ritual_log', key: 'id', unique: ['kind', 'for_period'] },
];

export const SYNC_TABLE_NAMES = SYNC_TABLES.map((t) => t.table);

/** Quotes an identifier for SQL. Names come from this file and PRAGMA, never from users. */
export const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
