import 'server-only';
import { grantsDrive } from '@timeblock/core/google/scopes';
import { DriveError, googleDrive, isDriveScopeError } from '@timeblock/core/sync/drive';
import {
  readPeers,
  recordSyncError,
  resetFromDrive,
  setDeviceName,
  StaleDeviceError,
  syncWithDrive,
  type PeerRow,
  type SyncReport,
} from '@timeblock/core/sync/run';
import { readMeta, retentionCutoff, type SyncMetaRow } from '@timeblock/core/sync/state';
import { sqlite } from '@/lib/db/client';
import { nodeDriver } from '@/lib/db/driver';
import { authorizedClient, connectionState } from '@/lib/google/client';
import { readCredentials } from '@/lib/google/credentials';

/**
 * Sync with the phone through Google Drive's app data folder: this device's
 * state goes up as one file, the phone's comes down as another (see
 * packages/core/src/sync). Runs every few minutes while the server is up, and
 * before planning, so a plan starts from what was ticked off on the phone.
 */

export type SyncAvailability =
  | { status: 'ready' }
  /** Google is not connected (or not configured) at all. */
  | { status: 'not-connected' }
  /** Connected, but the grant predates sync or its Drive box was left unticked. */
  | { status: 'missing-scope' };

export function syncAvailability(): SyncAvailability {
  if (connectionState().status !== 'connected') return { status: 'not-connected' };
  const scopes = readCredentials()?.scopes;
  // Grants saved before scopes were recorded: try, and let Drive say no.
  if (scopes && !grantsDrive(scopes)) return { status: 'missing-scope' };
  return { status: 'ready' };
}

export const MISSING_DRIVE_HELP =
  'Syncing with the phone needs access to TimeBlock’s own folder in Google Drive. Click Reconnect, and on Google’s consent screen tick “See, create, and delete its own configuration data in your Google Drive”.';

const driver = () => nodeDriver(sqlite());

async function accessToken(): Promise<string> {
  const { token } = await authorizedClient().getAccessToken();
  if (!token) throw new Error('Google did not hand out an access token — reconnect in Settings.');
  return token;
}

/** A sentence for Settings about why a sync failed. */
function describe(error: unknown): string {
  if (isDriveScopeError(error)) return MISSING_DRIVE_HELP;
  if (/invalid_grant/.test((error as Error).message)) {
    return 'Google no longer accepts the saved sign-in (invalid_grant). Click Reconnect above. While the Google Cloud app is in Testing, Google expires it after 7 days — publish the app to stop that (docs/google-calendar-setup.md).';
  }
  if (error instanceof DriveError && error.status === 403 && /has not been used|is disabled/i.test(error.message)) {
    return 'The Google Drive API is not enabled for this Google Cloud project. Enable it (APIs & Services → Library → Google Drive API), wait a minute, and sync again.';
  }
  return (error as Error).message;
}

// One round at a time; a second request joins the round in progress. Kept on
// globalThis so a hot reload in development does not start a parallel one.
const state = globalThis as unknown as {
  __timeblockSyncRound?: Promise<SyncReport> | null;
  __timeblockAutoSync?: NodeJS.Timeout;
  /** The clock after the last round: when it moves, something changed here. */
  __timeblockSyncedClock?: number;
};

async function run(round: (drive: ReturnType<typeof googleDrive>) => Promise<SyncReport>): Promise<SyncReport> {
  state.__timeblockSyncRound ??= (async () => {
    try {
      return await round(googleDrive(accessToken));
    } catch (error) {
      recordSyncError(driver(), describe(error));
      throw error;
    } finally {
      state.__timeblockSyncRound = null;
    }
  })();
  return state.__timeblockSyncRound;
}

/** One round of sync now. Throws when it fails (and records why for Settings). */
export function syncNow(options: { allowStale?: boolean } = {}): Promise<SyncReport> {
  return run((drive) => syncWithDrive(driver(), drive, options));
}

/** Replaces this device's data with the phone's copy in Drive. */
export function replaceFromDrive(): Promise<SyncReport> {
  return run((drive) => resetFromDrive(driver(), drive));
}

/**
 * Syncs if it can and has not in the last `maxAgeMs`; never throws (a failure
 * is recorded for Settings). For the timer and for "before planning".
 */
export async function syncQuietly(maxAgeMs = 0): Promise<void> {
  if (syncAvailability().status !== 'ready') return;
  const last = readMeta(driver()).lastSyncAt;
  if (last && Date.now() - Date.parse(last) < maxAgeMs) return;
  try {
    await syncNow();
  } catch {
    // Recorded by run(); a stale device waits for a decision in Settings.
  }
}

export interface SyncStatus {
  availability: SyncAvailability;
  device: SyncMetaRow;
  peers: PeerRow[];
  /** A device away too long must choose: replace its data, or sync anyway. */
  stale: boolean;
}

export function syncStatus(): SyncStatus {
  const db = driver();
  const device = readMeta(db);
  const peers = readPeers(db);
  return {
    availability: syncAvailability(),
    device,
    peers,
    stale: peers.length > 0 && !!device.lastSyncAt && device.lastSyncAt < retentionCutoff(new Date()).toISOString(),
  };
}

export function renameDevice(name: string): void {
  setDeviceName(driver(), name);
}

export { StaleDeviceError };

/** How often the phone's changes are looked for when nothing changes here. */
const PULL_EVERY_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 1000;

/**
 * While the server runs: a change made here goes up within a minute, and the
 * phone's changes are looked for every five. Started from instrumentation.ts.
 */
export function startAutoSync(): void {
  if (state.__timeblockAutoSync) return;
  const tick = async () => {
    if (syncAvailability().status !== 'ready') return;
    const { clock, lastSyncAt } = readMeta(driver());
    const due = !lastSyncAt || Date.now() - Date.parse(lastSyncAt) >= PULL_EVERY_MS - 5_000;
    if (!due && clock === state.__timeblockSyncedClock) return;
    await syncQuietly();
    state.__timeblockSyncedClock = readMeta(driver()).clock;
  };
  state.__timeblockAutoSync = setInterval(() => void tick(), CHECK_EVERY_MS);
  state.__timeblockAutoSync.unref?.();
  setTimeout(() => void tick(), 15_000).unref?.();
}
