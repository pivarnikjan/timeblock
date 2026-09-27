import Link from 'next/link';
import {
  createWindowAction,
  deleteWindowAction,
  disconnectGoogleAction,
  setDefaultWindowAction,
  updateDayShapeAction,
  updateWindowAction,
} from '@/app/actions/settings';
import { restoreEventsAction, updateCalendarSettingsAction } from '@/app/actions/calendar';
import { CsvImportForm } from '@/components/csv-import-form';
import { parseFilters } from '@/lib/calendar/filters';
import { VIEW_LABEL, VIEWS } from '@/lib/calendar/views';
import type { Settings, TimeWindow } from '@/lib/db/schema';
import { listWindows } from '@/lib/repo/windows';
import { connectionState } from '@/lib/google/client';
import { redirectUri } from '@/lib/google/credentials';
import { getSettings } from '@/lib/repo/settings';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  'not-configured': 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart.',
  'no-refresh-token':
    'Google did not return a refresh token. Remove TimeBlock at myaccount.google.com/permissions and connect again.',
  'missing-code': 'The consent screen came back without a code. Try connecting again.',
  access_denied: 'Consent was declined.',
  'missing-calendar-scope':
    'Signed in, but Google Calendar access was not granted, so nothing was saved. Click Connect Google again and, on the consent screen, tick “See, edit, share, and permanently delete all the calendars you can access using Google Calendar” before clicking Continue.',
};

/** Why exchanging Google's one-time code failed, from the `reason` the callback passes on. */
const TOKEN_EXCHANGE: Record<string, string> = {
  invalid_grant:
    'Google refused the sign-in code — it was already used or had expired (it lasts only a few minutes, and a reload of the callback page reuses it). Click Connect Google again and finish the consent screen in one go.',
  invalid_client:
    'Google does not recognise the client ID and secret in .env.local. Copy them again from Google Auth platform → Clients, then run start-timeblock.ps1 -Restart.',
  redirect_uri_mismatch:
    'The redirect URI does not match the OAuth client. It must be exactly http://localhost:4321/api/google/callback under “Authorized redirect URIs”.',
  unauthorized_client: 'This OAuth client is not allowed to use this sign-in flow. Make sure its type is “Web application”.',
};

// Node could not verify Google's certificate — something (antivirus HTTPS
// scanning, a corporate proxy) is re-signing TLS with a root Node does not trust.
const TLS_REASONS = [
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
];
for (const code of TLS_REASONS) {
  TOKEN_EXCHANGE[code] =
    `Could not verify Google's security certificate (${code}). An antivirus with HTTPS scanning or a company proxy is intercepting the connection. TimeBlock trusts the Windows certificate store from version 0.2.1 — restart it with start-timeblock.ps1 -Restart. If it persists, turn off HTTPS scanning for node.exe in your antivirus.`;
}

