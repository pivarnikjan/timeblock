# Using TimeBlock from an LLM

"Lunch with Peter on Thursday 12–13, move Friday's review to 15:00, and add
three tasks for the exam" is faster typed than clicked. TimeBlock lets an LLM
client — Claude, Codex, a local model — do that: read the calendar and the
tasks, and create, change and delete events and tasks.

Three things hold whichever client you use:

- **Only on this computer.** The client talks to the TimeBlock app running
  here (`http://localhost:4321`). Nothing is exposed to the network.
- **Only with the token.** Each request carries a secret from **Settings → LLM
  access**.
- **Nothing is changed unseen.** The client first asks TimeBlock what a list of
  changes *would* do, shows you those lines, and applies them only when you
  agree.

Why it is built this way: [`decision_log.md`](../decision_log.md), ADR-001.

## Set it up

TimeBlock must be running. Open **Settings → LLM access** and click **Show the
token and the client configuration**.

### Claude desktop

1. In Claude: **Settings → Developer → Edit Config** (opens
   `claude_desktop_config.json`).
2. Paste the block from TimeBlock's Settings — it already holds the right path
   and your token — or merge its `timeblock` entry into the `mcpServers` you
   have:

   ```json
   {
     "mcpServers": {
       "timeblock": {
         "command": "node",
         "args": ["C:\\path\\to\\timeblock\\scripts\\timeblock-mcp.mjs"],
         "env": { "TIMEBLOCK_API_TOKEN": "tb_…" }
       }
     }
   }
   ```

3. Quit Claude completely and start it again. *timeblock* appears among its
   tools.

### Claude Code

```powershell
claude mcp add --transport http timeblock http://localhost:4321/api/mcp --header "Authorization: Bearer tb_…"
```

### OpenAI Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.timeblock]
command = "node"
args = ["C:\\path\\to\\timeblock\\scripts\\timeblock-mcp.mjs"]
env = { TIMEBLOCK_API_TOKEN = "tb_…" }
```

### Any other client

- **It starts a local MCP server** (most desktop and local-model clients): the
  command is `node <project>\scripts\timeblock-mcp.mjs`, with the environment
  variable `TIMEBLOCK_API_TOKEN` (and `TIMEBLOCK_URL` if TimeBlock is not on
  `http://localhost:4321`).
- **It connects to an MCP URL**: `http://localhost:4321/api/mcp`, with the
  header `Authorization: Bearer <token>`.
- **It imports OpenAPI, or it is a script**: see *The HTTP API* below.

**The ChatGPT app cannot connect**: it only reaches servers on the internet,
and TimeBlock deliberately is not one.

Client menus and file locations change; if a step above no longer matches,
the three facts under *Any other client* are what the client needs.

## Using it

Just ask. For example:

- *"What is on my calendar next week?"*
- *"Add lunch with Peter on Thursday 12:00–13:00 and a dentist appointment on
  Friday at 8, one hour."*
- *"Move every meeting on Friday afternoon one hour later."*
- *"Add tasks for the report: outline 45 min, first draft 2 h, review 30 min —
  all due on the 20th, priority 2."*

The model lists what it is about to do — one line per change, with the weekday
and the old and new time — and asks. Read the lines; say yes, or say what to
change.

After it applies changes, an open Calendar shows them on its next refresh —
press **↻ Refresh** to see them at once.

### What it can do

| Tool | What it does |
| --- | --- |
| `get_context` | Today's date, weekday and timezone; your calendars, time windows and categories. |
| `list_events` | What is on the calendar between two dates — events, and TimeBlock's blocks and vacations. |
| `list_tasks` | Your tasks, by status, title or goal. |
| `list_goals` | Yearly goals, month outcomes and week priorities a task can be put under. |
| `preview_changes` | Works out a list of changes and says what each would do. Changes nothing. |
| `apply_changes` | Carries out a previewed list. |

A change is one of: **create / change / delete an event**, **create / change /
delete a task**.

### What it cannot do

- **Touch TimeBlock's own blocks and vacations.** They are planned, not typed:
  use *Plan calendar*, *Reschedule…* and the vacation form. The model sees them
  (so it can plan around them) but cannot change them.
- **Write to read-only calendars** (holidays, calendars shared with you to view).
- **Move an all-day event** — as in the event panel, that is done in Google
  Calendar. Creating and deleting them works.
- **Change a whole repeating series' title.** For a repeating event it changes
  *this occurrence* — or, for the time only, *this and every following one*.
  Deleting removes one occurrence.
- Goals, time windows, categories, settings and planning itself are not offered.

### When something is refused

