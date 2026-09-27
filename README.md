# TimeBlock

A local planning assistant. You decide what the year, month and week are about;
each morning it turns that into real time blocks in Google Calendar, fitted
around your meetings, inside the hours you reserve for each kind of work, with a
15-minute break after every block.

Everything runs on your machine. The only network calls are to Google Calendar.

What changed and when: see [`change_log.md`](change_log.md).

## How the levels connect

```
Year goal          CIS-ITSM Certification                  ⏱ Learning (inherited by everything below)
└─ Month outcome   ServiceNow ITSM Fundamentals (Oct)
   └─ Week         Oct · week 1 · Service Portfolio Management
      └─ Task      Operate IT Services · 56 min            → packed into 30–60 min calendar blocks
```

- **One parent per item.** A task serves one week priority (or one month
  outcome); a week serves one month outcome; a month serves one yearly goal.
  Forms make the parent an explicit choice — pick one, or "No parent
  (standalone)". Anything unlinked is listed under **Not connected** on every
  planning screen, because it is missing from every progress bar above it.
- **Progress rolls up.** Each goal's bar is the average of its children, each
  child counting equally; a goal's own tasks count as one more child, measured in
  minutes. A child with nothing planned counts as 0, so a month outcome with no
  tasks yet (e.g. the exam) keeps the year honest. A goal marked *done* is 100%.
- **Windows are inherited.** A task is scheduled in its own time window, else
  the nearest window set on a goal above it, else the default window.
- **When work becomes schedulable.** Tasks under a week priority are planned
  automatically from that week's Monday and carry over until done. A month
  outcome's own tasks are its *backlog*: they wait until you move them into a
  week (the weekly ritual) — unless they have a due date or you **Pull in** one
  for today.
- **Deadlines.** A task's deadline is its due date or the end of the week/month
  it serves, whichever is sooner. Overdue work is planned first.
- **Weeks are numbered by the ISO Thursday rule** — a week belongs to the month
  holding its Thursday. October 2026 starts on a Thursday, so its week 1 is
  28 Sep – 4 Oct and it has five weeks. Screens always show both the label and
  the dates.

## The planning rhythm

| Screen | Cadence | What you do there |
| --- | --- | --- |
| `/year` | Once a year | Set the 40,000ft goals. Expand one to drill down through its months, weeks and tasks, each with a progress bar and forecast. |
| `/month` | First session of a month | Define outcomes for the month's goal. See the month's weeks (empty ones read as buffer) and each outcome's backlog. |
| `/week` | First session of a week | Choose the week's priorities, **move backlog tasks into them**, quick-add tasks ("title + 1h 25m"). |
| `/calendar` → **Today** | Every morning | **1. Review yesterday** (tick what you finished) → 2. generate → 3. commit to Google. Tick blocks off during the day. |

The Calendar's **Today** view shows which reviews are outstanding — keyed on the period, so a Monday
lost to meetings still surfaces the weekly review on Tuesday.

**Forecast.** Week, month and year screens show when each task and goal is
expected to finish, running the same planner forward day by day. Goals that
finish after their period ends are flagged **at risk**. Only today's meetings
are known, so the forecast is optimistic: "at risk" is a real warning,
"on track" is a best case.

## The Calendar

`/calendar` (the old `/today` redirects here) looks and behaves like Google
Calendar, with TimeBlock's plan drawn in:

| View | Shows |
| --- | --- |
| **Today** | One day — with the planning tools underneath: review yesterday, generate, commit, tick blocks off |
| **3 days** | The chosen day and the next two |
| **Work week** | Monday – Friday |
| **Week** | Monday – Sunday |
| **Month** | Whole weeks; multi-day events as bars across the days they cover, other events as coloured dots with their start time |

‹ › move by the size of the view; clicking a date opens that day. The hours
shown default to **05:00 – 00:00** (in your Settings timezone, CET/CEST) and
change in **Settings → Calendar**, which also sets the view it opens in. The time
grid opens scrolled to an hour before now, like Google.

**Colours are Google's.** An event uses its own colour if it has one, else its
calendar's — mapped to the palette Google Calendar's web app shows (the API
still reports an older one). TimeBlock's blocks use the colours they get once
committed: deep = Blueberry, shallow = Peacock, admin = Banana. Drafts not yet
in Google are dashed; declined events are outlined and struck through.

**Hide what you do not need to see.** Unticked items are removed from the view,
so a busy month becomes readable:

- **Show** (left panel): a checkbox per Google calendar, plus *TimeBlock plan*.
  Untick to hide that calendar.
- **The checkbox on an event** appears when you point at it: untick to hide the
  event. A repeating event hides every time it repeats (hide *Ranajky* once, and
  every breakfast is gone).
