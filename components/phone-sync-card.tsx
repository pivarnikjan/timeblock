import Link from 'next/link';
import { renameDeviceAction, syncNowAction } from '@/app/actions/sync';
import { Button, Card, Field, Input } from '@/components/ui';
import { MISSING_DRIVE_HELP, type SyncStatus } from '@/lib/sync/service';

export interface SyncOutcome {
  ok: boolean;
  changes: number;
  uploaded: boolean;
  warning: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

/**
 * Settings → Phone sync: whether this device can sync, when it last did, and
 * the other devices it has heard from.
 */
export function PhoneSyncCard({ status, outcome }: { status: SyncStatus; outcome: SyncOutcome | null }) {
  const { availability, device, peers, stale } = status;

  return (
    <Card>
      <h2 id="phone-sync" className="text-sm font-medium">
        Phone sync
      </h2>
      <p className="mt-1 text-xs text-muted">
        The TimeBlock phone app keeps its own copy and syncs through a hidden TimeBlock folder in your Google Drive —
        this device&apos;s changes go up within a minute, and the phone&apos;s are fetched every five minutes and
        before each plan. Drafts stay here until you commit them. Setup: <code className="rounded bg-background px-1">docs/phone-sync.md</code>.
      </p>

      {availability.status === 'not-connected' && (
        <p className="mt-3 text-sm text-muted">Connect Google above to sync with the phone.</p>
      )}

      {availability.status === 'missing-scope' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-red-500">{MISSING_DRIVE_HELP}</p>
          <Link
            href="/api/google/auth"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Reconnect
          </Link>
        </div>
      )}

      {availability.status === 'ready' && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">
              Last synced: {when(device.lastSyncAt)}
              {peers.length === 0 && <span className="ml-2 text-xs text-muted">— no phone has synced yet</span>}
            </p>
            <form action={syncNowAction}>
              <Button tone="primary" type="submit" name="intent" value="sync">
                Sync now
              </Button>
            </form>
          </div>

          {outcome?.ok && (
            <p className="text-xs text-emerald-600">
              Synced: {outcome.changes === 0 ? 'nothing new from the phone' : `${outcome.changes} change${outcome.changes === 1 ? '' : 's'} from the phone`}
              {outcome.uploaded ? ', and this device’s changes sent.' : '.'}
            </p>
          )}
          {outcome?.warning && <p className="text-xs text-amber-600">{outcome.warning}</p>}
          {device.lastError && <p className="text-xs text-red-500">The last sync failed: {device.lastError}</p>}

          {stale && (
            <form action={syncNowAction} className="flex flex-wrap gap-2">
              <Button type="submit" name="intent" value="replace">
                Replace this device’s data with Drive’s
              </Button>
              <Button tone="ghost" type="submit" name="intent" value="anyway">
                Sync anyway
              </Button>
            </form>
          )}

          {peers.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-medium">Device</th>
                  <th className="py-1 font-medium">Its last sync</th>
                  <th className="py-1 font-medium">Taken in here</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => (
                  <tr key={p.fileId} className="border-t border-border">
                    <td className="py-1">{p.name || p.device}</td>
                    <td className="py-1">{when(p.writtenAt)}</td>
                    <td className="py-1">{when(p.mergedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form action={renameDeviceAction} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
            <Field label="This device is called (on the phone)">
              <Input name="name" required defaultValue={device.name} maxLength={40} />
            </Field>
            <Button type="submit">Save</Button>
            <span className="text-xs text-muted">id {device.device}</span>
          </form>
        </div>
      )}
    </Card>
  );
}