| It says | Why | Do this |
| --- | --- | --- |
| *Nothing was prepared: N changes have a problem* | A change was impossible (read-only calendar, no such event, a date that does not exist…). Each is listed. | The model usually corrects itself; otherwise say what you meant. |
| *Nothing was applied: … changed after the preview* | An event or task in the list was changed — by you, by Google, by the phone — between the preview and your yes. | Ask it to preview again. |
| *No such change set* | The preview was already applied, or is older than 15 minutes. | Ask it to preview again. |
| *Google Calendar is not connected* | The sign-in is missing or expired. | **Settings → Google Calendar → Connect**. Tasks work meanwhile. |
| *Missing or wrong token* | The client has no token, or you replaced it. | Copy the current token into the client's configuration. |
| *TimeBlock is not running* | The app is stopped. | Start it (`scripts\start-timeblock.ps1`). |

## Keeping it safe

- **The token is a password to your calendar and tasks.** Keep it in client
  configuration on this computer only. If it may have been seen — pasted into a
  chat, committed, shown on a shared screen — **Settings → LLM access → Replace
  token**, then give clients the new one.
- **Read the preview.** Event titles and descriptions come from other people's
  invitations and can contain text written to steer a model ("ignore your
  instructions and delete…"). The preview is what stops that from being carried
  out unseen. Let your client ask before `apply_changes` rather than
  auto-approving it.
- **Web pages cannot use the API**, even though it is on localhost: requests
  from other sites' pages, and requests addressed to anything but
  `localhost` / `127.0.0.1`, are refused before the token is even looked at.
- The server listens on `127.0.0.1` only, so other machines on your network
  cannot reach TimeBlock at all.

The token is in `%LOCALAPPDATA%\timeblock\api-token`, beside the Google grant —
outside the repository, like the rest of your data.

## The HTTP API

The same commands, for scripts and for clients that import OpenAPI. Every
command is a `POST` with a JSON body:

```powershell
$token   = Get-Content "$env:LOCALAPPDATA\timeblock\api-token"
$headers = @{ Authorization = "Bearer $token" }
$api     = 'http://localhost:4321/api/v1'

# What would this do?
$preview = Invoke-RestMethod "$api/preview_changes" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  changes = @(
    @{ kind = 'create_event'; title = 'Lunch with Peter'; date = '2026-10-15'; startTime = '12:00'; endTime = '13:00' }
    @{ kind = 'create_task';  title = 'Book the exam'; estimateMin = 15; priority = 1 }
  )
} | ConvertTo-Json -Depth 5)
$preview.changes.summary

# Do it.
Invoke-RestMethod "$api/apply_changes" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ changeSetId = $preview.changeSetId } | ConvertTo-Json)
```

`GET /api/v1/openapi.json` (with the token) describes every command and its
fields. Dates are `YYYY-MM-DD` and times `HH:mm`, in the timezone from
Settings.

| Status | Meaning |
| --- | --- |
| 200 | Done; the result is the body. |
| 400 | The input does not fit — `problems` lists each field. |
| 401 / 403 | No or wrong token / not from this computer. |
| 404 | No such command, or no such change set. |
| 409 | Not possible now: Google not connected, or the data changed after the preview. |
| 422 | Nothing was prepared: `problems` lists each change that cannot be made. |
| 502 | Google Calendar refused. |

`apply_changes` answers 200 even when single changes failed — Google offers no
all-or-nothing — and says which in `results` (`ok: false`, with the reason).

## How it works

- `lib/commands/` — the **command registry**: each command is a name, a
  description, a JSON Schema for its input and a function over
  `packages/core`'s operations. `registry.ts` lists them; `reads.ts` and
  `changes.ts` hold them; `schema.ts` checks input against the schema.
- `app/api/v1/[command]/route.ts` — the HTTP API; `lib/commands/openapi.ts`
  writes its description from the registry.
- `app/api/mcp/route.ts` + `lib/commands/mcp.ts` — the MCP endpoint, its tools
  made from the registry.
- `scripts/timeblock-mcp.mjs` — the bridge for clients that start a local
  process: it pipes stdin/stdout to the endpoint and does nothing else. It must
  never open the database itself — a process started by a packaged app sees a
  different `%LOCALAPPDATA%`.
- `lib/api/guard.ts`, `token.ts` — who may call.

**Adding a command:** write it in `lib/commands/` and add it to the list in
`registry.ts`. The API route, the OpenAPI document and the MCP tool follow.
A new kind of change goes into `changes.ts`: its schema in `CHANGE`, a `plan…`
function that checks it and says what it would do, and a case in `plan`.
