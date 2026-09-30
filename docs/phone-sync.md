# Syncing with the phone

TimeBlock on the desktop and the TimeBlock Android app ([timeblock-mobile](https://github.com/pivarnikjan/timeblock-mobile))
each keep a full copy of your plan and work offline. They meet in a hidden
TimeBlock folder in your Google Drive: each device keeps one small file there
with its state, and takes in the other's. No server, nothing to host, nothing
to pay.

## Set it up (once, on the desktop)

The phone signs in to the same Google Cloud project as the desktop, so first
give that project Drive access:

1. **Enable the Google Drive API.** In <https://console.cloud.google.com/>, with
   the TimeBlock project selected: **Menu ☰ → APIs & Services → Library**,
   search **Google Drive API**, **Enable**.
2. **Add the scope to the consent screen.** **Google Auth platform → Data
   Access → Add or Remove Scopes**, add
   `https://www.googleapis.com/auth/drive.appdata`, **Update**, **Save**. It is
   the narrowest Drive scope there is: TimeBlock's own hidden folder, and none
   of your files.
3. **Reconnect.** In TimeBlock, **Settings → Google Calendar → Reconnect**. On
   Google's consent screen tick **See, create, and delete its own
   configuration data in your Google Drive** (next to the calendar box), then
   **Continue**.
4. **Publish the app** if you have not: **Google Auth platform → Audience →
   Publish app**. While it is in *Testing*, Google expires the sign-in every 7
   days — on both devices — and sync stops until you reconnect.

**Settings → Phone sync** then shows *Last synced* and a **Sync now** button.
Set up the phone next: see *Google sign-in on Android* in the mobile app's
README.

## When it syncs

- **Desktop:** a change made here goes up within a minute; the phone's changes
  are fetched every five minutes, and always right before **Plan calendar**,
  **Generate** and **Commit** — so a plan starts from what you ticked off on
  the phone. **Sync now** does a round at once.
- **Phone:** when the app opens or comes back to the foreground, after you
  change something (a few seconds later), and on pull-to-refresh.

A round downloads only files that changed (Drive's checksum says so), and
uploads only when something changed here.

## What syncs

Everything you decide: goals, tasks, time windows, day shape, vacations,
event marks (important, placeholder, hidden), rituals done, and **committed**
blocks with their ticked-off work.

Stays on each device:

- **Draft blocks.** A plan is a proposal on the device that made it; its blocks
  reach the other device once committed to Google. (Re-planning replaces
  hundreds of drafts at a time — they would dominate the sync file.)
- The Calendar's default view (the phone opens on a day).
- The Google sign-in.

Google Calendar events are not copied through Drive: each device reads Google
itself, and the phone keeps the last copy it read for offline use.

## When both devices changed the same thing

Every value carries a stamp saying when it last changed; per value, the later
change wins. So renaming a task on the phone and moving its due date on the
desktop keeps both. A deletion wins over a row nobody changed since — and a row
changed after it was deleted elsewhere comes back.

One exception protects progress: **work ticked off is never lost to a
re-plan.** If the desktop replaces a block the phone had just ticked off, the
block and its ticked work are kept on both.

## Where the data is

In Google Drive's *app data folder* — not visible in Drive's web page, and only
readable by TimeBlock's Google Cloud project. One file per device,
`timeblock-sync-<device id>.json.gz`: gzip-compressed JSON — kilobytes today, and
well under a megabyte after years of use. To see or remove it: <https://drive.google.com/drive/settings> →
**Manage apps** → TimeBlock → **Delete hidden app data** (both devices then
start over from what they hold).

## Troubleshooting

| Settings → Phone sync says | Why | Do this |
| --- | --- | --- |
| *needs access to TimeBlock's own folder in Google Drive* | The sign-in predates sync, or the Drive box was left unticked. | **Reconnect** and tick the Drive box. |
| *The Google Drive API is not enabled* | Step 1 above. | Enable it, wait a minute, **Sync now**. |
| *Google no longer accepts the saved sign-in (invalid_grant)* | 7-day expiry of an app in Testing, or access removed. | **Reconnect**; publish the app (step 4). |
| *last synced … more than 90 days ago* | Deletions are remembered for 90 days; a device away longer could bring deleted things back. | **Replace this device's data with Drive's**, or **Sync anyway**. |
| *… runs a newer TimeBlock* | The other device's app has fields this one does not know yet. | Update this device; nothing is lost meanwhile. |

## How it works

`packages/core/src/sync` — shared by the desktop and the phone:

- `install.ts` — triggers stamp every insert, changed column and deletion (as a
  tombstone) in the synced tables, so no code path can change data unnoticed.
  New ids are the creation time × 1024 plus random bits (`ids.ts`), so both
  devices create rows without ever handing out the same id.
- `state.ts` — `exportState` writes this device's file; `mergeState` takes in
  another's: later stamp wins per value, tombstones versus edits, finished work
  kept, a new device's defaults replaced by real data.
- `run.ts` — one round against Drive (`syncWithDrive`), and `resetFromDrive`.
- `drive.ts` — Drive's REST API over plain `fetch`.
