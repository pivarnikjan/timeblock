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
      Banana); drafts are dashed; declined events outlined and struck through.
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
