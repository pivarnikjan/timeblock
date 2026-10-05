# TimeBlock — Change log

What TimeBlock can do, when each capability arrived, and why. Read it top-down:

1. **Releases** — one line per epic: skim this to know what exists.
2. **Epics** — the goal of a body of work and the user stories inside it.
3. **Stories** — "As a … I want … so that …", acceptance criteria (what is
   true when it is done), and **Where to look** (screens, code, docs, tests) to
   dig into the detail.

Newest release first. Story IDs (`TB-###`) never change once published.

---

## Releases

| Date | Release | Epic | Stories | Status |
| --- | --- | --- | --- | --- |
| 2026-10-05 | v0.17 | [E26 · Done by the clock, and a clean slate](#e26--done-by-the-clock-and-a-clean-slate) | TB-097 – TB-101 | Done on the desktop |
| 2026-10-04 | v0.16 | [E25 · Missed work and the Dashboard](#e25--missed-work-and-the-dashboard) | TB-094 – TB-096 | Done on the desktop |
| 2026-10-04 | v0.15 | [E24 · Plan once, edit in place](#e24--plan-once-edit-in-place) | TB-090 – TB-093 | Done on the desktop |
| 2026-10-01 | v0.14 | [E23 · Event categories](#e23--event-categories) | TB-088 – TB-089 | Done, desktop and phone |
| 2026-09-30 | v0.13 | [E22 · The whole planner on the phone](#e22--the-whole-planner-on-the-phone) | TB-087 | In progress — shared planner done; the phone screens follow in timeblock-mobile |
| 2026-09-29 | v0.12 | [E21 · Phone sync](#e21--phone-sync) | TB-082 – TB-086 | Desktop done; the Android app follows in timeblock-mobile |
| 2026-09-29 | v0.11 | [E20 · Goals over several years](#e20--goals-over-several-years) | TB-079 – TB-080, TB-081 (fix) | Done |
| 2026-09-29 | v0.10 | [E19 · Sequential sessions](#e19--sequential-sessions) | TB-076 – TB-078 | Done |
| 2026-09-29 | v0.9 | [E18 · Multi-day events and finished work](#e18--multi-day-events-and-finished-work) | TB-073 – TB-075 | Done |
| 2026-09-28 | v0.8.1 | [E14 · Readable time windows](#e14--readable-time-windows) | TB-071 – TB-072 (changes) | Done |
| 2026-09-28 | v0.8 | [E17 · Reschedule](#e17--reschedule) | TB-068 – TB-070 | Done |
| 2026-09-27 | v0.7.1 | [E13 · Plan the whole calendar](#e13--plan-the-whole-calendar) | TB-067 (fix) | Done |
| 2026-09-27 | v0.7 | [E16 · Vacation](#e16--vacation) | TB-062 – TB-066 | Done |
| 2026-09-27 | v0.6 | [E15 · Event panel](#e15--event-panel) | TB-057 – TB-061 | Done |
| 2026-09-27 | v0.5.1 | [E14 · Readable time windows](#e14--readable-time-windows) | TB-054 – TB-056 (changes) | Done |
| 2026-09-27 | v0.5 | [E14 · Readable time windows](#e14--readable-time-windows) | TB-051 – TB-053 | Done |
| 2026-09-27 | v0.4.1 | [E13 · Plan the whole calendar](#e13--plan-the-whole-calendar) | TB-050 (change) | Done |
| 2026-09-27 | v0.4 | [E13 · Plan the whole calendar](#e13--plan-the-whole-calendar) | TB-047 – TB-049 | Done |
| 2026-09-24 | v0.2 | [E6 · Connected goals and progress](#e6--connected-goals-and-progress) | TB-020 – TB-024 | Done |
| 2026-09-24 | v0.2 | [E7 · Time windows and packed blocks](#e7--time-windows-and-packed-blocks) | TB-025 – TB-028 | Done |
| 2026-09-24 | v0.2 | [E8 · Forecast, review and carry-over](#e8--forecast-review-and-carry-over) | TB-029 – TB-031 | Done |
| 2026-09-24 | v0.2 | [E9 · CSV import](#e9--csv-import) | TB-032 – TB-034 | Done |
| 2026-09-26 | v0.3.1 | [E12 · Calendar](#e12--calendar) | TB-046 (change) | Done |
| 2026-09-26 | v0.3 | [E12 · Calendar](#e12--calendar) | TB-041 – TB-045 | Done |
| 2026-09-26 | v0.2.1 | [E10 · Google Calendar setup guide](#e10--google-calendar-setup-guide) | TB-038 – TB-040 (fixes) | Done |
| 2026-09-24 | v0.2 | [E10 · Google Calendar setup guide](#e10--google-calendar-setup-guide) | TB-035 | Done |
| 2026-09-24 | v0.2 | [E11 · Stop and deploy the service](#e11--stop-and-deploy-the-service) | TB-036 – TB-037 | Done |
| 2026-08-12 | v0.1 | [E1 · Planning horizons](#e1--planning-horizons) | TB-001 – TB-003 | Done |
| 2026-08-12 | v0.1 | [E2 · Task backlog](#e2--task-backlog) | TB-004 – TB-005 | Done |
| 2026-08-12 | v0.1 | [E3 · Daily scheduler](#e3--daily-scheduler) | TB-006 – TB-008 | Done |
| 2026-08-12 | v0.1 | [E4 · Google Calendar sync](#e4--google-calendar-sync) | TB-009 – TB-011 | Done — not yet tried against a live account |
| 2026-08-12 | v0.1 | [E5 · Daily ritual and autostart](#e5--daily-ritual-and-autostart) | TB-012 – TB-013 | Done |

---

# 2026-10-05 · v0.17 — Done by the clock, and a clean slate

**Theme.** Work is done when its time has passed unless you say otherwise, and
when priorities change the whole plan can be cleared and laid out again.

**Upgrade notes.** Migration `0014_segment_kept_open` adds
`block_segments.kept_open`. On first start, past committed blocks never ticked
off are ticked — except work that was planned again in a later block, which
stays open. Planning behaviour changes: *Clear plan* deletes Google events.

## E26 · Done by the clock, and a clean slate

> I did the training; I should not have to tell the app. And when the
> priorities change, I want to start the calendar over.

### TB-097 · Work is done when its time has passed
*As a planner, I want a committed block's work marked complete once its
scheduled time is over, so that progress follows the calendar by default.*

Acceptance criteria
- [x] A committed block that has ended has its unticked work ticked off, dated
      to the block's end; its tasks' status follows. Runs when the Calendar
      loads, before planning, committing, rescheduling and clearing, and every
      minute while the server runs. Running it again changes nothing.
- [x] Work unticked by hand is kept open (`kept_open`) until it is ticked
      again or its block gets a new time (moved, resized, or *Didn't get to
      it*).
- [x] Work that slipped and was planned again is not ticked: when a task has
      more unticked minutes planned than it has left, its latest blocks count.
- [x] Drafts never complete by themselves.

### TB-098 · Tick off in the block's panel (fix)
*As a planner, I want to mark a task complete where I am looking at it.*

Acceptance criteria
- [x] The boxes in a block's panel are checkboxes — tick and untick — with
      **Mark all done** for a block of several tasks. Before, they only showed
      the state and ticking meant opening the day.

### TB-099 · Clear plan
*As a planner, I want to unassign everything planned from today on, so that I
can change priorities and plan the calendar afresh.*

Acceptance criteria
- [x] **Clear plan…** beside *Plan calendar*, after a confirmation with the
      number of blocks and of Google events: every block from today on with
      unticked work goes — drafts, committed (Google event deleted first, so a
      refusal leaves the rest untouched) and pinned.
- [x] Ticked work stays: a fully ticked block is untouched, a partly ticked one
      keeps only its ticked work as history. Tasks and vacations are not
      touched; the next *Plan calendar* places everything open again.
- [x] With committed blocks and Google disconnected, it refuses and says why.

### TB-100 · A restarted week plans all its sessions (fix)
*As someone following a training plan, I want a week that starts again to hold
every session, so that Friday's is not missing.*

Acceptance criteria
- [x] When a program week starts again, a block of the interrupted attempt —
      unticked, on a day before its session's new day — no longer counts as
      that session being planned: *Plan calendar* and *Generate the day* plan
      the session again, and *Reschedule…* takes the old block off.

### TB-101 · Builds where Smart App Control blocks Tailwind (fix)
*As the person running TimeBlock on Windows, I want the build to work when
Windows refuses Tailwind's unsigned native engine, without switching any
protection off.*

Acceptance criteria
- [x] `npm run build` / `npm run dev` first check whether Tailwind's native
      engine loads. Where "An Application Control policy has blocked this
      file", Tailwind's WebAssembly engine is installed once into
      `scripts/tailwind-wasm/` (kept out of the project's dependencies: npm
      refuses a "wasm32 only" package there) in the matching version.
- [x] The stylesheet is then built with that engine: the plugin reads the
      source files itself — the WebAssembly engine cannot walk a Windows
      folder — and Tailwind's own compiler builds the CSS. Where the native
      engine loads, the official plugin is used unchanged.

Where to look: `scripts/tailwind-engine.cjs`, `scripts/ensure-tailwind-engine.cjs`,
`scripts/tailwind-postcss.cjs`, `postcss.config.mjs`, `package.json`
(`predev`, `prebuild`).

Where to look: `packages/core/src/operations/plan.ts` (`completeElapsed`,
`clearPlan`), `google/writes.ts` (`clearFrom`), `store/blocks.ts`
(`openSegments`, `setSegmentsDone`), `planner.ts` (`leftBehind`),
`drizzle/0014_segment_kept_open.sql` · `app/actions/plan.ts`,
`app/calendar/page.tsx`, `lib/sync/service.ts` ·
`components/plan-calendar-bar.tsx`, `components/calendar/event-panel.tsx` ·
`lib/completion.test.ts`.

---

# 2026-10-04 · v0.16 — Missed work and the Dashboard

**Theme.** Say "I didn't get to it" and the work finds its next slot — and see
which tasks get done on the first try and which take several.

**Upgrade notes.** Migration `0013_task_reschedules` adds the
`task_reschedules` table, synced with the phone. Until the phone's copy of
`packages/core` is moved forward, its sync reports the desktop as "a newer
TimeBlock"; nothing is lost either way. Slips are counted from now on — earlier
missed work left no record.

## E25 · Missed work and the Dashboard

> The workshop prep slipped three times this month; the reading never does.

### TB-094 · Didn't get to it — find the next slot
*As a planner, I want to say a block's work did not happen and have it moved to
the next free time, without re-planning everything.*

Acceptance criteria
- [x] **↻ Didn't get to it — find the next slot** in the panel of a block with
      unticked work (not one kept as history).
- [x] Its unticked work goes to the first free slot in its window from now on
      (after the block's own end when missed ahead of time), around meetings,
      vacations and every other block, within three months; nothing else moves.
      It is pinned there; a committed block's Google event moves with it.
- [x] Ticked work stays where it happened: the rest gets a block of its own
      (committed too, if the original was), and the original's Google event
      then lists only the work done there.
- [x] A course stays in order: its later blocks that would now come first move
      after it, each to the next free slot — a session to a later day.
- [x] No slot: nothing changes, and it says so. The panel follows the work to
      its new place and says how many times each task has now been rescheduled.

### TB-095 · Every slip is counted once
*As a planner, I want how often each task was rescheduled stored, so I can see
which work needs several tries.*

Acceptance criteria
- [x] One `task_reschedules` row per task per slip — task, block, from, to,
      minutes, reason (`missed` or `review`) — never edited; deleting a task
      deletes its rows. Synced with the phone; append-only, so devices never
      overwrite each other's counts.
- [x] Work left unticked in the morning review counts as a slip. A slip is
      identified by task, block and scheduled time, so reviewing a day twice, or
      pressing the button on a block the review counted, adds nothing.
- [x] Moving blocks by hand, Reschedule… and a course's modules moving along
      are not slips.
- [x] A block's panel shows **↻ N** beside each task rescheduled N times.

### TB-096 · Dashboard: most rescheduled tasks
*As a planner, I want a Dashboard listing the tasks I reschedule most.*

Acceptance criteria
- [x] **Dashboard** in the top navigation: **Most rescheduled tasks** over the
      last 30 days, 90 days (default) or all time — rank, task, its goal, done or
      open, times rescheduled (with a bar), minutes slipped, last slip. Top 25.
- [x] An empty period says everything was done on the first try. The top
      navigation scrolls instead of overflowing on narrow screens.

Where to look: `packages/core/src/db/schema.ts` (`taskReschedules`),
`drizzle/0013_task_reschedules.sql`, `sync/tables.ts`,
`store/reschedules.ts`, `planner.ts` (`rescheduleMissed`),
`operations/plan.ts` (`reviewDay`, `missBlock`), `insights.ts` ·
`app/actions/plan.ts` (`missBlockAction`), `app/dashboard/page.tsx` ·
`components/calendar/missed-button.tsx`, `event-panel.tsx` ·
`lib/reschedules.test.ts`.

---

# 2026-10-04 · v0.15 — Plan once, edit in place

**Theme.** Planning that never doubles work, and times changed right where
they are shown — on the grid or in the panel — reaching Google only when you
say so.

**Upgrade notes.** No migration. *Plan calendar* and *Generate the day* no
longer replace committed blocks: work that already has a block is kept, and
only the gaps are planned. Existing duplicates (committed blocks plus drafts
for the same work) clear up with the next *Plan calendar*.

## E24 · Plan once, edit in place

> I can press Plan calendar as often as I like, and stretching a meeting by
> half an hour is one drag and one Save.

### TB-090 · Planning is idempotent
*As a planner, I want Plan calendar to never plan the same work twice, so that
re-running it is always safe.*

Acceptance criteria
- [x] Committed and pinned blocks from today on count as planned: their time is
      kept free and their minutes are not planned again — on *Plan calendar*
      and *Generate the day* alike. A second run with nothing changed puts back
      the same drafts; right after a commit it plans nothing.
- [x] Commit only adds drafts; it no longer replaces committed blocks.
- [x] Commit is safe to repeat: a draft whose id is already stamped on a Google
      event (a commit cut short) takes that event over; TimeBlock events no
      block stands behind any more are deleted. Events without a block stamp
      (made by hand, vacation copies) are never touched.
- [x] Planning, committing and rescheduling run one at a time.

### TB-091 · Move and resize on the grid, then save
*As a planner, I want to drag an event or block to another time, or drag its
edge to change its length, and send it to Google once I am sure.*

Acceptance criteria
- [x] Blocks with nothing ticked off and events in calendars the account can
      edit can be dragged (another time or visible day) and resized from their
      bottom edge, in 5-minute steps, at least 15 minutes.
- [x] A change is not saved: the item stays where it was dropped, dashed, with
      its old place outlined. A bar at the bottom of the screen lists every
      unsaved change, old → new, with **this one / this and following** for a
      repeating event; **Save to Google Calendar** sends them all, **Undo** /
      **Undo all** take them back. A change that fails stays, with the reason.
      Leaving the page with unsaved changes asks first.
- [x] A resized block's work follows: longer gives its last task the time;
      shorter takes the rounding slack, then minutes from its last tasks — the
      next plan places them again. It is pinned, and a committed block's Google
      event follows with its new times, title and task list.

### TB-092 · The time is where it is changed
*As a planner, I want to change an event's time by clicking the time in its
panel, with quick steps rather than a form.*

Acceptance criteria
- [x] The time at the top of the panel opens the editor: day (‹ › a day either
      way), from, until, one-click lengths (15m – 2h, the start stays) and
      −15 / +15 min. Every change shows on the grid at once, as an unsaved
      change shared with the bar; **Save to Google Calendar** (or **Save** for a
      draft) sends just this one. The old *Edit time* section is gone.

### TB-093 · A new category from the event
*As a planner, I want to make a category for an event that has none, right in
its panel.*

Acceptance criteria
- [x] **+ New category…** in the Category picker, offered under it too when the
      event has no category: name, one of Google's eleven colours (the first
      not yet used is picked), and title words pre-filled with the event's
      title. **Create & assign** makes it, puts the event (every repeat) in it,
      and recolours in Google.

Where to look: `packages/core/src/planner.ts` (`isHeld`, `heldMinutes`),
`google/writes.ts` (`commitDrafts`, `retimeEvent`), `blocks.ts`
(`fitSegments` + test), `store/blocks.ts` (`retimeBlock`),
`operations/plan.ts` (`setBlockTime`), `operations/events.ts`
(`createCategoryForEvent`) · `app/actions/calendar.ts`
(`saveCalendarEditsAction`), `app/actions/plan.ts` · `components/calendar/`
`pending-edits.tsx`, `editable-chip.tsx`, `time-editor.tsx`,
`edit-target.ts`, `event-edit.tsx` · `lib/core-services.test.ts`.

---

# 2026-10-01 · v0.14 — Event categories

**Theme.** The rest of the calendar — client meetings, the kindergarten run —
readable at a glance, and movable without leaving TimeBlock.

**Upgrade notes.** Migration `0012_event_categories` adds the
`event_categories` table (synced with the phone) and a `category_id` on event
marks. Nothing is categorised until a category is created.

## E23 · Event categories

> The kindergarten run is always grey, wherever I look at it, and moving it to
> the new time from next week on takes one change.

### TB-088 · Categories colour the events in them
*As a planner, I want events that are not TimeBlock work grouped into
categories with their own colour, so that a busy week reads at a glance.*

Acceptance criteria
- [x] **Settings → Categories**: name, colour and title words per category;
      add, save, delete. Synced with the phone, which offers the same.
- [x] An event takes the first category (in list order) one of whose words
      its title contains — case and accents ignored — unless one was picked by
      hand in its panel, or **No category**. The choice is made on a repeating
      event's series, so every repeat follows.
- [x] The event is drawn in the category's colour on both devices; in Google it
      takes the nearest of Google's colours, on the series, stamped like a
      block's — so a colour changed in Google afterwards is kept. Leaving a
      category takes that colour back off.
- [x] Saving a category or a choice recolours in Google at once; the desktop
      recolours new events within the hour; **Apply category colours in Google
      Calendar** does it on demand. A Google refusal leaves the choice saved
      and says so.

### TB-089 · Change an event's time, this one or this and following
*As a planner, I want to move an event — or a repeating event from a date
on — without opening Google Calendar.*

Acceptance criteria
- [x] **Edit time** in a Google event's panel (calendars the account can edit;
      not TimeBlock's own, not all-day events): day, from, until — an end at or
      before the start ends the next day.
- [x] A repeating event asks **This event only** or **This and all following
      events**. The latter splits the series as Google does: it ends just
      before this repeat (a COUNT becomes an UNTIL, exception dates go to their
      side), and a copy carries on with the new time and the same details —
      and keeps TimeBlock's category, marks and hidden state. From its first
      repeat, the whole series moves instead.
- [x] The copy is created before the series is shortened; if Google refuses
      the second step, the copy is removed again and nothing has changed.

Where to look: `packages/core/src/calendar/categories.ts` (+ test),
`store/categories.ts`, `store/event-marks.ts` (`setEventCategory`,
`copyMarks`), `google/category-colors.ts`, `google/recurrence.ts` (+ test),
`google/event-time.ts`, `operations/events.ts`, `calendar/assemble.ts` ·
`app/actions/categories.ts`, `app/actions/calendar.ts` ·
`components/categories-card.tsx`, `components/calendar/event-edit.tsx` ·
`lib/sync/service.ts` (hourly recolour) · `lib/event-categories.test.ts`.

---

# 2026-09-30 · v0.13 — The whole planner on the phone

**Theme.** Everything the desktop plans with — Plan calendar, Reschedule, the
day's review and commit, vacations, goals and tasks — available on the phone
too, running the very same code.

**Upgrade notes.** No migration and no visible change on the desktop: its
planner, database reads and writes, and Google Calendar writes moved into
`packages/core`, and the desktop now calls them there.

## E22 · The whole planner on the phone

> Plan, re-plan and commit from wherever I am, with the same rules as at my
> desk.

### TB-087 · One planner for both apps
*As a planner using both apps, I want the phone to plan exactly as the desktop
does, so that a plan never depends on which device made it.*

Acceptance criteria
- [x] The planner (Plan calendar, Reschedule, Generate the day, the forecast),
      the database reads and writes, and TimeBlock's writes to Google Calendar
      live in `packages/core`, and take an `Env` — the database plus Google
      access — that each app builds for itself.
- [x] Google Calendar is reached through one REST client over `fetch`
      (`google/calendar-api.ts`), as Drive already was; a 401 is retried once
      with a renewed token, and Google's refusals keep the shape the "missing
      scope" and "already gone" checks expect.
- [x] What the desktop's buttons do — tick off, review, commit a day, move,
      unpin or delete a block, save or delete a vacation, clean up during one,
      delete a Google event, add goals and quick-add tasks — is in
      `operations/`, so the phone's buttons do exactly the same.
- [x] The desktop behaves as before: every screen, form and test is unchanged.

Where to look: `packages/core/src/env.ts`, `planner.ts`, `store/`,
`operations/`, `google/calendar-api.ts` (+ `calendar-api.test.ts`),
`google/reads.ts`, `google/writes.ts`, `google/fake-calendar.ts`,
`calendar/load.ts`, `calendar/vacation-conflicts.ts` · `lib/env.ts` (the
desktop's `Env`) · `lib/core-services.test.ts` (plan → commit → tick → move →
delete, reschedule and vacations over a real database with Google faked).

---

# 2026-09-29 · v0.12 — Phone sync

**Theme.** The plan on the phone, offline, without hosting anything: the
desktop and the Android app each keep a full copy and meet in a hidden folder
in the user's own Google Drive.

**Upgrade notes.** Migration `0011_sync` adds the sync bookkeeping tables; on
first start every existing row is stamped, so the desktop's data outranks a new
phone's defaults. New rows get time-based ids (existing ids are kept). To sync:
enable the Google Drive API for the Cloud project and **Reconnect** with the
Drive box ticked — see `docs/phone-sync.md`. Nothing changes until then.

## E21 · Phone sync

> Plan on the desktop, look at the day and tick it off on the phone — on the
> train, with no signal — and find it all in step when either is back online.

### TB-082 · The plan syncs with the phone through Google Drive
*As a planner with the phone app, I want my goals, tasks, windows, vacations
and committed blocks on both devices, so that I can use either, offline.*

Acceptance criteria
- [x] Each device keeps one gzip JSON file in Drive's app data folder
      (`drive.appdata` scope: TimeBlock's own hidden folder, nothing else);
      a round downloads only changed files and uploads only when something
      changed.
- [x] The desktop sends its changes within a minute, fetches the phone's
      every five minutes, and before Plan calendar, Generate and Commit.
- [x] **Settings → Phone sync:** last sync, **Sync now**, the devices heard
      from, this device's name, and why the last sync failed (Drive box
      unticked, Drive API disabled, expired sign-in).
- [x] Draft blocks and the Calendar's default view stay on their device.

### TB-083 · Both devices' edits survive
*As a planner, I want a change on the phone and another on the desktop to both
stay, so that I never have to choose which device "wins".*

Acceptance criteria
- [x] Every value carries a stamp (hybrid logical clock); per value, the later
      change wins. Different fields of one task edited on each device both stay.
- [x] A deletion wins over a row not changed since; a row changed after it was
      deleted elsewhere comes back on both.
- [x] Merging the same file twice changes nothing.

### TB-084 · Ticked-off work is never lost to a re-plan
*As a planner, I want work I ticked off on the phone to survive a re-plan the
desktop made before it heard about it, so that progress is never undone.*

Acceptance criteria
- [x] A ticked segment deleted by the other device is kept, with its block, and
      restored there — unless its task was deleted.

### TB-085 · A new phone starts from the desktop's plan
*As a planner installing the app, I want it to take the desktop's windows and
settings, so that its defaults never overwrite mine.*

Acceptance criteria
- [x] Rows a new database was seeded with are unstamped and replaced (or
      removed) by the first merge; an existing database is stamped on upgrade.
- [x] Rows get ids from their creation time (× 1024 + random bits), so both
      devices create rows without clashing; ids still sort by creation.
- [x] Two devices marking the same ritual done keep one record.

### TB-086 · A device away too long starts over
*As a planner, I want a phone unused for months to take Drive's copy instead
of merging, so that things deleted meanwhile do not come back.*

Acceptance criteria
- [x] Deletions are remembered for 90 days. A device whose last sync is older
      is asked to **Replace this device's data with Drive's** or **Sync
      anyway**; another device's file older than that is skipped.

Where to look: `packages/core/src/sync/` (`install.ts` triggers, `state.ts`
export and merge, `run.ts` rounds, `drive.ts`, + `sync.test.ts`) ·
`packages/core/src/ids.ts` · `lib/sync/service.ts` · `app/actions/sync.ts` ·
`components/phone-sync-card.tsx` · `docs/phone-sync.md`. The code both apps
share moved to `packages/core` (schema and bundled migrations, scheduler,
hierarchy, calendar layout — `calendar/assemble.ts` — and Google event parsing).

---

# 2026-09-29 · v0.11 — Goals over several years

**Theme.** A goal that runs past New Year's Eve is still one goal.

**Upgrade notes.** No migration: a yearly goal's period simply ends in a later
year. A plan imported year by year (two goals of the same name) becomes one by
setting *Runs until* on the first, or by importing it again with `2026-2027` in
the `year` column.

## E20 · Goals over several years

> Plan a year-and-a-half transformation as one goal, with one progress bar.

### TB-079 · A yearly goal can run over several years
*As a planner, I want a goal to run from 2026 into 2027, so that its progress
and forecast cover the whole plan rather than stopping on 31 December.*

Found in use: *My Fitness Transformation* was imported as two goals (2026: 86
tasks, "runs to 31 Dec"; 2027: 258 tasks) — the plan file named the goal once
per year.

Acceptance criteria
- [x] **Runs until** on a yearly goal's form (create and edit): the goal then
      runs from 1 Jan of its first year to 31 Dec of its last.
- [x] It is listed on every year it covers, marked 📅 2026 – 2027, showing that
      year's months and how many more are on its other years.
- [x] Running it into a year where a goal of the same name exists joins them:
      months, weeks and tasks move under it, and the copy is deleted. Two
      same-named goals within one year are never joined.

### TB-080 · Import goals over several years
*As a planner importing a long plan, I want `2026-2027` in the year column to
make one goal, so that the file does not split it by year.*

Acceptance criteria
- [x] `year` accepts `2026-2027` (also with an en dash or spaces).
- [x] Rows naming that goal with a year inside the range — a `2027` goal row,
      tasks whose year comes from a 2027 month — land on the one goal; a stored
      goal over several years is matched the same way.
- [x] Importing it over a plan stored year by year extends the first goal and
      joins the second into it; tasks are matched, never duplicated.

### TB-081 · A training session is never split *(fix)*
*As an athlete, I want each session in one block, so that the same training is
not on the calendar twice in one morning.*

Found in use: from 12 October (week 3, 55-minute trainings) the Training
window's 90 minutes were packed as 45 + break + 30, so *Tréning A* became
08:30–09:10 and 09:25–09:55.

Acceptance criteria
- [x] A sequential session gets one block of its own length (longer than the
      usual maximum if need be), or waits for a slot that holds it.

Where to look: `lib/hierarchy.ts` (`yearsLabel`, `absorbedYearGoals`, + tests) ·
`lib/db/year-goals.ts` (`extendYearGoal`) · `app/actions/horizons.ts` ·
`components/horizon-screen.tsx` (`UntilYearField`, `YearTree`) ·
`lib/import/tasks-csv.ts` (`planImport`), `lib/import/apply.ts` (+ tests) ·
`lib/scheduler/plan.ts` (`whole`, + tests "sessions are never split").

---

# 2026-09-29 · v0.10 — Sequential sessions

**Theme.** A training plan is not a course: its sessions happen one a day, in
order, a week at a time — and a week broken by a vacation starts again.

**Upgrade notes.** Migration `0010_sequential_tasks` adds `tasks.sequential`
(off for every existing task). Flag your sessions on the Tasks screen, or add a
`sequential` column to your CSV and import it again.

## E19 · Sequential sessions

> Plan a training program the way it is trained: in order, one a day, week by
> week.

### TB-076 · Sequential sessions: one a day, in order
*As an athlete following a plan, I want its sessions never doubled up on one
day and never out of order, so that the plan I follow is the plan as written.*

Found in use: Tuesday's block held *Pás do kopca + Týždenná kontrola*, and a
missed day would stack two trainings onto the next one — the Training window
packed sessions like course modules.

Acceptance criteria
- [x] A task can be flagged **Sequential session** (Tasks screen, CSV column
      `sequential`; a re-import without the column leaves the flag alone).
- [x] Sequential tasks of one yearly goal form one plan in date order, across
      its months; at most one per day, never before the one ahead of it.
- [x] A session goes first in its window, so the day it is given holds.

### TB-077 · A week of sessions is one piece; an interrupted week starts again
*As an athlete, I want a week of training to happen inside one week, and to
start that week again when a vacation breaks it, so that my progression stays
intact.*

Acceptance criteria
- [x] A week's sessions (dated in one ISO week) only start when all of them fit
      in what is left of a week; back mid-week, the plan waits for the next week.
- [x] A week that cannot be finished in the week it began — or whose first
      sessions were done in an earlier week — is planned again from its first
      session, the ones already done included; later weeks move back with it.
- [x] Done is judged by the day the work happened (the block's date), so
      Friday's session reviewed on Monday still counts for its week.
- [x] Plan calendar and Reschedule report "↻ The week starting with … starts
      again on …, N sessions already done are done again".

### TB-078 · A week's other tasks move with it
*As an athlete, I want the weekly check-in to stay with its week, so that week
2's check-in does not happen during week 1's training.*

Acceptance criteria
- [x] Non-sequential tasks of the same goal dated in a program week are not
      planned before that week's first session, and keep their weekday when the
      week moves.

Where to look: `lib/scheduler/sequential.ts` (`sequentialAgenda`, + tests in
`scheduler.test.ts`, "sequential sessions") · `lib/planner.ts` (`sessionPlan`,
`anchored`) · `lib/scheduler/forecast.ts` (`SessionDays`) ·
`lib/scheduler/plan.ts` (`lead`) · `lib/repo/blocks.ts` (`doneOnByTask`) ·
`app/tasks/page.tsx` · `lib/import/tasks-csv.ts` (+ tests).

---

# 2026-09-29 · v0.9 — Multi-day events and finished work

**Theme.** Keep the plan honest when the calendar and the work move on: a
multi-day event made in Google is asked about (is it a vacation?), and work
finished ahead of plan is no longer planned.

**Upgrade notes.** Migration `0009_multi_day_classification` adds
`vacations.source_event` and `event_marks.not_vacation`. Nothing is decided for
you: after upgrading, the Calendar lists the multi-day events of the next three
months that need an answer.

## E18 · Multi-day events and finished work

> Know what a multi-day event means for planning, and stop planning work that
> is already done.

### TB-073 · Reschedule leaves out work finished ahead of plan
*As a learner who works ahead, I want work I already finished left out of a
reschedule, so that its old slots go to what comes next.*

Acceptance criteria
- [x] Blocks still to come whose tasks are all finished (marked done or ticked
      off in full) come off the calendar — Google event too — even when placed
      by hand; the preview lists those tasks under *Already finished*, apart
      from the impacted ones.
- [x] A block ticked off before it began moves back to when it was ticked
      (same length, ending then), kept as history; its Google event moves too,
      its unticked part is planned again, and its slot opens up.
- [x] "Nothing to reschedule" only when no block is replaced, added or moved back.

Where to look: `lib/planner.ts` (`proposeReschedule`, `reschedule`) ·
`lib/scheduler/reschedule.ts` (`doneAheadAt`, `whenDone`, + tests) ·
`lib/repo/blocks.ts` (`relocateDone`) · `components/plan-calendar-bar.tsx`.

### TB-074 · Make a multi-day event a vacation
*As a planner, I want to turn a multi-day event from Google into a vacation, so
that it closes the windows I choose instead of all of them or none.*

Acceptance criteria
- [x] A multi-day event's panel offers **Make it a vacation…**: the vacation form
      filled in from the event (dates, all windows, title as note).
- [x] Once saved, that occurrence no longer counts as busy; the vacation closes
      the chosen windows. For a repeating event it is one occurrence.
- [x] The panel then says it was made into a vacation, with a link to it.

Where to look: `components/calendar/event-panel.tsx` (`VacationQuestion`) ·
`app/actions/vacation.ts` (`saveVacationAction`) · `lib/calendar/busy.ts` ·
`lib/repo/event-marks.ts` (`freeEventKeys`).

### TB-075 · Multi-day events waiting for a decision
*As a planner who adds trips straight in Google, I want to be told which
multi-day events TimeBlock has not classified, so that I decide before work is
planned into them.*

Acceptance criteria
- [x] Above the calendar: the multi-day events of the next three months with no
      answer yet — busy or free, timed or all-day — each with **Vacation…**,
      **Not a vacation** and **Open event**. A repeating event is listed once.
- [x] *Not a vacation* (for every repeat) and *Placeholder* count as answers;
      *Ask again* in the panel takes it back. Declined events, TimeBlock's own,
      and events a vacation already covers are never listed.
- [x] A vacation made from an event that later moved in Google is listed too,
      with **Move the vacation with it**.

Where to look: `lib/calendar/multi-day.ts` (`multiDayReviews`, + tests) ·
`components/calendar/multi-day-review.tsx` · `lib/calendar/load.ts`
(`loadMultiDayReviews`) · `app/actions/calendar.ts` (`setNotVacationAction`) ·
`app/actions/vacation.ts` (`matchEventAction`).

---

# 2026-09-28 · v0.8 — Reschedule

**Theme.** When the calendar changes under a committed plan — a new meeting, a
vacation, a block moved by hand — one click moves just the work that no longer
fits, and everything that follows it in the course.

**Upgrade notes.** No migration. *Plan calendar* is unchanged; *Reschedule…*
sits beside it.

## E17 · Reschedule

> Keep a sequentially planned calendar true without dragging blocks around by
> hand.

### TB-068 · See how many tasks a reschedule moves
*As a planner whose calendar just changed, I want to click one button and be
told how many tasks are impacted, so that I decide before anything moves.*

Acceptance criteria
- [x] **Reschedule…** beside *Plan calendar* re-plans from now on around every
      meeting, vacation and block placed by hand, and changes nothing yet.
- [x] It says how many tasks are impacted (with their titles), from which day,
      how many blocks are replaced and how many stay, and how many collide with
      a meeting or vacation.
- [x] When nothing changed it says so: "every planned block still fits".

### TB-069 · Reschedule on confirmation, Google included
*As a planner, I want the impacted tasks moved once I confirm, so that I never
move slots by hand.*

Acceptance criteria
- [x] **Reschedule N tasks** replaces only the blocks that change; a block that
      comes out identical keeps its place and its Google event.
- [x] Courses stay in order: a displaced block moves the work after it too.
- [x] When the plan is committed, the replaced blocks' events are deleted from
      Google (first, so a refusal changes nothing) and the new blocks are created
      there; a plan still in drafts stays drafts.
- [x] The plan is recomputed on confirmation, so a meeting added after the
      preview is still respected.

### TB-070 · What a reschedule leaves alone
*As a planner, I want work I did or placed myself left where it is, so that a
reschedule only fixes what is broken.*

Acceptance criteria
- [x] Ticked-off work, and blocks already under way (starting before the next
      re-plan could), stay.
- [x] Blocks placed by hand (📌) stay — unless a meeting now sits on one; then
      it is moved and the preview says so.

Where to look: `components/plan-calendar-bar.tsx` (`ReschedulePreview`) ·
`app/actions/plan.ts` · `lib/planner.ts` (`proposeReschedule`, `reschedule`) ·
`lib/scheduler/reschedule.ts` (`conflictOf`, `diffBlocks`) ·
`lib/google/sync.ts` (`removeBlockEvents`, `commitBlocks`) ·
`lib/scheduler/scheduler.test.ts` ("reschedule").

---

# 2026-09-27 · v0.7 — Vacation

**Theme.** Time away closes the windows you choose, so nothing is planned while
you are gone.

**Upgrade notes.** Migrations `0007_vacations` and `0008_vacation_in_google`
add the `vacations` table and its Google Calendar link.
Existing plans are not changed when a vacation is set — run *Plan calendar*.

## E16 · Vacation

> Say when you are away and which kinds of work stop, and let the plan flow
> around it.

### TB-062 · Vacation closes windows for planning
*As a planner, I want to set vacation days during which Learning and Work do
not apply, so that no task is allocated while I am away.*

Acceptance criteria
- [x] A vacation has a start and end (date and time; an end of 23:59 covers the
      whole day) and the windows it closes, including *Anytime*.
- [x] *Plan calendar*, *Generate the day* and forecasts place nothing in a
      closed window; other windows work as usual; a window reopens the minute
      the vacation ends (no buffer, unlike a meeting).
- [x] A day planned during a vacation says why: "Learning window is closed —
      you are on vacation".

Where to look: `lib/scheduler/day.ts` (`Closure`, `openSlots`) ·
`lib/scheduler/plan.ts` · `lib/vacation.ts` (+ tests) · `lib/planner.ts` ·
`lib/scheduler/scheduler.test.ts` ("vacation").

### TB-063 · Set, see and remove vacations on the Calendar
*As a planner, I want to set a vacation from the Calendar and see it there, so
that I can plan time away where I plan everything else.*

Acceptance criteria
- [x] **🏖 Set vacation** beside the view switcher opens a form below it: from,
      until, windows (all ticked by default), note; upcoming vacations are
      listed with **remove**.
- [x] A vacation is a teal bar over its days; the closed windows' bands are
      left out for its span.
- [x] Clicking the bar opens it in the side panel with the closed windows and
      **Delete vacation**.

### TB-064 · A vacation is unmistakable, and editable
*As a planner, I want a vacation drawn across its exact time span and editable
from its panel, so that it is plain what falls inside it and easy to adjust.*

Acceptance criteria
- [x] The vacation's exact span is hatched red with a red outline over the time
      grid, in front of events and blocks (clicks pass through), labelled
      "VACATION" once on its tallest piece; its all-day bar is red too.
- [x] **Edit dates, windows or note** in the panel reopens the form with the
      current values (an end at midnight shows as 23:59 of the last day).

Where to look: `lib/calendar/vacation-overlay.ts` (+ tests) · `time-grid.tsx`
(`VacationHatch`) · `components/calendar/vacation-form.tsx`.

### TB-065 · Clear what is scheduled during a vacation
*As a planner, I want to see everything already scheduled during my vacation
and pick what to delete, so that my calendar — Google included — is clear for
the time away.*

Acceptance criteria
- [x] The panel lists every Google event (all calendars, hidden ones included)
      and TimeBlock block overlapping the vacation's exact span — read for the
      whole span, not just the week on screen — earliest first.
- [x] Each has a checkbox (none ticked at first; *all* / *none*); read-only
      calendars and blocks with ticked work cannot be ticked, and say why.
- [x] **Delete N selected** asks first, deletes from Google Calendar (repeats:
      that occurrence only) and TimeBlock; one failure does not stop the rest,
      and each is reported.
- [x] Saving a new vacation opens it in the panel at once (on the week it
      starts, if that is not in view).

Where to look: `lib/calendar/vacation-conflicts.ts` · `lib/calendar/overlap.ts`
(+ tests) · `components/calendar/vacation-cleanup.tsx` · `app/actions/vacation.ts`
(`deleteDuringVacationAction`) · `lib/google/sync.ts` (`deleteBlockEverywhere`).

### TB-066 · Keep a vacation in Google Calendar
*As a planner, I want to choose that a vacation also appears in Google
Calendar, and have edits follow it there, so that I see my time away wherever I
look at my calendar.*

Acceptance criteria
- [x] **Also show in Google Calendar** in the vacation form (new and edit); it
      cannot be ticked without a Google connection.
- [x] Saved ticked: an event in TimeBlock's own calendar — all-day for whole
      days, else timed — titled "🏖 Vacation · note", listing the closed windows.
- [x] Every save brings it in line: created, updated (re-created if deleted by
      hand in Google), or removed when unticked; deleting the vacation removes it
      first, so a refusal changes nothing.
- [x] It carries a private `tbVacationId`: never busy for planning (the vacation
      closes only its windows), not drawn twice, not offered in the vacation's
      delete list.
- [x] If Google cannot be reached, the vacation is still saved; the form and the
      panel say it is not in Google yet, and saving again retries.

Migration `0008_vacation_in_google` adds `vacations.in_google` and
`vacations.google_event_id`.

Where to look: `lib/google/vacation-event.ts` (+ tests) · `lib/google/sync.ts`
(`syncVacationEvent`) · `app/actions/vacation.ts` · `lib/calendar/busy.ts`.

Where to look: `components/calendar/vacation-button.tsx` ·
`app/actions/vacation.ts` · `lib/calendar/bands.ts` (`windowBands`) ·
`lib/calendar/load.ts` · `components/calendar/event-panel.tsx`.

---

# 2026-09-27 · v0.6 — Event panel

**Theme.** Click anything on the calendar to see it and act on it, without
leaving the view.

**Upgrade notes.** Migration `0006_event_marks` adds the `event_marks` table.
The **3 days** view is retired; a Calendar saved or linked to it opens in Week.
The hover checkbox on events is gone — hiding now lives in the panel.

## E15 · Event panel

> One place beside the calendar for everything about an event or block.

### TB-057 · Click for a side panel
*As a planner, I want clicking an event to open a panel next to the calendar,
so that I can see and change it without losing my place.*

Acceptance criteria
- [x] Clicking an event or block in any view opens a panel to the right of the
      grid; the clicked item is outlined; **×** closes it; the grid does not scroll.
- [x] The open item is in the URL (`?item=`), so reloads and links keep it; a
      deleted or hidden item closes the panel.
- [x] Dragging a block still moves it; a click without movement opens the panel.
- [x] Hiding an event moves from a hover checkbox on the chip into the panel.

Where to look: `components/calendar/event-panel.tsx` · `event-chip.tsx`
(`ItemLink`) · `app/calendar/page.tsx` · `lib/calendar/views.ts` (`calendarHref`).

### TB-058 · Delete from the panel
*As a planner, I want to delete an event or block from the panel, so that I can
clear my calendar where I see it.*

Acceptance criteria
- [x] Google events on calendars the account can edit are deleted after a
      confirmation; for a repeating event only this occurrence.
- [x] Read-only calendars say so instead of offering delete; TimeBlock's own
      calendar is only ever changed through its blocks.
- [x] Blocks without ticked work can be deleted; a committed block's Google
      event goes first, so a refusal changes nothing.

### TB-059 · Important in Month view
*As a planner, I want to mark an event important, so that it stays visible in
the condensed Month view.*

Acceptance criteria
- [x] **★ Important in Month view** keeps the event in Month even with *Only
      multi-day events* on, starred and in bold. Hidden calendars still win.

### TB-060 · Placeholder events
*As a planner, I want to mark an event as a placeholder, so that Plan calendar
may schedule work during time I only held.*

Acceptance criteria
- [x] Placeholder events are not busy for *Plan calendar* or *Generate the day*;
      they are drawn hatched and labelled on the grid.
- [x] Marks are local, per series key, so they work for read-only calendars and
      cover every repeat.

Where to look: `lib/calendar/busy.ts` (`busySpans`, + tests) ·
`lib/repo/event-marks.ts` · `lib/planner.ts`.

### TB-061 · Retire the 3 days view
*As a planner, I want views I do not use removed, so that the switcher is simpler.*

Acceptance criteria
- [x] Views: Today · Work week · Week · Month. A stored or linked `3days` opens Week.

---

# 2026-09-27 · v0.5 — Readable time windows

**Theme.** Time windows tell themselves apart at a glance, and the Calendar
shows the week without settings-type clutter around it.

**Upgrade notes.** Migration `0005_window_colors` adds `time_windows.color`
(existing windows get palette colours) and makes Week the default view — a
Calendar still on the old default (Today) switches to Week; any other view you
chose is kept. drizzle-kit rebuilds the `settings` table to change the column
default; every value is copied across.

## E14 · Readable time windows

> See at a glance which window a block sits in, without the same label printed
> on every day.

### TB-051 · Coloured windows, named once, in front on demand
*As a planner, I want each time window in its own colour and named once, with a
switch to bring them to the front, so that the week is easy to read.*

Acceptance criteria
- [x] Each window is a band in its own colour with a left stripe; its name
      appears only on the first visible day it opens.
- [x] The left panel lists every window with its colour and hours.
- [x] **Show in front** (off by default, remembered) draws bands and solid name
      labels over the blocks; blocks stay clickable and draggable underneath.
- [x] A window's colour is set in Settings → Time windows; without one it gets
      a palette colour by position, never one of the block colours.

Where to look: `lib/calendar/bands.ts`, `lib/calendar/colors.ts`
(`windowColor`, + tests) · `components/calendar/time-grid.tsx` (`WindowBands`) ·
`calendar-chrome.tsx` · `app/settings/page.tsx`.

### TB-052 · Google calendar choice moves to Settings
*As a planner, I want the list of Google calendars out of the Calendar's side
panel, so that something I rarely change does not distract me.*

Acceptance criteria
- [x] Settings → Calendar has a checkbox per Google calendar (TimeBlock's own
      calendar excluded); unticked calendars are hidden as before.
- [x] The left panel shows "N of M shown · choose", linking there.

### TB-054 · Windows sorted by start time *(change, 2026-09-27)*
*As a planner, I want time windows listed by when they start, so that Settings
and the Calendar legend read like my day.*

Acceptance criteria
- [x] Settings, the Calendar legend and the planner order windows by start
      time, then end time, then name.
- [x] Default colours follow creation order, so re-sorting or adding an earlier
      window never recolours the others.

Where to look: `lib/repo/windows.ts` (`listWindows`) · `lib/scheduler/day.ts`
(`compareWindows`) · `lib/calendar/colors.ts` (`windowColors`, + tests).

### TB-055 · "Only multi-day events" is a Month switch *(change, 2026-09-27)*
*As a planner, I want the multi-day switch only where days are condensed, so
that views with hours are not cluttered by a switch that makes no sense there.*

Acceptance criteria
- [x] The switch appears in Month only; Today, 3 days, Work week and Week always
      show timed events, even if the switch was saved for them earlier.

### TB-056 · Planning tab *(change, 2026-09-27)*
*As a planner, I want Week, Month and Year under one Planning tab, so that the
top navigation separates planning the work from putting it in the calendar.*

Acceptance criteria
- [x] Top navigation: Calendar · Planning · Tasks · Settings, the current
      section highlighted.
- [x] Planning shows Week · Month · Year tabs, opens on Week, and keeps the date
      when switching; `/week`, `/month`, `/year` keep working.

Where to look: `app/(planning)/layout.tsx` · `components/planning-tabs.tsx` ·
`components/main-nav.tsx` · `app/planning/page.tsx`.

### TB-071 · Blocks in their window's colour *(change, 2026-09-28)*
*As a planner, I want the work in a time window to share the window's colour,
unless I coloured an event myself, so that I see at a glance what kind of time
each block is.*

Acceptance criteria
- [x] A block is drawn in its window's colour (drafts dashed as before); work
      with no window keeps its energy colour.
- [x] Committing gives the Google event the nearest of Google's event colours
      and records it on the event.
- [x] A colour set on a block's event in Google wins, on TimeBlock's calendar
      too. Events committed earlier with an energy colour count as TimeBlock's;
      any other colour on them counts as chosen by hand.

Where to look: `lib/calendar/colors.ts` (`blockColor`, `explicitColorId`,
`nearestEventColorId`, + tests) · `lib/google/sync.ts` (`insertBlockEvent`) ·
`lib/google/calendar.ts` (`BLOCK_COLOR_KEY`) · `lib/calendar/load.ts`.

### TB-072 · The same colours in Google Calendar *(change, 2026-09-28)*
*As a planner, I want my blocks in Google Calendar coloured by the same rule, so
that both calendars read the same.*

Acceptance criteria
- [x] Blocks already in Google are repainted to their window's colour after
      every commit and reschedule, and when a window's colour changes or a
      window is deleted.
- [x] **Settings → Time windows → Apply window colours in Google Calendar**
      repaints on demand and reports how many events changed and how many keep
      a colour chosen by hand.
- [x] An event whose colour was changed in Google is never repainted.

Where to look: `lib/google/sync.ts` (`syncBlockColors`) · `lib/calendar/colors.ts`
(`blockColorId`, `colorUpdate`, + tests) · `app/actions/settings.ts`
(`recolourGoogleAction`, `followColors`) · `app/settings/page.tsx`.

### TB-053 · Week by default
*As a planner, I want the Calendar to open in Week, and to choose that default
myself, so that I see my week without switching views.*

Acceptance criteria
- [x] New installs open in Week; existing ones still on Today switch to Week.
- [x] Settings → Calendar → **Default view** picks the view the Calendar opens in.

---

# 2026-09-27 · v0.4 — Plan the whole calendar

**Theme.** One click plans every day until all the work has a place; the plan is
reviewed and adjusted on the calendar itself.

**Upgrade notes.** Migration `0004_pinned_blocks` adds `blocks.pinned` (every
existing block starts unpinned). Deploy with `start-timeblock.ps1 -Restart`.
Behaviour change: tasks under one month outcome are now always scheduled in
order — priority and overdue no longer reorder them within that outcome.

## E13 · Plan the whole calendar

> Lay a whole course out across the coming weeks in one go, in the order it has
> to be done, then fine-tune it by dragging.

### TB-047 · Plan calendar
*As a learner, I want one button that places all my tasks into their windows
day after day until everything is allocated, so that I do not plan each day by
hand.*

Acceptance criteria
- [x] **Plan calendar** on the Calendar plans from today on, each task in its own
      window on the days it is open, around Google meetings, until every
      schedulable task is placed (up to three months ahead).
- [x] Stored as drafts replacing earlier unpinned drafts from today on;
      **Commit N blocks to Google** and **Discard drafts** act on all of them.
- [x] The summary says what was placed, over which days, what did not fit, and
      how many open tasks were left out because they are not in a week.

Where to look: `lib/planner.ts` (`planCalendar`) · `lib/scheduler/forecast.ts`
(`planRange`, + tests) · `components/plan-calendar-bar.tsx` ·
`app/actions/plan.ts` · `lib/google/sync.ts` (`commitFrom`).

Decision — the multi-day planner is the forecast's own day-by-day loop, now
returning its blocks, so the plan and the forecast can never disagree.

### TB-048 · Courses are done in order
*As a learner following a course, I want its modules scheduled strictly in
sequence, so that the plan never skips or jumps between sections just because a
later one fits a gap.*

Acceptance criteria
- [x] Tasks under one month outcome form a sequence ordered by week, then task
      order; the same outcome title under the same goal in the next month
      continues it.
- [x] Within a sequence, priority, due dates and free gaps never reorder
      modules; separate courses still interleave.
- [x] A module in another window waits until the one before it is finished.

Where to look: `lib/hierarchy.ts` (`sequencePositions`, + tests) ·
`lib/scheduler/plan.ts` (`enforceSequences`, `gateSequences`, + tests).

### TB-049 · Drag blocks to adjust the plan
*As a planner, I want to drag a block to another time or day, even outside its
window, so that I can correct the plan where it does not make sense.*

Acceptance criteria
- [x] Blocks with nothing ticked off drag across the visible days in 5-minute
      steps, showing the new time while dragging; a short press still opens the day.
- [x] Windows do not apply to a block placed by hand (a Learning block may end
      at 14:15).
- [x] A moved block is pinned: re-planning works around it and does not plan
      its minutes twice; **unpin** in the Today view releases it.
- [x] Moving a committed block moves its Google event (Google first, so a
      refused move changes nothing).

Where to look: `components/calendar/draggable-block.tsx` ·
`components/calendar/time-grid.tsx` · `app/actions/plan.ts`
(`moveBlockAction`, `unpinBlockAction`) · `lib/repo/blocks.ts`.

### TB-067 · Long dated plans are "later", not "at risk" *(fix, 2026-09-27)*
*As a planner with a year-long plan of dated sessions, I want goals judged on
the work that is due within the forecast, so that next spring's workouts do not
mark my goal "at risk" today.*

Found in use: importing *My Fitness Transformation* (344 dated sessions,
Sep 2026 – Oct 2027) flagged the goal "at risk · 48 tasks won't fit in the next
42 days", and Plan calendar would have listed every session beyond three months
as "did not fit". Those tasks are not due yet.

Acceptance criteria
- [x] Tasks that only become schedulable after the forecast range are not
      counted as unfinished: a goal reads "on track so far · runs to <date>",
      one with nothing due yet reads "starts <date>".
- [x] Plan calendar reports them as "N dated tasks fall after the next three
      months … and will be planned when their dates come closer".
- [x] A dated task is planned on its date, not before.

Where to look: `lib/scheduler/forecast.ts` (`dueAfter`, + tests) ·
`lib/planner.ts` (`outlook`, `planCalendar`) · `components/progress.tsx`.

### TB-050 · Finish the goal as soon as possible *(change, 2026-09-27)*
*As a learner, I want the plan to fill every learning window back to back, so
that I complete my goal as early as possible instead of waiting for each week.*

Found in use: the GenAI Expert plan filled Monday–Wednesday of each week and left
Thursday–Friday empty, because week work only became schedulable on its week's
Monday; blocks also closed with minutes to spare. Finish moved from Tue 27 Oct
to Fri 9 Oct (23h 41m over 10 consecutive working days).

Acceptance criteria
- [x] Tasks under any active week priority are schedulable now; the week is
      their deadline, not a start gate. Supersedes "from that week's Monday".
- [x] Ranking is overdue → priority → earliest deadline → task order, so pulled
      forward work never crowds out a sooner deadline of another goal.
- [x] A block is always filled by splitting the next task (pieces ≥ 15 min);
      it no longer closes early once it holds 30 minutes.
- [x] Course order still holds; the Today view lists the next 15 candidates in
      planning order.

Where to look: `lib/hierarchy.ts` (`availability`) · `lib/scheduler/plan.ts`
(`rankTasks`, `packWindow`, + tests "as soon as possible").

---

# 2026-09-26 · v0.3 — Calendar

**Theme.** "Today" becomes **Calendar**: the plan and the Google calendar in one
Google-Calendar-like screen, from a single day to a whole month.

**Upgrade notes.** Migration `0003_calendar_view` adds the Calendar settings
(hours 05:00–00:00, opens in Today, nothing greyed). `/today` links and
bookmarks redirect to `/calendar?view=day`; the start script opens the Calendar.

## E12 · Calendar

> See the plan in context — meetings, all-day and multi-day events, and
> TimeBlock's blocks — in the views and colours of Google Calendar.

### TB-041 · Five views
*As a planner, I want to switch between Today, 3 days, Work week, Week and
Month, so that I can look at my time at the scale the question needs.*

Acceptance criteria
- [x] View switcher: Today · 3 days · Work week (Mon–Fri) · Week (Mon–Sun) · Month.
- [x] ‹ › move by the size of the view; "Back to today" appears when away; a
      date opens its day.
- [x] Month shows whole Monday–Sunday weeks; days outside the month are muted.
- [x] The day's planning tools (review, generate, commit, tick off) sit under
      the Today view; `/today` redirects there.

Where to look: `/calendar` · `lib/calendar/views.ts` (+ tests) ·
`components/calendar/` · `app/calendar/page.tsx` · `components/planning-panel.tsx`.

### TB-042 · Google Calendar's colours and layout
*As a Google Calendar user, I want events to look as they do in Google, so that
I recognise them at a glance.*

Acceptance criteria
- [x] Event colour = its own colour, else its calendar's, mapped to the modern
      palette Google's web app shows (the API reports an older one).
- [x] TimeBlock blocks use the colours they get in Google (Blueberry, Peacock,
      Banana — since v0.8.1 their window's colour, see TB-071); drafts are dashed; declined events outlined and struck through.
- [x] Overlapping events sit side by side; all-day and multi-day events run as
      bars across the days they cover, cut at the edges of the view.
- [x] Today's date is highlighted and a red line marks the current time; the
      grid opens scrolled to an hour before now.

Where to look: `lib/calendar/colors.ts`, `lib/calendar/layout.ts` (+ tests) ·
`time-grid.tsx`, `month-grid.tsx`.

Decision — the colour mapping could not yet be checked against the planner's
own Google account (calendar access had not been granted at the time); it
follows Google's published palettes.

### TB-043 · Grey out what is not important
*As a planner, I want to grey out calendars and individual events, so that what
matters stands out without losing sight of the rest.*

Acceptance criteria
- [x] "Show in colour" panel: a checkbox per Google calendar and for the
      TimeBlock plan; unticked greys out, never hides.
- [x] A checkbox on every event greys it out; for a repeating event, the whole series.
- [x] Settings → Calendar lists greyed-out events and brings them back.
- [x] Choices are saved and survive restarts.

Where to look: `lib/calendar/filters.ts` (+ tests) · `app/actions/calendar.ts` ·
`components/calendar/toggle.tsx`.

Decision — checkboxes call their action directly rather than submitting a form:
React 19 resets a form after its action, which flipped the box back to its old
state although the change had been saved (found while testing).

### TB-046 · Unticked means hidden, not greyed *(change, 2026-09-26)*
*As a planner, I want unticked calendars and events removed from the view, so
that a busy month is actually easier to navigate.*

Found in use: greyed-out events still filled every day cell (a month of daily
wake-up, breakfast and lunch entries), and a checkbox on every row added more
clutter instead of less. Supersedes the "grey out" behaviour of TB-043 and TB-044.

Acceptance criteria
- [x] Unticking a calendar, the TimeBlock plan or an event hides it; "+N more"
      counts only what is shown.
- [x] "Only multi-day events" shows only events spanning several days, per view.
- [x] The per-event checkbox appears only on hover or keyboard focus.
- [x] Hidden events are listed in the left panel and Settings, each with **show**.
- [x] Choices saved while these switches greyed out carry over as hidden.
- [x] Quick repeated clicks on a checkbox settle on the last click (a stale
      optimistic value made a second click repeat the first — found in testing).

Where to look: `lib/calendar/filters.ts` (`isHidden`, + tests) ·
`components/calendar/event-chip.tsx` (`HideToggle`) · `calendar-chrome.tsx` ·
`components/calendar/toggle.tsx`.

### TB-044 · Only multi-day events in colour
*As a planner, I want a view that highlights only events spanning several days,
so that trips, holidays and conferences stand out in the month.*

Acceptance criteria
- [x] "Only multi-day events in colour" greys everything that fits within one day.
- [x] Remembered per view — on for Month does not change Week.

### TB-045 · Choose the visible hours
*As a planner, I want the calendar to show 05:00–00:00 by default and to change
that range, so that the grid fits my day.*

Acceptance criteria
- [x] Default 05:00 – 00:00 in the Settings timezone (CET/CEST); an end of 00:00 means midnight.
- [x] Settings → Calendar changes the hours and the view the Calendar opens in.

Where to look: `visibleHours` in `lib/calendar/views.ts` · `CalendarSettings`
in `app/settings/page.tsx` · `drizzle/0003_calendar_view.sql`.

---

# 2026-09-24 · v0.2 — "From year to minute"

**Theme.** v0.1 could plan a single day. v0.2 connects the day to the year:
every task rolls up through a week and a month to a yearly goal, progress bars
move as work is ticked off, learning and work stay in their own hours, short
tasks share calendar blocks, and a whole plan can be imported from a CSV.

**Why.** Planning a real goal (CIS-ITSM certification: 2 October outcomes,
4 weekly topics, eight course modules of 5–85 minutes) exposed gaps in the
original model. They are recorded as design decisions under each epic.

**Upgrade notes.** Migrations `0001_connected_goals` and `0002_drop_legacy_columns`
run automatically on first start. Existing blocks become single-task blocks;
the longest block becomes 60 minutes; windows *Learning 10:30–14:00* and
*Work 14:00–17:30* (Mon–Fri) are created; loose work defaults to *Work*. The
v0.1 "deep work before 12:00" setting is removed (replaced by windows). Restart
a running server after updating.

## E6 · Connected goals and progress

> Every task clearly belongs to a week, a month and a year, and progress rolls
> up the chain.

### TB-020 · One parent per item
*As a planner, I want every task, week and month to serve exactly one parent,
so that it is always clear what a piece of work is for.*

Acceptance criteria
- [x] Month and week forms require an explicit parent choice — a goal, or
      "No parent (standalone)". There is no silent default.
- [x] Every task and goal shows its breadcrumb, e.g.
      *CIS-ITSM Certification › ServiceNow ITSM Fundamentals › Oct · week 1 · Service Portfolio Management*.
- [x] A **Not connected** panel on Year, Month and Week lists unlinked months,
      weeks and open tasks.

Where to look: `/year`, `/month`, `/week`, `/tasks` · `lib/hierarchy.ts`
(`ancestry`, `breadcrumb`, `findUnconnected`) · `components/horizon-screen.tsx`
· tests `lib/hierarchy.test.ts`.

### TB-021 · Progress bars that roll up
*As a planner, I want to see how far I am toward each weekly, monthly and
yearly goal, so that I know whether the year is on track.*

Acceptance criteria
- [x] Every goal shows a bar plus "done/total tasks · minutes done of total".
- [x] Each child counts equally toward its parent; a goal's own tasks count as
      one extra child measured in minutes.
- [x] A child with nothing planned counts as 0%; a goal marked done is 100%;
      dropped goals and tasks are left out.
- [x] Example: Fundamentals done, Implementation 0%, Exam not planned → year 33%.

Where to look: `/year` (expand a goal), `/today` "What today rolls up to" ·
`computeProgress` in `lib/hierarchy.ts` · `components/progress.tsx`.

Decision — *equal weight per child* was chosen over minutes-weighting, because
minutes ignore outcomes that have no tasks yet and would let the year read 100%
before the exam.

### TB-022 · Drill down from the year
*As a planner, I want to open a yearly goal and walk down to its tasks, so that
I can see the whole plan in one place.*

Acceptance criteria
- [x] `/year` expands goal → months → weeks → tasks, with a bar at every level.
- [x] Tasks can be ticked done from the tree.

Where to look: `YearTree`, `MonthDetail`, `WeekDetail` in `components/horizon-screen.tsx`.

### TB-023 · Unambiguous weeks
*As a planner, I want "week 1 of October" to always mean the same dates, so that
weekly plans do not drift between months.*

Acceptance criteria
- [x] A week belongs to the month holding its Thursday (ISO rule); labels read
      "Oct · week 1 (28 Sep – 4 Oct)".
- [x] `/month` shows all of the month's planning weeks; a week with no
      priorities reads "free — buffer".

Where to look: `weekOfMonth` in `lib/hierarchy.ts` · `WeeksOfMonth` in
`components/horizon-screen.tsx`.

Decision — October 2026 has **five** planning weeks; the four named in the
original plan leave week 5 (26 Oct – 1 Nov) as buffer before the exam.

### TB-024 · Weekly planning moves backlog into the week
*As a planner, I want to choose which of a month's tasks this week is for, so
that weekly prioritisation drives what gets scheduled.*

Acceptance criteria
- [x] Tasks directly under a month outcome are its backlog and are not
      scheduled on their own (unless due, or pulled in).
- [x] `/week` lists the backlog of every month outcome the week touches, with a
      **Move** action into one of the week's priorities; `/month` offers the same.
- [x] Quick-add under a week priority takes "title + duration" (e.g. `1h 25m`).

Where to look: `MoveIntoWeek`, `MonthDetail` in `components/horizon-screen.tsx`
· `availability` in `lib/hierarchy.ts` · `app/actions/horizons.ts`.

## E7 · Time windows and packed blocks

> Learning happens in learning hours, work in work hours, and even 5-minute
> tasks get a place in the calendar.

### TB-025 · Named time windows
*As a planner, I want learning to happen 10:30–14:00 and work 14:00–17:30, so
that one never crowds out the other.*

Acceptance criteria
- [x] Settings → **Time windows**: add, edit, delete windows with weekdays;
      choose the default window for unassigned work.
- [x] A task is scheduled only inside its window: its own, else the nearest one
      on a goal above it, else the default. Set *Learning* once on the yearly
      goal and every module follows.
- [x] A window closed that weekday holds its work with a reason ("Learning
      window is closed today").
- [x] Overlapping windows never double-book.

Where to look: `/settings` · `lib/repo/windows.ts` · `effectiveWindowId` ·
`planDay` in `lib/scheduler/plan.ts`.

Decision — windows replace the v0.1 "deep work before 12:00" rule; energy
(deep/shallow/admin) remains a label and colour.

### TB-026 · Combine short tasks into one calendar block
*As a planner, I want 5- and 10-minute tasks combined into shared blocks, so
that a 30-minute minimum calendar window does not strand them.*

Acceptance criteria
- [x] Consecutive tasks share a block while they fit (≤ 60 min).
- [x] Blocks are 30–60 minutes, rounded to 5 minutes, followed by a 15-minute break.
- [x] A split never leaves less than 15 minutes on either side.
- [x] In Google, a combined block is titled "First task +2" and its description
      lists every task, its minutes and its goal chain.

Where to look: `packWindow` in `lib/scheduler/plan.ts` · `lib/google/event-content.ts`
· tests `lib/scheduler/scheduler.test.ts` ("packing the CIS-ITSM course").

### TB-027 · Blocks sized to use the whole slot
*As a planner, I want block lengths chosen so the rest of a slot stays usable, so
that my learning window is not wasted on unusable remainders.*

Acceptance criteria
- [x] A 90-minute slot becomes 45 + break + 30, not 60 + break + 15 unusable.
- [x] An empty learning day (with lunch) yields 150 usable minutes instead of 120.
- [x] The 4h 24m of week-1 modules finish at 13:15 on day 2 instead of day 3.

Where to look: `blockCap` in `lib/scheduler/plan.ts` · test "uses 150 of the 180
learning minutes".

### TB-028 · Block settings from the brief
*As a planner, I want max 60 / min 30 minute blocks and a 15-minute break, so
that the calendar matches how I actually focus.*

Acceptance criteria
- [x] Defaults and the existing settings row: longest block 60, shortest 30,
      break 15, lunch 12:00–12:30 kept.

Where to look: `lib/db/schema.ts` (`settings`) · `drizzle/0001_connected_goals.sql`.

## E8 · Forecast, review and carry-over

> The plan stays honest: what was really done is recorded, what was not comes
> back, and risk is visible early.

### TB-029 · Review yesterday first
*As a planner, I want the morning to start by ticking off what I actually did
yesterday, so that progress bars reflect reality.*

Acceptance criteria
- [x] `/today` opens with **Step 1 · Review <day>** when the last planned day
      has unticked work; saving it records the review and hides the step.
- [x] Blocks and individual tasks inside them can be ticked during the day.
- [x] A task whose ticked minutes reach its estimate becomes done automatically.

Where to look: `ReviewYesterday`, `BlockChecklist` in `app/today/page.tsx` ·
`reviewDayAction`, `toggleSegmentAction` in `app/actions/plan.ts`.

### TB-030 · Carry over only what is left
*As a planner, I want unfinished work planned again with only its remaining
minutes, so that nothing is lost and nothing is done twice.*

Acceptance criteria
- [x] Remaining = estimate − ticked minutes; tomorrow's plan uses the remainder.
- [x] Week work keeps carrying over after its week ends, ranked as overdue.
- [x] Re-planning or clearing a day never removes blocks with ticked work.
- [x] Re-planning today only uses time from now on.

Where to look: `remainingMinutes`, `availability`, `effectiveDeadline` in
`lib/hierarchy.ts` · `retireBlock` in `lib/repo/blocks.ts` · `reservedSpans` in
`lib/planner.ts`.

### TB-031 · Forecast and at-risk flags
*As a planner, I want to see when each goal will finish, so that I can act
before a week or month slips.*

Acceptance criteria
- [x] Tasks show their expected finish day; goals show *on track · done by …*,
      *at risk · …* (finishes after its period, or does not fit in 6 weeks),
      or *tasks waiting to be put into a week*.
- [x] Goals with parts that have nothing planned say so ("1 below with nothing
      planned yet").
- [x] The forecast knows today's meetings only; later days are a best case.

Where to look: `lib/scheduler/forecast.ts` · `outlook` in `lib/planner.ts` ·
`OutlookBadge` in `components/progress.tsx`.

## E9 · CSV import

> Load a whole plan — goals, weeks and tasks — from a spreadsheet.

### TB-032 · Import from Settings with preview
*As a planner, I want to import tasks from a CSV file in Settings, so that I do
not type a course's modules one by one.*

Acceptance criteria
- [x] Settings → **Import tasks from CSV**: choose file → **Preview** (rows with
      breadcrumbs, counts of new/matched goals and tasks) → **Import**.
- [x] All or nothing: any error blocks the import and is listed with its line number.
- [x] Missing goals are created and linked; a week row must name its month
      outcome, a month row its yearly goal.

Where to look: `/settings` · `components/csv-import-form.tsx` ·
`app/actions/import.ts` · `lib/import/` · tests `lib/import/import.test.ts`.

### TB-033 · Formats people actually type
*As a planner, I want durations like "1 hour 25 minutes" and Excel's Slovak CSV
format to just work, so that I can paste my plan as I wrote it.*

Acceptance criteria
- [x] Durations: `56`, `56m`, `1h 25m`, `1:25`, `1 hour 25 minutes`, `1.5h`, `1 hod 25 min`.
- [x] Dates `2026-10-30` or `30.10.2026`; weeks `2026-W40`, `2026-10 week 1` or any date.
- [x] Comma, semicolon or tab separators detected; UTF-8 BOM handled.

Where to look: `lib/csv/parse.ts`, `lib/csv/duration.ts` · tests `lib/csv/csv.test.ts`.

### TB-034 · Safe re-import and a template
*As a planner, I want to fix my spreadsheet and import it again, so that
corrections do not create duplicates or reset progress.*

Acceptance criteria
- [x] Tasks match on title + goal; estimates, priority, energy, dates, notes,
      window and order update; status and ticked progress never change.
- [x] Template with the full CIS-ITSM example: **Download template** in
      Settings, documented in the README.

Where to look: `planImport` in `lib/import/tasks-csv.ts` ·
`public/templates/timeblock-tasks-template.csv` · README "Importing tasks from CSV".

Decision — the exam is a fixed appointment, not a schedulable block: the
template adds a "Book the CIS-ITSM exam" task with a due date instead, and the
November outcome is marked done when passed.

## E10 · Google Calendar setup guide

### TB-035 · Step-by-step connection guide
*As a planner, I want a step-by-step guide to connect Google Calendar, so that
I can set it up once without guessing.*

Acceptance criteria
- [x] Numbered steps: project, Calendar API, Google Auth platform (branding,
      External audience, test user, scopes), Web-application client and redirect
      URI, `.env.local`, restart, connect, verify.
- [x] Troubleshooting for `redirect_uri_mismatch`, `access_denied`, unverified
      app, missing refresh token, 7-day expiry in Testing, `invalid_grant`.
- [x] Linked from the README and the Settings page.

Where to look: `docs/google-calendar-setup.md`.

### TB-038 · Connecting without calendar access is caught *(fix, 2026-09-26)*
*As a planner, I want to be told plainly when I connected Google without granting
calendar access, so that I am not left with "insufficient authentication scopes".*

Found in use: Google's consent screen shows calendar access as its own checkbox,
not ticked by default. Sign-in succeeded without it, TimeBlock saved the grant,
and every calendar read then failed with Google's unhelpful
*Request had insufficient authentication scopes*.

Acceptance criteria
- [x] On connect, the scopes Google actually granted are checked; a grant without
      calendar access is not saved and Settings explains which box to tick.
- [x] Granted scopes are stored; a saved grant lacking calendar access shows
      "Signed in, but without calendar access" with **Reconnect**.
- [x] The raw Google error on Today is replaced by what to do about it.
- [x] Guide step 6.4 and the troubleshooting table cover the checkbox.

Where to look: `lib/google/scopes.ts` (+ test) · `app/api/google/callback/route.ts`
· `loadCalendar` in `lib/planner.ts` · `docs/google-calendar-setup.md`.

### TB-039 · A failed sign-in explains itself instead of "HTTP ERROR 500" *(fix, 2026-09-26)*
*As a planner, I want a failed Google connection to tell me why, so that I can fix
it without anyone reading server internals.*

Found in use: an error while exchanging Google's one-time sign-in code crashed
the callback page with a bare 500, and because the server ran hidden with its
output discarded, the cause was lost.

Acceptance criteria
- [x] The callback never returns a 500: any failure redirects to Settings with a
      plain-language reason (`invalid_grant`, `invalid_client`,
      `redirect_uri_mismatch`, …).
- [x] A reload of the callback after a successful connection (the code is
      single-use) is recognised and reported as connected, not as an error.
- [x] `start-timeblock.ps1` writes the server's output to
      `%LOCALAPPDATA%\timeblock\logs\` and keeps the previous run's logs.
- [x] Piping the script's output no longer hangs (the server does not inherit
      the script's output handles).

Where to look: `app/api/google/callback/route.ts` · `errorMessage` in
`app/settings/page.tsx` · `scripts/start-timeblock.ps1` · guide troubleshooting.

### TB-040 · Works behind antivirus HTTPS scanning *(fix, 2026-09-26)*
*As a planner on a machine with antivirus HTTPS scanning, I want TimeBlock to
reach Google like my browser does, so that connecting does not fail with
UNABLE_TO_VERIFY_LEAF_SIGNATURE.*

Found in use: Avast Web/Mail Shield re-signs every HTTPS connection with its own
root certificate, installed in the Windows certificate store. Browsers trust
that store; Node only trusts its bundled list — so every call to Google failed.
It had worked once only because that server happened to be started from an
environment that set `NODE_USE_SYSTEM_CA`.

Acceptance criteria
- [x] On start-up (dev, start, script or logon task) TimeBlock adds the
      operating system's trusted roots to Node's — certificate verification
      stays fully on.
- [x] The server log records it: `[tls] trusting N certificate(s) from the system store`.
- [x] A server started with no special environment reaches Google.
- [x] Settings explains certificate errors and what to do if one still appears.

Where to look: `instrumentation.ts` · `lib/tls/system-ca.ts` (+ test) ·
guide troubleshooting.

## E11 · Stop and deploy the service

> One script starts, stops and redeploys TimeBlock, without ever touching
> anything that is not TimeBlock.

### TB-036 · Stop the server
*As a planner, I want to stop TimeBlock with one command, so that I do not have to
hunt for node processes in Task Manager.*

Acceptance criteria
- [x] `start-timeblock.ps1 -Stop` stops the server on the port and its whole
      process tree (npm → cmd → node); no processes are left behind.
- [x] It only stops a Next.js server from this project folder. If another program
      holds the port it refuses, names the program, and exits with code 1.
- [x] Stopping when nothing runs is a harmless no-op.

### TB-037 · Deploy new code with one command
*As a planner, I want to restart TimeBlock onto the latest code, so that changes
actually take effect — a running server keeps serving what it loaded at start-up.*

Acceptance criteria
- [x] `start-timeblock.ps1 -Restart` builds, stops the running server, starts it
      again, and waits until the port answers.
- [x] The build runs first; if it fails, the running server is left alone.
- [x] `-Port` is honoured when starting (previously the port was fixed at 4321).
- [x] A missing production build is detected via `.next/BUILD_ID` (a dev run's
      `.next` folder no longer counts as "built").

Where to look: `scripts/start-timeblock.ps1` · README "Start, stop, deploy".

---

# 2026-08-12 · v0.1 — MVP

**Theme.** A local app that asks for priorities each morning and puts time blocks
in Google Calendar around meetings, with 15-minute breaks.

## E1 · Planning horizons

### TB-001 · Yearly goals
*As a planner, I want to write down the few outcomes that make the year a
success, so that daily work has a direction.* — `/year`.

### TB-002 · Monthly outcomes and weekly priorities
*As a planner, I want to define what each month and week is about, so that the
year breaks into steps.* — `/month`, `/week`, linked to a parent.

### TB-003 · Period navigation
*As a planner, I want to move to previous and next periods, so that I can plan
ahead and look back.* — Previous / Current / Next on each screen.

## E2 · Task backlog

### TB-004 · Capture tasks
*As a planner, I want to capture tasks with estimate, priority, energy and due
date, so that the scheduler knows what to place.* — `/tasks`.

### TB-005 · Pull work into today
*As a planner, I want to mark tasks active, so that they are planned today.* —
**Pull in** on `/today`.

## E3 · Daily scheduler

### TB-006 · Protected buffers around meetings
*As a planner, I want 15 minutes kept free around every meeting, so that I
never run from one thing into the next.* — `pad` in `lib/scheduler/intervals.ts`.

### TB-007 · Generate the day
*As a planner, I want free time filled with ranked work, so that I do not have to
arrange the day by hand.* — **Generate the day** on `/today`.

### TB-008 · Nothing silently dropped
*As a planner, I want to see what did not fit and why.* — unplaced reasons on `/today`.

## E4 · Google Calendar sync

### TB-009 · Connect an account
OAuth desktop loopback flow; refresh token stored outside the repo. —
`app/api/google/*`, `lib/google/client.ts`.

### TB-010 · Plan around real meetings
Reads every selected calendar; free, cancelled and declined events are ignored.
— `lib/google/calendar.ts`.

### TB-011 · Write only to TimeBlock's own calendar
Blocks go to **TimeBlock — Focus**; only events tagged `tbBlockId` are ever
changed. — `lib/google/sync.ts`.

## E5 · Daily ritual and autostart

### TB-012 · Ritual prompts
*As a planner, I want to be reminded of the yearly, monthly and weekly reviews
when they are due, so that planning happens at the right altitude.* — banner on
`/today`, keyed on the period.

### TB-013 · Open at logon
Scheduled Task + `scripts/start-timeblock.ps1` open `/today` 30 seconds after
logon. — `scripts/install-autostart.ps1`.

---

## How to add an entry

1. Add a row to **Releases** (newest first) with the date the work was finished.
2. Add or extend an epic: one line saying what it achieves, then stories.
3. Each story: next free `TB-###`, *As a … I want … so that …*, checkbox
   acceptance criteria, and **Where to look** pointing at screens, code, docs
   and tests.
4. Record any design decision that someone might otherwise question later —
   as "Decision — …" under the story it shaped.
