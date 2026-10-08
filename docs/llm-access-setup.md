# Setting up LLM access: Claude and Codex, step by step

How to connect Claude desktop, Claude Code and OpenAI's Codex to TimeBlock, so
you can create and change calendar events and tasks from a prompt. What the
connection can and cannot do, and how it is kept safe:
[`llm-access.md`](llm-access.md).

Client menus and file names below were checked against the vendors'
documentation on 2026-10-08. They change; when a step no longer matches, the
three facts in [If your client is not listed](#if-your-client-is-not-listed)
are all any client needs.

## Before you start (once, about two minutes)

### 1. Deploy and start TimeBlock

LLM access arrived in v0.19. In **your own terminal** (not one inside an AI
assistant), from the project folder:

```powershell
.\scripts\start-timeblock.ps1 -Restart
```

TimeBlock must be running whenever a client uses it — the clients talk to the
app, never to the database.

### 2. Get your token and the bridge path

1. Open <http://localhost:4321/settings#llm-access>.
2. Click **Show the token and the client configuration**.
3. Keep the page open. You will copy from it:
   - **the token** — the line starting with `tb_`;
   - **the configuration block** — it already contains the full path to
     `scripts\timeblock-mcp.mjs` on your computer, and the token.

The token is a password to your calendar and tasks. Paste it only into client
configuration on this computer — never into a chat.

### 3. Check that the API answers

```powershell
$token = Get-Content "$env:LOCALAPPDATA\timeblock\api-token"
Invoke-RestMethod http://localhost:4321/api/v1/get_context -Method Post -Headers @{ Authorization = "Bearer $token" }
```

You should see today's date, your timezone, and your calendars. If
`google.status` is not `connected`, connect Google in Settings first — tasks
work without it, events do not.

### 4. Check that Node.js is found

```powershell
node --version
```

Any version from 18 up will do. Claude desktop and Codex start the bridge with
the command `node`; if this prints an error, install Node.js or use its full
path (`C:\Program Files\nodejs\node.exe`) wherever the steps below say `node`.

---

## Claude desktop

Claude desktop starts a small local program — the bridge,
`scripts\timeblock-mcp.mjs` — and talks to TimeBlock through it.

1. In Claude desktop open **Settings → Developer → Edit Config**. This opens
   `claude_desktop_config.json` (use the button rather than looking for the
   file: it opens the right one whichever way Claude was installed).
2. If the file is empty or holds only `{}`, replace its contents with the
   configuration block from TimeBlock's Settings. It looks like this:

   ```json
   {
     "mcpServers": {
       "timeblock": {
         "command": "node",
         "args": ["C:\\Users\\you\\…\\timeblock\\scripts\\timeblock-mcp.mjs"],
         "env": { "TIMEBLOCK_API_TOKEN": "tb_…" }
       }
     }
   }
   ```

   If the file already has an `mcpServers` section, add only the `"timeblock":
   { … }` entry to it, with a comma after the entry before it. Backslashes in
   the path are doubled — the block from Settings already has them right.
3. Save, then **quit Claude completely** — from the tray icon or the menu, not
   just the window's ×— and start it again.
4. Check: in a new chat, click the **+** at the bottom left of the message box
   → **Connectors**. *timeblock* is listed; opening it shows six tools
   (`get_context`, `list_events`, `list_tasks`, `list_goals`,
   `preview_changes`, `apply_changes`).
5. Try it: [Your first prompts](#your-first-prompts).

**When Claude asks for permission to use a tool:** *Always allow* is fine for
the four reading tools and for `preview_changes`, which changes nothing. Keep
`apply_changes` on *ask every time* — that prompt is your last look before
anything is written.

## Claude Code

Claude Code connects straight to TimeBlock's MCP endpoint; no bridge is needed.

1. In a terminal (replace `tb_…` with your token):

   ```powershell
   claude mcp add --transport http --scope user timeblock http://localhost:4321/api/mcp --header "Authorization: Bearer tb_…"
   ```

   `--scope user` makes it available in every project and keeps the token in
   your own settings. **Do not use `--scope project`**: that writes the token
   into the project's `.mcp.json`, which gets committed.
2. Check:

   ```powershell
   claude mcp get timeblock
   ```

   It should report the server as connected. Inside a Claude Code session,
   `/mcp` shows the same and lists the tools.
3. Try it: [Your first prompts](#your-first-prompts).

To remove it: `claude mcp remove timeblock`.

Claude Code inside the Claude desktop app (the *Code* tab) uses the same
setting.

## Codex (OpenAI)

Codex — the CLI, the IDE extension and the Codex part of the ChatGPT desktop
app — reads one file, `%USERPROFILE%\.codex\config.toml`, so one setup serves
all three.

1. Add the server, either with the command (replace both placeholders — the
   path is the one in TimeBlock's Settings, with single backslashes here):

   ```powershell
   codex mcp add timeblock --env TIMEBLOCK_API_TOKEN=tb_… -- node "C:\Users\you\…\timeblock\scripts\timeblock-mcp.mjs"
   ```

   or by editing `%USERPROFILE%\.codex\config.toml` yourself (backslashes
   doubled):

   ```toml
   [mcp_servers.timeblock]
   command = "node"
   args = ["C:\\Users\\you\\…\\timeblock\\scripts\\timeblock-mcp.mjs"]

   [mcp_servers.timeblock.env]
   TIMEBLOCK_API_TOKEN = "tb_…"
   ```

2. Make Codex ask before anything is written — add to the same file:

   ```toml
   [mcp_servers.timeblock.tools.apply_changes]
   approval_mode = "prompt"
   ```

3. Check:

   ```powershell
   codex mcp list
   ```

   *timeblock* is listed. Inside Codex, `/mcp` shows it with its six tools.
   Restart the IDE extension or the desktop app if it was open.
4. Try it: [Your first prompts](#your-first-prompts).

**Codex under WSL.** A Codex running inside WSL is on a different network and
file system than TimeBlock, which runs on Windows: `localhost` there is not
this computer's `localhost`, and the bridge's Windows path does not exist. Run
Codex natively on Windows for this.

**ChatGPT in the browser** (chatgpt.com) cannot connect: it only reaches MCP
servers on the internet, and TimeBlock deliberately is not one.

## Your first prompts

Start with something that only reads:

> What is on my calendar tomorrow?

The client calls `get_context` (so it knows today's date and your timezone) and
`list_events`, and answers. Then a change:

> Add "Lunch with Peter" on Thursday 12:00–13:00, and a task "Book the exam",
> 15 minutes, priority 1.

What should happen, in this order:

1. The client calls `preview_changes`. **Nothing has changed yet.**
2. It shows you one line per change, for example
   *Create event "Lunch with Peter" · Thu 15 Oct 2026 12:00–13:00 · calendar
   Me*. Check the weekday and the date — that is where models slip.
3. You say yes (or what to correct). The client calls `apply_changes`, and your
   client asks permission for that tool.
4. In TimeBlock, press **↻ Refresh** on the Calendar; the event is there. The
   task is on the Tasks screen.

If the client applies without showing you the lines first, tell it: *"Always
show me the preview and wait for my yes before applying."* Most clients let you
save that as a standing instruction.

More examples:

- *"Move every meeting on Friday afternoon one hour later."*
- *"Delete the dentist appointment next week."*
- *"Add tasks for the report: outline 45 min, first draft 2 h, review 30 min —
  all due on the 20th, priority 2."*
- *"Which of my open tasks are due this month?"*

## When it does not work

| What you see | Why | Do this |
| --- | --- | --- |
| *timeblock* is not in the client's list | The configuration was not loaded. | Check the file is valid JSON / TOML (a missing comma or a single backslash in a JSON path is the usual cause), then quit the client completely and start it again. |
| *TimeBlock is not running at http://localhost:4321* | The app is stopped. | `.\scripts\start-timeblock.ps1` in your own terminal. |
| *TIMEBLOCK_API_TOKEN is not set* | The `env` part is missing from the configuration. | Add it as shown above. |
| *TimeBlock refused the token* / *Missing or wrong token* | The token was mistyped, or replaced in Settings since. | Copy the current token from Settings → LLM access into the client's configuration; restart the client. |
| The server is listed but fails to start; the log mentions `node` | The client cannot find Node.js. | Use the full path to `node.exe` as the command. |
| *Google Calendar is not connected* | The Google sign-in is missing or expired. | Settings → Google Calendar → Connect. |
| A tool call answers *404* or something that is not JSON | TimeBlock is running a version before v0.19. | `.\scripts\start-timeblock.ps1 -Restart`. |
| *Nothing was prepared…*, *Nothing was applied…*, *No such change set* | A change was impossible, or the data changed after the preview. | See *When something is refused* in [`llm-access.md`](llm-access.md). |

Where to look further:

- **Claude desktop:** Settings → Developer lists the server and its state. Its
  logs are in `%APPDATA%\Claude\logs` — `mcp-server-timeblock.log` holds what
  the bridge reported.
- **The bridge on its own:** this should print one line of JSON naming the six
  tools —

  ```powershell
  $env:TIMEBLOCK_API_TOKEN = Get-Content "$env:LOCALAPPDATA\timeblock\api-token"
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node .\scripts\timeblock-mcp.mjs
  ```

- **TimeBlock's side:** `%LOCALAPPDATA%\timeblock\logs\server.err.log`.

## Replacing the token

If the token may have been seen — pasted into a chat, shown on a shared
screen, committed —:

1. **Settings → LLM access → Replace token.** Every client is locked out at
   once.
2. Put the new token where the old one was:
   - Claude desktop: `claude_desktop_config.json` (Settings → Developer → Edit
     Config), then quit and restart Claude.
   - Claude Code: `claude mcp remove timeblock`, then the `claude mcp add …`
     command again with the new token.
   - Codex: `%USERPROFILE%\.codex\config.toml`.

## If your client is not listed

Any client that speaks MCP can connect. It needs one of:

- **A local server to start:** command `node`, argument the full path to
  `scripts\timeblock-mcp.mjs`, environment variable `TIMEBLOCK_API_TOKEN` set
  to the token (and `TIMEBLOCK_URL` if TimeBlock is not on
  `http://localhost:4321`).
- **A URL to connect to:** `http://localhost:4321/api/mcp`, with the header
  `Authorization: Bearer <token>`.

Clients that import OpenAPI, and scripts, use the HTTP API instead — see *The
HTTP API* in [`llm-access.md`](llm-access.md).