function errorMessage(error: string, reason: string | null): string {
  if (error === 'token-exchange') {
    return (
      (reason && TOKEN_EXCHANGE[reason]) ??
      `Connecting failed while exchanging Google's sign-in code (${reason ?? 'unknown reason'}). Try Connect Google again; the details are in %LOCALAPPDATA%\\timeblock\\logs\\server.err.log.`
    );
  }
  return ERRORS[error] ?? `Google returned: ${error}`;
}

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  const params = await searchParams;
  const [settings, windows] = await Promise.all([getSettings(), listWindows()]);
  const connection = connectionState();

  const error = typeof params.error === 'string' ? params.error : null;
  const reason = typeof params.reason === 'string' ? params.reason : null;
  const connected = params.connected === '1';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="How a working day is shaped, and which Google account the blocks land in."
      />

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {errorMessage(error, reason)}
        </p>
      )}
      {connected && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">
          Google account connected.
        </p>
      )}

      <Card>
        <h2 className="text-sm font-medium">Google Calendar</h2>

        {connection.status === 'not-configured' && (
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>
              No OAuth client configured yet. Follow the step-by-step guide in{' '}
              <code className="rounded bg-background px-1">docs/google-calendar-setup.md</code> (about 10 minutes), or
              the short version:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In{' '}
                <a
                  className="text-accent underline"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud Console → Credentials
                </a>
                , create an OAuth client of type <strong>Web application</strong>.
              </li>
              <li>
                Add <code className="rounded bg-background px-1">{redirectUri()}</code> as an
                authorised redirect URI.
              </li>
              <li>Enable the Google Calendar API for the project.</li>
              <li>
                Put the client ID and secret in <code className="rounded bg-background px-1">.env.local</code>{' '}
                and restart the app.
              </li>
            </ol>
          </div>
        )}

        {connection.status === 'not-connected' && (
          <div className="mt-3 flex items-center gap-3">
            <p className="flex-1 text-sm text-muted">Not connected yet.</p>
            <Link
              href="/api/google/auth"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Connect Google
            </Link>
          </div>
        )}

        {connection.status === 'missing-scope' && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-red-500">
              Signed in{connection.account ? ` as ${connection.account}` : ''}, but without calendar access. Reconnect and
              tick the Google Calendar box on the consent screen.
            </p>
            <Link
              href="/api/google/auth"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Reconnect
            </Link>
          </div>
        )}

        {connection.status === 'connected' && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">
              Connected{connection.account ? ` as ${connection.account}` : ''}.
              <span className="ml-2 text-xs text-muted">
                token stored {new Date(connection.savedAt).toLocaleString()}
              </span>
            </p>
            <Link
              href="/api/google/auth"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
            >
              Reconnect
            </Link>
            <form action={disconnectGoogleAction}>
              <Button tone="danger" type="submit">
                Disconnect
              </Button>
            </form>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium">Day shape</h2>
        <form action={updateDayShapeAction} className="grid gap-3 sm:grid-cols-3">
          <Field label="Timezone">
            <Input name="timezone" defaultValue={settings.timezone} required />
          </Field>
          <Field label="Day starts">
            <Input name="dayStart" type="time" defaultValue={settings.dayStart} required />
          </Field>
          <Field label="Day ends">
            <Input name="dayEnd" type="time" defaultValue={settings.dayEnd} required />
          </Field>
          <Field label="Break around meetings & after blocks (min)">
            <Input name="bufferMin" type="number" min={0} max={60} defaultValue={settings.bufferMin} />
          </Field>
          <Field label="Longest focus block (min)">
            <Input
              name="maxFocusBlockMin"
              type="number"
              min={15}
              step={5}
              defaultValue={settings.maxFocusBlockMin}
            />
          </Field>
          <Field label="Shortest usable block (min)">
            <Input
              name="minBlockMin"
              type="number"
              min={5}
              step={5}
              defaultValue={settings.minBlockMin}
            />
          </Field>
          <Field label="Lunch starts">
            <Input name="lunchStart" type="time" defaultValue={settings.lunchStart} required />
          </Field>
          <Field label="Lunch length (min)">
            <Input name="lunchMin" type="number" min={0} max={180} defaultValue={settings.lunchMin} />
          </Field>
          <div className="sm:col-span-3">
            <Button tone="primary" type="submit">
              Save
            </Button>
          </div>
        </form>
      </Card>

      <CalendarSettings settings={settings} />

      <Card>
        <h2 className="text-sm font-medium">Time windows</h2>
        <p className="mt-1 text-xs text-muted">
          Work is only scheduled inside its window. A task uses its own window, else the nearest one set on a goal
          above it, else the default below. Set &ldquo;Learning&rdquo; once on a yearly goal and every module under it
          follows.
        </p>

        <div className="mt-4 space-y-3">
          {windows.map((w) => (
            <WindowRow key={w.id} window={w} />
          ))}
        </div>

        <form action={createWindowAction} className="mt-4 grid items-end gap-3 border-t border-border pt-4 sm:grid-cols-[2fr_1fr_1fr_3fr_auto]">
          <Field label="New window">
            <Input name="name" required placeholder="e.g. Deep work" />
          </Field>
          <Field label="From">
            <Input name="startTime" type="time" required defaultValue="08:00" />
          </Field>
          <Field label="To">
            <Input name="endTime" type="time" required defaultValue="10:00" />
          </Field>
          <Weekdays selected="1,2,3,4,5" />
          <Button type="submit">Add</Button>
        </form>

        <form action={setDefaultWindowAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <Field label="Default window for work with no window anywhere up its chain">
            <select
              name="defaultWindowId"
              defaultValue={settings.defaultWindowId ?? ''}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="">Anytime ({settings.dayStart}–{settings.dayEnd})</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-sm font-medium">Import tasks from CSV</h2>
        <p className="mt-1 mb-4 text-xs text-muted">
          One row per task (or per goal). Each row names the chain it belongs to — yearly goal, month outcome, week
          priority — and missing goals are created. Preview first: nothing is written while any row has a problem,
          and re-importing a corrected file updates tasks instead of duplicating them. Column reference: README →
          &ldquo;Importing tasks from CSV&rdquo;.
        </p>
        <CsvImportForm />
      </Card>
    </div>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Weekdays({ selected }: { selected: string }) {
  const on = new Set(selected.split(',').map(Number));
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted">Days</legend>
      <div className="flex flex-wrap gap-2 text-xs">
        {DAYS.map((label, i) => (
          <label key={label} className="flex items-center gap-1">
            <input type="checkbox" name="weekdays" value={i + 1} defaultChecked={on.has(i + 1)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function WindowRow({ window: w }: { window: TimeWindow }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form action={updateWindowAction} className="grid flex-1 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_3fr_auto]">
        <input type="hidden" name="id" value={w.id} />
        <Field label="Name">
          <Input name="name" required defaultValue={w.name} />
        </Field>
        <Field label="From">
          <Input name="startTime" type="time" required defaultValue={w.startTime} />
        </Field>
        <Field label="To">
          <Input name="endTime" type="time" required defaultValue={w.endTime} />
        </Field>
        <Weekdays selected={w.weekdays} />
        <Button type="submit">Save</Button>
      </form>
      <form action={deleteWindowAction}>
        <input type="hidden" name="id" value={w.id} />
        <Button tone="danger" type="submit">
          Delete
        </Button>
      </form>
    </div>
  );
}

/** What the Calendar screen shows by default, and the events hidden from it. */
function CalendarSettings({ settings }: { settings: Settings }) {
  const hidden = Object.entries(parseFilters(settings.calendarFilters).hiddenEvents);
  return (
    <Card>
      <h2 id="calendar" className="text-sm font-medium">
        Calendar
      </h2>
      <p className="mt-1 text-xs text-muted">
        Hours are in {settings.timezone}. An end of 00:00 means midnight.
      </p>
      <form action={updateCalendarSettingsAction} className="mt-3 grid items-end gap-3 sm:grid-cols-4">
        <Field label="Show from">
          <Input name="calendarStart" type="time" defaultValue={settings.calendarStart} required />
        </Field>
        <Field label="Show until">
          <Input name="calendarEnd" type="time" defaultValue={settings.calendarEnd} required />
        </Field>
        <Field label="Open in view">
          <select
            name="calendarView"
            defaultValue={settings.calendarView}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          >
            {VIEWS.map((v) => (
              <option key={v} value={v}>
                {VIEW_LABEL[v]}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <Button tone="primary" type="submit">
            Save
          </Button>
        </div>
      </form>

      <div className="mt-4 border-t border-border pt-4">
        <h3 className="text-xs font-medium text-muted">Hidden events ({hidden.length})</h3>
        {hidden.length === 0 ? (
          <p className="mt-1 text-xs text-muted">
            None. In the Calendar, point at an event and untick its box to hide it.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1">
              {hidden.map(([key, title]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{title || '(no title)'}</span>
                  <form action={restoreEventsAction}>
                    <input type="hidden" name="eventKey" value={key} />
                    <Button tone="ghost" type="submit">
                      Show again
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={restoreEventsAction} className="mt-2">
              <Button type="submit">Show all again</Button>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}
