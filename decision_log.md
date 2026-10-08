# Decision log

Architecture decisions for TimeBlock: what was decided, why, and what was
turned down. What changed in the app and when is in [`change_log.md`](change_log.md);
this file is for the choices that shape the code and are expensive to reverse.

Each entry is an Architecture Decision Record in the
[MADR](https://adr.github.io/madr/) form.

## Rules

- **One decision per record**, numbered in order (`ADR-001`, `ADR-002`…), newest
  at the bottom.
- **Write it when the decision is made**, before or with the code — not after.
- **A record is not rewritten once accepted.** When a decision changes, add a
  new record and mark the old one *Superseded by ADR-NNN*; the old reasoning
  stays readable. Typos and dead links may be fixed.
- **Status** is one of: *Proposed* (under discussion) · *Accepted* · *Superseded
  by ADR-NNN* · *Deprecated* (no longer applies, nothing replaced it).
- **Record the options turned down** and why — that is what saves the next
  discussion.

## Index

| ADR | Decision | Date | Status |
| --- | --- | --- | --- |
| [001](#adr-001--how-llm-clients-connect-to-timeblock) | LLM clients connect through a local HTTP API, with MCP as a thin adapter over it | 2026-10-08 | Accepted — built in v0.19 |

## Template

```markdown
## ADR-NNN — Title: the decision in a few words

- **Status:** Proposed | Accepted | Superseded by ADR-NNN | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** who decided

### Context and problem
What is the situation, and what question needs an answer?

### Decision drivers
What the answer has to satisfy, most important first.

### Considered options
The list, one line each.

### Decision
The chosen option, and the reason in a sentence or two.

### Consequences
Good, bad, and what it commits us to.

### Pros and cons of the options
Per option.

### Confirmation
How we will know the decision was implemented and holds.

### Revisit when
What would make this worth deciding again.
```

---

## ADR-001 — How LLM clients connect to TimeBlock

- **Status:** Accepted — built in v0.19 (see *Implementation notes* at the end)
- **Date:** 2026-10-08
- **Deciders:** pivarnikjan

### Context and problem

Saying "lunch with Peter on Thursday 12:00–13:00, and move every Friday review
to 15:00" is faster than filling in forms, and the same holds for adding a batch
of tasks. An LLM client should be able to create and change events and tasks in
TimeBlock. Which interface should TimeBlock offer for that, without depending on
one LLM vendor?

How TimeBlock is built today, as far as it bears on the answer:

- **There is no API.** The screens call server actions (`app/actions/*.ts`)
  that take form data; the only route handlers are Google's sign-in
  (`app/api/google/*`).
- **The logic does not depend on the screens.** `packages/core/src/operations`,
  `store` and `google` take an `Env` (database + Google access,
  `packages/core/src/env.ts`), which the desktop builds in `lib/env.ts`. An LLM
  interface is a second caller of those functions, not new logic.
- **Only the running server can reach the real data.** The database and the
  Google grant are in `%LOCALAPPDATA%\timeblock`. A process started by a
  packaged (MSIX) app — Claude desktop is one — sees a private copy of that
  folder, so a helper process launched by an LLM client that opened the
  database file itself would read and write the wrong database.
- **Preview before a write is already the pattern:** *Reschedule…*, the CSV
  import and the calendar's unsaved changes all show what would change first.
- **Creating an ordinary Google event is not an operation yet** — only blocks,
  vacations, moving and deleting are. The Calendar client underneath
  (`CalendarApi.insertEvent`) can.

Scope set for this decision: prompts are typed in an **external client**, not in
TimeBlock; it should work with **Claude and with OpenAI's clients**; **desktop
only**, the phone receives changes through the existing Drive sync; changes are
**previewed, then applied**.

### Decision drivers

1. **No vendor lock-in.** Changing the LLM or the client must not mean
   rewriting the integration.
2. **Local-first.** Nothing new is exposed to the network; no hosted service,
   no API keys held by TimeBlock.
3. **The real database, always** — whichever process the client starts.
4. **Nothing is written unseen.** Bulk changes especially: the change is shown
   before it is made.
5. **One implementation of each behaviour**, in `packages/core`, shared with
   the screens (and later the phone).
6. **Small to build and to keep working** — one person maintains this.

### Considered options

- **A.** A local HTTP API described by OpenAPI.
- **B.** An MCP (Model Context Protocol) server.
- **C.** Vendor tool definitions — Anthropic tool use, OpenAI function calling —
  in an agent loop of our own.
- **D.** A command-line tool.
- **E.** A prompt box inside TimeBlock.
- **F.** Nothing new: use the Google Calendar connectors LLM clients already have.
- **A + B, layered** — chosen.

### Decision

**A and B, layered: one command registry, a local HTTP API as the contract, and
MCP as a thin adapter over that API.**

```
LLM client ──MCP──▶ adapter ──┐
script / curl ────────────────┼─HTTP─▶ /api/v1 ─▶ command registry ─▶ packages/core operations ─▶ SQLite, Google
OpenAPI-importing client ─────┘                    (running server, port 4321)
```

1. **Command registry** (desktop, `lib/commands/`). A command is a name, a
   description, a JSON Schema for its input, whether it reads or writes (and
   whether it deletes), and a handler that calls existing `packages/core`
   operations through `withEnv`. Everything below is generated from it, so a
   command is described once.
2. **HTTP API** under `/api/v1/` on the existing server, with an OpenAPI 3.1
   document generated from the registry. It answers on localhost only, requires
   a bearer token kept beside `credentials.json`, and checks `Host` and
   `Origin`.
3. **MCP** generated from the same registry: a Streamable HTTP endpoint served
   by the app itself, and a small stdio bridge for clients that can only start
   a local process. The bridge forwards to the HTTP API; it holds no logic and
   never opens the database.
4. **Preview, then apply.** A writing command takes a list of changes and
   returns a *change set* — what would be created, changed and deleted, with an
   id. A separate *apply* call carries it out. One event or fifty go the same
   way.
5. **Vendor formats are never written by hand.** Should a client need
   Anthropic's or OpenAI's own tool format, it is generated from the registry.

Why: HTTP is the one interface every client, script and future adapter can
reach, and the only one that reaches the real database from any process
(driver 3). MCP is the one open protocol both Claude's and OpenAI's tooling
speak, and gives tool discovery, schemas and the client's own approval prompts
without code of ours (driver 1). Keeping MCP an adapter means a change in that
protocol — or its successor — touches one small file (driver 6).

**Known limit.** With everything on localhost, clients that run on this
computer work: Claude desktop and Claude Code, OpenAI's Codex CLI and Agents
SDK, and local-model clients that speak MCP. **The ChatGPT app does not**: it
connects only to MCP servers and Actions it can reach from the internet. Adding
it means a tunnel and real authentication — a decision of its own, which this
design leaves open (the HTTP API and its OpenAPI document are what it would
build on). Client capabilities change quickly; check this again when building.

### Consequences

**Good**

- No vendor's format appears in the code; a new client is configuration, a new
  protocol is one more adapter.
- The same API serves scripts and automation with no LLM involved.
- Every write goes through the functions the screens use, so the rules (course
  order, pinned blocks, category colours, sync stamps) hold without being
  repeated.
- Bulk changes are safe by construction.

**Bad**

- Two surfaces to keep working (HTTP and MCP) and one to version (`/api/v1`).
- The server becomes something other local programs can call; that needs
  protecting (below) where today there is nothing to protect.
- The form-data server actions and the registry will overlap until the actions
  are moved onto the registry — worth doing gradually, not a precondition.
- Change sets need storing for a short while and an answer for "the calendar
  changed between preview and apply" (apply fails and asks for a new preview).

**Security — to be built in from the start**

- **Localhost is not private from the browser.** Any web page can send a
  request to `http://localhost:4321`. Hence the bearer token and the `Host` /
  `Origin` checks (the latter also stops DNS rebinding). Confirm the server
  binds to `127.0.0.1` rather than every network interface.
- **The token** is generated on first use, stored outside the repository beside
  the Google grant, and can be replaced from Settings.
- **Text from outside reaches the LLM.** Event titles and descriptions come
  from other people's invitations and may contain instructions aimed at the
  model. Preview-then-apply is the defence: nothing such text talks the model
  into is carried out unseen. Commands that delete are marked as such, so
  clients ask.
- **Google's limits stay as they are:** on its own TimeBlock still writes only
  to its own calendar; an LLM's event changes are the user's changes, previewed.

### Pros and cons of the options

**A. Local HTTP API + OpenAPI**

- ➕ Vendor-neutral and long-lived; every language and tool speaks it.
- ➕ Reaches the real database from any process.
- ➕ Serves scripts too; testable with curl.
- ➕ OpenAPI is what GPT Actions and most agent frameworks import.
- ➖ No chat client uses it directly — each needs an adapter or an import step.
- ➖ Needs authentication even on localhost.
- ➖ A version to maintain.

**B. MCP server**

- ➕ The open standard for exactly this; supported by Claude's and OpenAI's
  tooling and by local-model clients.
- ➕ Tool discovery, input schemas, read-only / destructive hints and the
  client's approval prompt come with it.
- ➖ The protocol is young and still changing.
- ➖ On its own, opening the database directly, it reads the wrong database when
  started by a packaged app, and would duplicate the Google token handling.
- ➖ The ChatGPT app accepts only servers reachable from the internet.
- ➖ Useless to a plain script.

**C. Vendor tool definitions in our own agent loop**

- ➕ Full control over prompts and behaviour.
- ➖ One format per vendor — the lock-in to avoid.
- ➖ TimeBlock would run the loop, hold API keys and carry the cost.
- ➖ Only fits a prompt box inside the app, which is out of scope.

**D. Command-line tool**

- ➕ Any agent with a shell can use it; easy to script.
- ➖ Chat apps without a shell cannot.
- ➖ Untyped text in and out; no discovery.
- ➖ Still needs A underneath to reach the real database.

**E. Prompt box inside TimeBlock**

- ➕ The best experience: the preview drawn on the real calendar.
- ➖ The most work; brings keys, model choice and cost into the app.
- ➖ Not what was asked for. It could be added later on top of the registry.

**F. Nothing new — Google Calendar connectors**

- ➕ No work; works today for plain events.
- ➖ Events only: no tasks, goals, categories, marks, placeholders or vacations.
- ➖ Bypasses TimeBlock's preview and its cache of Google reads (a change shows
  up minutes later).
- ➖ Depends on each client having such a connector.

### Confirmation

When built, the decision holds if:

- one command — say, *create three events* — gives the same result called with
  curl, from Claude, and from an OpenAI client, with no client-specific code in
  the repository;
- the MCP bridge contains no import of the database or of `packages/core`;
- a request without the token, or from a web page's origin, is refused;
- no writing command changes anything before *apply*;
- `packages/core`'s boundary test still passes (no new dependencies there).

### Revisit when

- the ChatGPT app, the phone, or another computer must reach TimeBlock — remote
  access and authentication need their own record;
- MCP changes incompatibly or is displaced by another standard — replace the
  adapter, keep the API;
- a prompt box inside TimeBlock is wanted (option E);
- TimeBlock stops being a single-user app on one machine.

### Implementation notes (2026-10-08, v0.19)

How the decision was carried out, where it was left open. User guide:
[`docs/llm-access.md`](docs/llm-access.md).

- **The API is command-shaped, not resource-shaped:** `POST /api/v1/<command>`
  with a JSON body, for reads too. That is what a registry of commands
  generates naturally, and it keeps the HTTP API and the MCP tools the same
  list.
- **Writes are two commands, `preview_changes` and `apply_changes`,** taking a
  list of changes of six kinds (create / change / delete × event / task). A
  change set lives in the server's memory for 15 minutes and is applied once.
  "Changed since the preview" is decided by comparing what each change was
  worked out from (an event's time, title, description, location and repeat
  rule; a task's fields) — then nothing is applied. Applying is not atomic,
  because Google is not: a change refused midway is reported, the rest are made.
- **MCP is implemented directly, without the MCP SDK:** tools only, stateless,
  JSON replies (`lib/commands/mcp.ts`, about a hundred lines), and the stdio
  bridge is a dependency-free pipe. Reason: no new dependencies, and a stateless,
  tools-only server is small enough to own. Cost: a new protocol revision is adopted by hand. Revisit if resources,
  prompts or server-initiated messages are wanted.
- **Input is checked by a small JSON Schema validator of our own**
  (`lib/commands/schema.ts`) covering only what the commands use, for the same
  no-dependency reason. Revisit if schemas outgrow it.
- **Confirmed: the server was listening on every network interface.** It now
  binds to `127.0.0.1` (`package.json`, `scripts/start-timeblock.ps1`).
- **Not done:** moving the form-data server actions onto the registry; commands
  for goals, windows, categories, vacations, blocks and planning.
