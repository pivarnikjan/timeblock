# TimeBlock

A local planning assistant. You decide what the year, month and week are about;
each morning it turns that into real time blocks in Google Calendar, fitted
around your meetings, inside the hours you reserve for each kind of work, with a
15-minute break after every block.

Everything runs on your machine. The only network calls are to Google Calendar
— and, if you use the phone app, to TimeBlock's own hidden folder in your
Google Drive, through which the two sync ([Phone sync](#phone-sync)).

What changed and when: see [`change_log.md`](change_log.md). Why it is built
the way it is: see [`decision_log.md`](decision_log.md).

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
- **A yearly goal may run over several years.** Set *Runs until* on the Year
  screen (or `2026-2027` in the CSV): it becomes one goal from 1 January of its
  first year to 31 December of its last, shown on each year with that year's
  months. Running it into a year where a goal of the same name exists joins the
  two — that goal's months, weeks and tasks move under it.
- **Progress rolls up.** Each goal's bar is the average of its children, each
  child counting equally; a goal's own tasks count as one more child, measured in
  minutes. A child with nothing planned counts as 0, so a month outcome with no
  tasks yet (e.g. the exam) keeps the year honest. A goal marked *done* is 100%.
- **Windows are inherited.** A task is scheduled in its own time window, else
  the nearest window set on a goal above it, else the default window.
- **When work becomes schedulable.** Tasks under a week priority are planned
  automatically **as soon as there is room** — the week is their deadline, not
  the earliest they may start, so a goal finishes as early as your windows
  allow — and they carry over until done. A month
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

The top navigation is **Calendar · Planning · Tasks · Settings**. **Planning**
holds the Week, Month and Year screens behind one tab bar (their addresses stay
`/week`, `/month`, `/year`; switching keeps the date you are looking at).

| Screen | Cadence | What you do there |
| --- | --- | --- |
| `/year` | Once a year | Set the 40,000ft goals. Expand one to drill down through its months, weeks and tasks, each with a progress bar and forecast. A goal may **run over several years** (*Runs until* in its form): it is listed on each of them, marked 📅 2026 – 2027, with that year's months underneath. |
| `/month` | First session of a month | Define outcomes for the month's goal. See the month's weeks (empty ones read as buffer) and each outcome's backlog. |
| `/week` | First session of a week | Choose the week's priorities, **move backlog tasks into them**, quick-add tasks ("title + 1h 25m"). |
| `/calendar` → **Today** | Every morning | **1. Review yesterday** (only when something is still open) → 2. generate → 3. commit to Google. Committed blocks tick themselves off when their time has passed — untick what did not happen. |

The Calendar's **Today** view shows which reviews are outstanding — keyed on the period, so a Monday
lost to meetings still surfaces the weekly review on Tuesday.

**Forecast.** Week, month and year screens show when each task and goal is
expected to finish, running the same planner forward day by day. Goals that
finish after their period ends are flagged **at risk**. Dated work further out
than the forecast looks (six weeks) is not "at risk" — it is simply later: a
goal whose near part fits reads **on track so far · runs to <date>**, and one
that has not started yet reads **starts <date>**. That is how a year-long plan
of dated sessions (say, three workouts a week until next October) reads. Only today's meetings
are known, so the forecast is optimistic: "at risk" is a real warning,
"on track" is a best case.

## The Calendar

`/calendar` (the old `/today` redirects here) looks and behaves like Google
Calendar, with TimeBlock's plan drawn in:

| View | Shows |
| --- | --- |
| **Today** | One day — with the planning tools underneath: review yesterday, generate, commit, tick blocks off |
| **Work week** | Monday – Friday |
| **Week** | Monday – Sunday |
| **Month** | Whole weeks; multi-day events as bars across the days they cover, other events as coloured dots with their start time |

‹ › move by the size of the view; clicking a date opens that day. The Calendar
opens in **Week** by default; choose another under **Settings → Calendar →
Default view**. The hours shown default to **05:00 – 00:00** (in your Settings
timezone, CET/CEST) and change in the same place. The time grid opens scrolled
to an hour before now, like Google.

**It stays current while it is open.** The red line at the current time follows
this computer's clock by itself — never more than half a minute behind, with no
reload and no request to anyone. The calendar's contents refresh themselves
when you come back to the tab (if that is more than three minutes after the
last refresh), every ten minutes while the tab is in view, and when the day
changes — never in the background, and without moving the grid under you.

Those refreshes are cheap on Google's side: what TimeBlock reads from Google
Calendar is reused for **three minutes**, so moving between weeks, opening
panels and refreshing within that time asks Google nothing. TimeBlock's own
changes (a commit, a moved event, a cleared plan) always show at once, and
planning always reads Google afresh. A meeting you add in Google itself shows
within a few minutes — or straight away with **↻ Refresh** beside the view
switcher, which also says when Google was last read.

**Time windows are coloured bands.** Each window (Learning, Work…) is drawn in
its own colour with a stripe down its left edge, and its name appears once per
view — on the first day it opens — instead of on every day. The left panel's
**Time windows** legend lists each window with its colour and hours, earliest
first (Settings lists them in the same order, and the planner fills them in it). Tick
**Show in front** to draw the bands and their names over the blocks (clicks and
drags still reach the blocks); untick to send them back behind. Set a window's
colour in **Settings → Time windows**; windows without one get distinct
defaults (Learning green, Work orange); the blocks in a window share its colour. A
default follows the order windows were created in, so adding an earlier window
never recolours the others.

**Click anything for details.** Clicking an event or a block opens a panel
beside the calendar (the grid stays where it is; **×** closes it):

- **A Google event** shows when it is, its calendar, and whether it repeats,
  with a link to open it in Google Calendar, and:
  - **★ Important in Month view** — always shown in Month, starred and in bold,
    even with *Only multi-day events* on.
  - **Placeholder** — time held, not taken: *Plan calendar* and *Generate the
    day* may schedule work during it. Drawn hatched.
  - **Show on the calendar** — untick to hide it.
  - **Its time, at the top of the panel, is where it is changed** (calendars
    you can edit; all-day events are moved in Google Calendar). Click it: pick
    another day (or **‹ ›** a day earlier or later), a start and an end, a
    length in one click (15m … 2h — the start stays), or **−15 / +15 min**.
    The change shows on the calendar at once, dashed, and reaches Google only
    with **Save to Google Calendar**; **Undo** puts it back. A repeating event
    asks: **this one**, or **this and following** (Google's own split: earlier
    repeats keep their time, and a new series carries on with the new one,
    keeping the event's category and marks).
  - **Category** — see *Event categories* below: by its title words, one you
    pick, or none. **+ New category…** (offered right under the picker when the
    event has none) makes one on the spot — name, one of Google's colours, and
    the event's title as its words (clear them to put just this event in it) —
    and puts the event in it.
  - **Delete from Google Calendar**, after a confirmation. For a repeating event
    only this occurrence is deleted. Read-only calendars (holidays, calendars
    shared with you to view) cannot be deleted from.

  The three checkboxes are remembered on this computer, per event — for a
  repeating event, for every repeat — so they work on read-only calendars too.
- **A TimeBlock block** shows its tasks and minutes (with **↻ N** beside a task
  rescheduled N times so far), whether it is a draft or in Google, and whether
  you pinned it, with **Unpin** and **Delete block** (its Google event too, if
  committed; its tasks are planned again next time). A block with ticked-off
  work stays as history.
- **Ticking off.** The box beside each task is a checkbox: click it to tick the
  work off, click again to untick; **Mark all done** ticks the whole block.
  You rarely need to: **a committed block's work is ticked off by itself once
  its time has passed**, dated to the block's end. Two things stay open — work
  you unticked by hand ("that did not happen"), until you tick it again or move
  it; and work that slipped and was planned again later (the later block is the
  plan, so the earlier one is not counted as well). Drafts never tick
  themselves off.
- **↻ Didn't get to it — find the next slot** (on a block with work not yet
  ticked off) is for work that did not happen in its time. The unticked work
  moves to the **first free slot in its window** from now on — after the
  block's own end, if you know ahead of time — around meetings, vacations and
  every other block, and nothing else moves. It is pinned there, and a committed
  block's Google event moves with it. Tick off what you did first: ticked work
  stays where it happened and the rest gets a block of its own. A course stays
  in order — its later modules that would now come first move after it (a
  session to a later day). Each task's slip is counted for the **Dashboard**.

**Set vacation.** The **🏖 Set vacation** button beside the view switcher opens
a form: from and until (date and time — an end of 23:59 covers the whole last
day), the time windows you are unavailable for (all ticked by default, plus
*Anytime* for work with no window), and an optional note. While you are away
nothing is planned in those windows — *Plan calendar*, *Generate the day* and
the goal forecasts all skip them, and a window reopens the minute the vacation
ends. Windows you leave unticked (say, *Family*) work as usual.

On the calendar a vacation is unmistakable — deliberately unlike Google: its
exact span is **hatched in red** over everything on the time grid (Friday
00:00 – Saturday 14:30 covers all of Friday and Saturday's morning), with a red
bar across its days in the all-day row, and the closed windows' bands are left
out. Click the bar to open it in the side panel:

- **Scheduled during this vacation** lists everything already in its span —
  Google events on every calendar (lunches, family time, meetings) and
  TimeBlock blocks — each with a checkbox (*all* / *none* to pick quickly).
  **Delete N selected**, after a confirmation, deletes the ticked ones, from
  Google Calendar too (for a repeating event, only that repeat). Events on
  read-only calendars and blocks with ticked-off work are listed but cannot be
  ticked. Nothing is ticked to start with.
- **Edit dates, windows or note** reopens the form with its current values,
  including **Also show in Google Calendar**: ticked, the vacation is kept as an
  event in TimeBlock's own calendar (all-day for whole days); changes follow it
  there when you save, and unticking removes it. If Google cannot be reached the
  vacation is still saved and the panel says so — save again to retry.
- **Delete vacation** removes it; its windows open again.

Saving a new vacation opens it in the panel straight away, so you see what it
collides with at once. Upcoming vacations are also listed under the button.
Run *Reschedule…* afterwards to move work that was planned into it. A multi-day
event already in Google can be made into a vacation from its panel — see
*Multi-day events* below.

**Colours are Google's.** An event uses its own colour if it has one, else its
calendar's — mapped to the palette Google Calendar's web app shows (the API
still reports an older one). **A TimeBlock block takes its window's colour** —
Learning work in Learning's colour, Work in Work's. Committed, its Google event
gets the nearest of Google's eleven event colours (the default window colours
are among them, so they match exactly). **A colour you set on the event in
Google wins**: TimeBlock remembers which colour it gave each event, so any other
colour is yours and is shown here too. Work with no window (Anytime) keeps its
energy colour: deep = Blueberry, shallow = Peacock, admin = Banana. Drafts not
yet in Google are dashed; declined events are outlined and struck through.

**The same rule holds in Google Calendar.** TimeBlock keeps its events there in
their window's colour: every *Commit*, *Reschedule* and change of a window's
colour (or deleting a window) repaints the events that need it, and **Settings →
Time windows → Apply window colours in Google Calendar** does it on demand — use
it once to repaint blocks committed before this rule, which still carry their
energy colour. Events whose colour you changed in Google are never repainted.

**Event categories.** Events that are not TimeBlock work — a meeting at a
client, taking a child to kindergarten — can have a category, set up in
**Settings → Categories**: a name, a colour, and title words. An event whose
title contains one of the words gets the category (case and accents do not
matter: *skolky* matches "Po Eminku do škôlky"; the first category in the list
wins); in the event's panel you can pick one by hand instead, or **No
category**. Like the other marks, the choice is made on a repeating event's
series, so every repeat follows. The event is drawn in the category's colour
here and on the phone, and takes the nearest of Google's eleven colours in
Google Calendar — saved categories and choices recolour at once, new events
within the hour (or **Apply category colours in Google Calendar**). A colour
you change in Google afterwards stays, as with blocks. Categories do not change
planning: a busy event stays busy.

**Hide what you do not need to see.** Unticked items are removed from the view,
so a busy month becomes readable:

- **Google calendars** (Settings → Calendar): a checkbox per calendar; untick
  to hide it. It lives in Settings because it rarely changes — the left panel
  only shows how many are on. Planning still avoids a hidden calendar's busy time.
- **TimeBlock plan** (left panel): untick to hide TimeBlock's own blocks.
- **Show on the calendar** (click the event): untick to hide it. A repeating
  event hides every time it repeats (hide *Ranajky* once, and every breakfast
  is gone).
- **Hidden events** (left panel, and Settings → Calendar) lists them, each with
  **show** to bring it back.
- **Only multi-day events** (Month view only): shows only events that span
  several days, to see trips, holidays and conferences at a glance — plus any
  event marked **★ important**. Views with hours always show their timed events.

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
4. **Rank the work.** Overdue → priority → earliest deadline (a task's due date
   or the end of its week/month) → task order (capture/import order). Earliest
   deadline first keeps this week's work of one goal from being pushed out by
   next month's work of a goal imported earlier. Then **course order wins**:
   the tasks under one month outcome are a course, done strictly in order (by
   week, then task order) — a later module can never jump ahead because it has
   a higher priority, is overdue, or happens to fit a gap. Different courses
   still interleave. **Sequential sessions** (a training plan) follow stricter
   rules — see below.
5. **Pack it into calendar blocks.**
   - Short tasks are **combined** into one block (10:30–11:00 = ebook 5 +
     accessibility 5 + welcome 20).
   - When the next task does not fit, it is split to **fill the block** — no
     idle minutes — never leaving less than 15 minutes on either side of the
     cut. (Only what cannot be cut that way is left over, a few minutes a day.)
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

### Sequential sessions (a training plan)

A course may be packed back to back; a training plan may not. Tick **Sequential
session** on a task (Tasks screen, or `sequential` = yes in the CSV) and it
follows three rules instead. All sequential tasks of one yearly goal form one
plan, in date order, across its months and phases:

1. **One a day, in order.** Two sessions never share a day, and a session never
   comes before the one ahead of it is done. It goes first in its window, so
   the day it is given holds, and it is **never split**: a 55-minute training
   gets one 55-minute block — not 40 minutes and another 15 later that
   morning — or waits for a day with a slot that holds it.
2. **A week is one piece.** The sessions dated in one week (Training A on
   Monday, the treadmill on Tuesday, Training B on Wednesday…) are that week's
   program. It only starts when all of it fits in what is left of a week — back
   from a vacation on a Wednesday, the program waits for Monday.
3. **An interrupted week starts again.** If a week's program cannot be finished
   in the week it began — you leave on Wednesday — it is done again from its
   first session the next week it fits, **the sessions already done included**,
   and every later week moves back by the same amount. Sessions tick themselves
   off when their time has passed, so a week is only interrupted when you say
   so — you untick a session, or press *Didn't get to it* and it no longer fits
   in that week. A block left over from the interrupted week does not stand in
   for its session: the session is planned again with the rest of its week. *Plan calendar* and
   *Reschedule…* say so: "↻ The week starting with Training A · week 1 … starts
   again on Mon 5 Oct — 2 sessions already done are done again". The sessions
   done the first time keep their ticks as history.

The week's other tasks — a weekly check-in, a shopping trip — are not sessions,
so they may share a day, but they **move with their week**: never before the
week's first session, and on the same weekday as before (Tuesday's check-in
stays a Tuesday). *Reschedule…*, *Plan calendar*, *Generate the day* and the goal
forecasts all follow these rules.

## Plan the whole calendar

**Plan calendar** (top of the Calendar, every view) plans every day from today
on, one after another, until every scheduled task has a place:

- Each task lands in its own window (Learning, Work…) on the days that window
  is open, around your Google meetings, exactly as a single day is planned.
- **Courses stay in order across days.** Tuesday continues where Monday
  stopped; section 5 is never placed before section 4 is finished. A course
  whose modules sit in different windows waits for the earlier module first.
- **As soon as possible.** Every learning day is filled back to back until the
  goal is done: work from later weeks is pulled forward rather than waiting for
  its week, earliest deadline first. Month backlogs and loose tasks are left out (the summary says how many) until you move them into
  a week or mark them active.
- **Clear plan…** takes everything planned from today on off the calendar —
  drafts, committed blocks (their Google events are deleted) and blocks you
  placed by hand — after a confirmation that says how many. Use it when
  priorities changed: clear, change the priorities (Tasks, or a CSV import),
  then **Plan calendar** lays everything out afresh. Your tasks are not touched;
  work already ticked off stays (a partly ticked block keeps just that work),
  and so do vacations.
- **Never twice.** Work that already has a block — committed to Google or
  placed by hand — counts as planned: only what has no block yet is planned,
  so running *Plan calendar* again with nothing changed gives the same drafts,
  and right after a commit it plans nothing. Moving committed work around is
  what **Reschedule…** is for.
- The result is **drafts** — dashed on the grid — replacing earlier drafts from
  today on. **Commit N blocks to Google** sends them; blocks already there stay
  as they are. Committing is safe to repeat: a block whose event Google already
  has (a commit cut short) takes that event over, and TimeBlock events in Google
  that no block stands behind any more are removed. **Discard drafts** throws
  the proposal away.

**Adjust by hand.** Drag any block that has nothing ticked off — or any event
in a calendar you can edit — to another time or another visible day, or drag
its **bottom edge** to make it longer or shorter; it snaps to 5 minutes and
shows its new time while you drag. Nothing is saved yet: the item stays where
you dropped it, dashed, with its old place outlined, and a bar at the bottom of
the screen lists every unsaved change (*old time → new time*, and for a
repeating event *this one* or *this and following*). **Save to Google
Calendar** sends them all; **Undo** takes one back, **Undo all** every one.
The event panel's time editor (above) works on the same changes.

Where you drop a block is where it stays — windows do not apply to a block you
placed, so a Learning block may end at 14:15. A block made longer gives its last
task the extra time; made shorter, it loses minutes from its last task (then the
one before) and the next plan places them elsewhere. A moved block is **pinned**
(📌): the next *Plan calendar* or *Generate the day* works around it and does
not plan its minutes again. **Unpin** hands a draft back to the planner. A
committed block's Google event follows it, title and task list included.

**Reschedule when the calendar changes.** A meeting lands on planned work, a
vacation is set, a block is dragged somewhere else — and since courses run in
order, everything after it is off too. **Reschedule…** (beside *Plan calendar*)
re-plans from now on and first tells you what would change: *"3 tasks impacted
from Tue 6 Oct: …"*, how many blocks are replaced and how many stay, and how
many collide with a meeting or vacation. Nothing moves until you click
**Reschedule N tasks**:

- Only blocks that change are replaced. A block that comes out identical stays,
  Google event and all.
- If the plan is committed, Google follows: the replaced blocks' events are
  deleted and the new blocks created there. A plan still in drafts stays drafts.
- Left alone: ticked-off work, blocks already under way, and blocks you placed
  by hand (📌) — unless a meeting now sits on one; then it is moved too, and the
  preview says so.
- **Work finished ahead of plan is not planned again.** A task you marked done
  (or ticked off in full) loses its blocks still to come — even ones you placed
  by hand — and the preview lists it under *Already finished*. A block you
  ticked off before it began (Thursday's module, done on Tuesday evening) moves
  back to when you ticked it, as history, so Thursday's slot opens up for the
  next module; any part of it you did not tick is planned again.

**Windows that stay empty?** Every busy Google event closes the time it covers,
plus the 15-minute break on both sides — a multi-day event (say, Friday 10:00 –
Sunday 11:00) closes every window it spans. Mark events that only *hold* time
(breakfast, lunch, dinner, a child's weekend away) as **Placeholder** in their
panel; for a repeating event one tick covers every repeat. The **Lunch** in
Settings is reserved on top of that every day — set its length to 0 if your
lunch is an event in the calendar.

**Multi-day events: is it a vacation?** A multi-day event made in Google says
nothing about which kinds of work stop — a busy one blocks every window, a free
one (most all-day events) blocks none, so a week in Crete entered only in Google
would be planned full of work. TimeBlock therefore asks once about every
multi-day event in the next three months: a notice above the calendar lists the
undecided ones, and the event's panel asks too. Answer either place:

- **Vacation…** opens the vacation form filled in from the event (its dates, all
  windows ticked, its title as the note). Saved, the event stops counting as
  busy and the vacation closes just the windows you chose. For a repeating
  event, this makes one occurrence a vacation.
- **Not a vacation** leaves it as Google has it and stops asking — for every
  repeat. *Ask again* in its panel takes that back. Marking it a Placeholder
  counts as an answer too.
- If an event you made into a vacation later moves in Google, the notice says so;
  **Move the vacation with it** takes the event's new dates.

Events a vacation already covers, declined ones and TimeBlock's own are never
asked about.

## Dashboard

**Dashboard** (top navigation) shows which work gets done on the first try and
which keeps slipping. **Most rescheduled tasks** lists the tasks rescheduled
most often over the last 30 days, the last 90 days or all time: each with the
goal it serves, whether it is done, how many times it was rescheduled, the
minutes that slipped, and when it last did.

A **reschedule** is work not done in its scheduled time: **Didn't get to it** on
a block, or work left unticked in the morning review of the day it was planned
for. Each slip is stored once (the same block at the same time is never counted
twice — reviewing a day again, or pressing the button on a block the review
already counted, adds nothing), in the `task_reschedules` table, which syncs
with the phone. Moving blocks yourself, *Reschedule…* and a course's later
modules moving along are planning, not slips, and do not count.

## Importing tasks from CSV

**Settings → Import tasks from CSV.** Choose a file, **Preview**, then
**Import**. Start from the template: **Download template** on that card, or
[`public/templates/timeblock-tasks-template.csv`](public/templates/timeblock-tasks-template.csv).

Each row spells out the chain it belongs to. Missing goals are created, existing
ones are matched on level + period + title (case-insensitive).

| Column | Required | Accepts |
| --- | --- | --- |
| `year_goal` | with `month_outcome` | Title of the yearly goal |
| `year` | no | `2026` — taken from `month`/`week` when blank. `2026-2027` makes the goal run over both years: rows naming it with a year inside the range (a `2027` row, tasks in 2027 months) land on that one goal, and a same-titled goal already stored for one of those years is joined into it. |
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
| `sequential` | no | `yes`/`áno`/`x` for a session of a training plan (see *Sequential sessions*), `no` or empty otherwise. Without the column, a re-import leaves the flag as it is. |
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

## Prerequisites

Node.js 24+, Git, a GitHub SSH key, optionally the GitHub CLI, and a Google
Cloud project — what to install on a new Windows computer, and how (including
winget's certificate trouble): [`docs/prerequisites.md`](docs/prerequisites.md).
To build the phone app on this computer as well: [`docs/android-sdk.md`](docs/android-sdk.md).

## Setup

```powershell
git clone git@github.com:pivarnikjan/timeblock.git
cd timeblock
npm install
Copy-Item .env.local.example .env.local   # then fill it in: see Connect Google Calendar
```

`.env.local` holds your Google client secret. It is git-ignored — never commit
it, and never paste its values into issues or pull requests.

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

Then open <http://localhost:4321/calendar>. The server listens on `127.0.0.1`
only — TimeBlock has no sign-in, so it is not offered to other machines on the
network.

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

**Running the scripts.**

- Run them from the project folder. Anywhere else, `.\scripts\…` does not
  exist and PowerShell says *The argument 'scripts/start-timeblock.ps1' to the
  -File parameter does not exist* — `cd` into the project, or give the full
  path.
- If Windows refuses to run unsigned scripts, allow it for that one run only
  (no system setting changes):

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\start-timeblock.ps1 -Restart
  ```

- Start and deploy from **your own terminal** (Windows Terminal, PowerShell,
  VS Code). Apps installed as packaged Store/MSIX apps — including some AI
  coding assistants — can see a private copy of `%LOCALAPPDATA%`; a server
  started from their built-in terminal would then use a different database than
  yours.

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

## Phone sync

The [TimeBlock Android app](https://github.com/pivarnikjan/timeblock-mobile)
keeps its own copy of your plan and works offline; it and the desktop sync
through a hidden TimeBlock folder in your Google Drive — one small file per
device, no server. The desktop sends its changes within a minute and fetches
the phone's every five minutes and before every plan; **Settings → Phone sync**
shows when it last synced and has **Sync now**.

Per value, the later change wins (rename a task on the phone, move its due date
here — both stay); work ticked off is never lost to a re-plan the other device
had not seen. Drafts stay on the device that planned them until committed.
Setup (enable the Drive API, reconnect with the Drive box ticked) and the
details: [`docs/phone-sync.md`](docs/phone-sync.md).

## LLM access

An LLM client — Claude, Codex, a local model — can read the calendar and the
tasks and create, change and delete events and tasks from a prompt ("lunch with
Peter on Thursday 12–13, and move Friday's review to 15:00"). It reaches
TimeBlock on this computer only, with a token from **Settings → LLM access**,
and **every change is previewed first**: the client shows what would happen,
one line per change, and applies it when you agree.

It speaks MCP (`http://localhost:4321/api/mcp`, or `scripts/timeblock-mcp.mjs`
for clients that start a local server); the same commands are a plain HTTP API
under `/api/v1/` for scripts. Step-by-step setup for Claude and Codex:
[`docs/llm-access-setup.md`](docs/llm-access-setup.md). What it can and cannot
do, and the API: [`docs/llm-access.md`](docs/llm-access.md).

## What it writes to Google

On its own, only to a secondary calendar it creates itself, **TimeBlock —
Focus**:

- **Blocks.** A combined block is titled "First task +2" and its description
  lists every task with its minutes and the goal chain it serves. Each carries
  a private `tbBlockId` extended property.
- **Vacations**, when *Also show in Google Calendar* is ticked: "🏖 Vacation ·
  note", all-day when it covers whole days, else timed, carrying a private
  `tbVacationId`. Kept in step when the vacation is edited, and removed when it
  is deleted or the box is unticked. The planner never counts it as busy — the
  vacation itself closes the windows it names.

Only events carrying one of those properties are ever updated or deleted
automatically, and you can hide all of them with one checkbox in Google
Calendar. Your other events are changed only when you change or delete one yourself —
in the event panel, a vacation's *Scheduled during this vacation* list, or
through an LLM client ([LLM access](#llm-access)) — always after a confirmation
or a preview.

## Where your data lives

| What | Where |
| --- | --- |
| Database | `%LOCALAPPDATA%\timeblock\timeblock.db` |
| Google refresh token | `%LOCALAPPDATA%\timeblock\credentials.json` |
| Token for LLM clients and scripts | `%LOCALAPPDATA%\timeblock\api-token` |
| Sync file for the phone | Google Drive's hidden app data folder (see [Phone sync](#phone-sync)) |

Both sit outside the repo, so cloning or copying the project never carries your
data or your token with it. Set `TIMEBLOCK_DATA_DIR` to use a different folder
(handy for trying things on a throwaway database).

## Development

```bash
npm test              # scheduler, hierarchy, CSV import, database bridge
npm run build         # type-check and production build
npm run db:generate   # regenerate SQL after editing packages/core/src/db/schema.ts
```

**"An Application Control policy has blocked this file" when building.**
Tailwind's engine is an unsigned native module
(`tailwindcss-oxide.win32-*.node`), and Windows **Smart App Control** blocks it
on some machines. Nothing needs switching off: `npm run build` and
`npm run dev` first run `scripts/ensure-tailwind-engine.cjs`, which notices the
block, installs Tailwind's WebAssembly engine into `scripts/tailwind-wasm/`
(once, in the version the project's Tailwind expects — it needs the network
that one time), and the build then uses it through
`scripts/tailwind-postcss.cjs`. The stylesheet is the same; where the native
engine loads, the official `@tailwindcss/postcss` plugin is used as before.
After adding a top-level source folder with Tailwind classes in it, add it to
`SOURCES` in that file — the WebAssembly engine only sees the folders listed
there.

To work on a change: branch, test, push, open a pull request.

```powershell
git checkout -b feature/short-name
npm test; npm run lint
git push -u origin feature/short-name
gh pr create --base main       # or open the PR from the branch page on GitHub
```

Try changes against a throwaway database, never your real one: run
`next dev` on another port with its own data folder, e.g.
`$env:TIMEBLOCK_DATA_DIR="$env:TEMP\timeblock-test"; npx next dev --port 4322`.

Migrations in `packages/core/drizzle/` are applied automatically the first time
the database is opened (`npm run db:generate` also bundles them into
`packages/core/src/db/migrations.ts`, which is what both apps run). Data changes drizzle-kit cannot express (seeding windows, copying old
blocks into segments) are hand-written at the end of the migration file and
marked as such.

Code the phone app shares lives in `packages/core` (imported as
`@timeblock/core/...`): the schema and migrations, planning, calendar layout and
sync. It may import only itself, `luxon`, `drizzle-orm` and `fflate` — a test
guards that, since it also runs on the phone.

| Area | Where |
| --- | --- |
| Hierarchy, progress, window inheritance, week-of-month | `packages/core/src/hierarchy.ts` |
| Free time, packing, day plan | `packages/core/src/scheduler/day.ts`, `packages/core/src/scheduler/plan.ts` |
| Plan calendar, Reschedule, Generate the day, forecast | `packages/core/src/planner.ts` (over `scheduler/forecast.ts`, `scheduler/reschedule.ts`) |
| Database reads and writes | `packages/core/src/store/` — one file per table group |
| What the buttons do (tick, commit, move, vacations, quick-add) | `packages/core/src/operations/` |
| Calendar layout (items, bands, colours) | `packages/core/src/calendar/` — `assemble.ts` builds a view |
| Phone sync | `packages/core/src/sync/`, `lib/sync/service.ts` |
| CSV parsing and import | `lib/csv/`, `lib/import/` |
| Google Calendar | `packages/core/src/google/` — `calendar-api.ts` (the REST client), `reads.ts`, `writes.ts` (commits, colours, vacation copies) |
| LLM access: commands, HTTP API, MCP | `lib/commands/` (the registry everything is made from), `app/api/v1/`, `app/api/mcp/`, `lib/api/` (token, who may call), `scripts/timeblock-mcp.mjs` |
| Desktop bindings | `lib/env.ts` builds core's `Env` (database + Google grant); `lib/repo/*`, `lib/planner.ts`, `lib/google/*` bind core to it |

### Stack

Next.js (App Router) · SQLite through Node's built-in `node:sqlite` · Drizzle
via its `sqlite-proxy` driver · Luxon for zone-safe interval maths · `googleapis`
· fflate (gzip for the sync file) · Vitest. No native modules, so there is nothing to compile on Windows/ARM.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). Free for personal use, study,
research, hobby projects, and noncommercial organisations (charities, schools,
public bodies). The Android app ([timeblock-mobile](https://github.com/pivarnikjan/timeblock-mobile)) is under the same license.

**Commercial use** — using it in or for a company, or building on it for
profit — needs a separate commercial license. To get one, contact the author
through [GitHub](https://github.com/pivarnikjan).

Contributions can only be accepted with an agreement that lets the author
license them the same way; please ask before opening a pull request.