- **Hidden events** (left panel, and Settings → Calendar) lists them, each with
  **show** to bring it back.
- **Only multi-day events**: shows only events that span several days — e.g. in
  Month view to see trips, holidays and conferences at a glance. Remembered
  separately for each view.

## How a day is planned

With the defaults — Learning 10:30–14:00, Work 14:00–17:30, lunch 12:00–12:30,
blocks 30–60 min, 15-minute break:

1. **Read the day.** Every selected Google calendar. Events marked *free*,
   cancelled, or declined do not count as busy.
2. **Protect the gaps.** Each meeting is grown by the break (15 min) on both
   sides *before* free time is worked out, so no block can land inside it.
3. **Free time per window.** Each window that is open that weekday is
   intersected with free time, lunch removed; slivers under 30 min dropped.
   Windows are filled in order and each one's blocks count as busy for the next,
   so overlapping windows never double-book.
4. **Rank the work.** Overdue → priority → task order (capture/import order,
   which keeps a course's module order) → due date.
5. **Pack it into calendar blocks.**
   - Short tasks are **combined** into one block (10:30–11:00 = ebook 5 +
     accessibility 5 + welcome 20).
   - A block closes once it holds 30 minutes and the next task does not fit;
     otherwise the next task is split to fill it, never leaving less than 15
     minutes on either side of the cut.
   - Blocks are sized so the rest of a slot stays usable: a 90-minute slot
     becomes 45 + break + 30 rather than 60 + break + 15 unusable minutes.
     That turns the learning window into **150 usable minutes a day instead of
     120**.
   - Block length = content rounded up to 5 minutes, never under 30.
6. **Carry over.** Only ticked-off minutes count as done. Anything unticked is
   planned again with just the minutes that remain.
7. **Propose, then commit.** Blocks are local drafts until you commit. Blocks
   with ticked work are kept as history and never removed by a re-plan.

Your CIS-ITSM week-1 modules (4h 24m) come out as:

| Day | Blocks |
| --- | --- |
| Mon | 10:30–11:00 ebook + accessibility + welcome · 11:15–12:00 intro + operate (18) · 12:30–13:10 operate (38) · 13:25–14:00 maintain (35) |
| Tue | 10:30–11:05 maintain (35) · 11:20–12:00 maintain (15) + improve (25) · 12:30–13:15 improve (31) + summary |

Nothing that fails to fit is silently dropped: the Today view says why.

## Importing tasks from CSV

**Settings → Import tasks from CSV.** Choose a file, **Preview**, then
**Import**. Start from the template: **Download template** on that card, or
[`public/templates/timeblock-tasks-template.csv`](public/templates/timeblock-tasks-template.csv).

Each row spells out the chain it belongs to. Missing goals are created, existing
ones are matched on level + period + title (case-insensitive).

| Column | Required | Accepts |
| --- | --- | --- |
| `year_goal` | with `month_outcome` | Title of the yearly goal |
| `year` | no | `2026` — taken from `month`/`week` when blank |
| `month_outcome` | with `week_priority` | Title of the month outcome |
| `month` | with `month_outcome` | `2026-10`, or any date in the month — taken from `week` when blank |
| `week_priority` | no | Title of the week priority |
| `week` | with `week_priority` | `2026-W40`, `2026-10 week 1`, or any date in the week |
| `task` | no — leave empty for a goal-only row | Task title |
| `duration` | with `task` | `56`, `56m`, `56 minutes`, `1h 25m`, `1h25`, `1:25`, `1 hour 25 minutes`, `1.5h`, `1 hod 25 min` |
| `priority` | no | 1–4 (1 = highest), default 3 |
| `energy` | no | `deep` (default), `shallow`, `admin` |
| `due_date` | no | `2026-10-30` or `30.10.2026` |
| `status` | no | `backlog` (default) or `active` |
| `window` | no | A window name from Settings. On a task row it sets the task's window; on a goal-only row, the deepest goal's — that is how "Learning" is set once on a yearly goal. |
| `notes` | no | Free text |

Headers are case-insensitive (`Due Date` = `due_date`); unknown columns are
listed and ignored.

**Rules**

- **All or nothing.** Every row is checked first. If any row has a problem,
  nothing is written and each problem is listed with its line number.
- **The chain cannot skip a level.** A week row must name its month outcome; a
  month row its yearly goal. A week must fall inside the month it serves.
- **Re-importing updates, never duplicates.** A task is matched on title + the
  goal it serves. Estimate, priority, energy, due date, notes, window and order
  come from the file; **status and ticked-off progress are never touched.** Fix a
  duration in Excel, import again, done.
- **Row order is task order**, so a course's modules stay in sequence.
- Tasks with no goal, or only a month outcome and no due date, import with a
  warning — they will not be scheduled until connected to a week.

**Excel tips**

- Save as **CSV UTF-8 (Comma delimited)** so accented characters survive.
- A semicolon-separated file (what Excel produces with Slovak regional
  settings) is detected automatically.
- Dates typed as `30.10.2026` are fine.

**The template** is the CIS-ITSM plan: the yearly goal with window Learning,
October's two outcomes, November's exam outcome, weeks 1–4 of October (week 5
left free as buffer before the exam), the eight Fundamentals modules under
week 1, and a task to book the exam. The exam itself is a fixed appointment —
put it in your calendar at the booked time and the planner works around it;
mark the November outcome done when you pass. Which weeks serve which outcome is
an example — edit it to your plan.

## Setup

```bash
npm install
```

### Connect Google Calendar

Step-by-step guide, with troubleshooting:
[`docs/google-calendar-setup.md`](docs/google-calendar-setup.md). In short:
create a Google Cloud project, enable the Calendar API, set up Google Auth
platform (External, yourself as test user), create a **Web application** client
with redirect URI `http://localhost:4321/api/google/callback`, put the ID and
secret in `.env.local`, restart, click **Connect Google** in Settings.

### Run it

```bash
npm run dev
```

Then open <http://localhost:4321/calendar>.

### Start it automatically at logon

```powershell
.\scripts\install-autostart.ps1
```

Registers a per-user Scheduled Task that runs `scripts/start-timeblock.ps1`
30 seconds after logon: it builds if needed, starts the server hidden, waits for
the port, and opens the Calendar. Undo with `.\scripts\install-autostart.ps1 -Remove`.

### Start, stop, deploy

`scripts/start-timeblock.ps1` manages the production server:

```powershell
.\scripts\start-timeblock.ps1            # start (building once if needed) and open the Calendar
.\scripts\start-timeblock.ps1 -Restart   # deploy new code: build, stop, start
.\scripts\start-timeblock.ps1 -Stop      # stop the server
```

Add `-NoBrowser` to skip opening the browser, `-Port 4322` for another port.

The server runs hidden; its output goes to `%LOCALAPPDATA%\timeblock\logs\`
(`server.out.log`, `server.err.log`, and the previous run's as `*.previous.log`).
Look there first when something fails.

- **Deploy with `-Restart`** after pulling or editing code — a running
  `next start` keeps serving whatever it loaded at start-up. The build runs
  *first*, while the old server keeps serving; if it fails, nothing is stopped.
- **Only TimeBlock is ever stopped.** The script checks that whatever listens on
  the port is a Next.js server from this project folder, and stops its whole
  process tree (npm → cmd → node). If another program holds the port, it
  refuses and names it.

## What it writes to Google

Only to a secondary calendar it creates itself, **TimeBlock — Focus**. A
combined block is titled "First task +2" and its description lists every task
with its minutes and the goal chain it serves. Every event carries a private
`tbBlockId` extended property, and only events carrying one are ever updated or
deleted. Your real meetings are never touched, and you can hide every block with
one checkbox in Google Calendar.

## Where your data lives

| What | Where |
| --- | --- |
| Database | `%LOCALAPPDATA%\timeblock\timeblock.db` |
| Google refresh token | `%LOCALAPPDATA%\timeblock\credentials.json` |

Both sit outside the repo, so cloning or copying the project never carries your
data or your token with it. Set `TIMEBLOCK_DATA_DIR` to use a different folder
(handy for trying things on a throwaway database).

## Development

```bash
npm test              # scheduler, hierarchy, CSV import, database bridge
npm run build         # type-check and production build
npm run db:generate   # regenerate SQL after editing lib/db/schema.ts
```

Migrations in `drizzle/` are applied automatically the first time the database
is opened. Data changes drizzle-kit cannot express (seeding windows, copying old
blocks into segments) are hand-written at the end of the migration file and
marked as such.

| Area | Where |
| --- | --- |
| Hierarchy, progress, window inheritance, week-of-month | `lib/hierarchy.ts` |
| Free time, packing, day plan | `lib/scheduler/day.ts`, `lib/scheduler/plan.ts` |
| Forecast | `lib/scheduler/forecast.ts`, `outlook()` in `lib/planner.ts` |
| CSV parsing and import | `lib/csv/`, `lib/import/` |
| Google sync | `lib/google/sync.ts`, `lib/google/event-content.ts` |

### Stack

Next.js (App Router) · SQLite through Node's built-in `node:sqlite` · Drizzle
via its `sqlite-proxy` driver · Luxon for zone-safe interval maths · `googleapis`
· Vitest. No native modules, so there is nothing to compile on Windows/ARM.
