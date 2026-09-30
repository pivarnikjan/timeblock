# @timeblock/core

What the TimeBlock desktop app (this repository) and the Android app
([timeblock-mobile](https://github.com/pivarnikjan/timeblock-mobile)) share, so
both follow exactly the same rules:

| Folder | What |
| --- | --- |
| `src/db/` | Drizzle schema, bundled migrations and their runner (over any synchronous SQLite driver) |
| `src/env.ts` | `Env`: the database and Google access every service below runs against — each app builds its own |
| `src/store/` | Reads and writes per table group (blocks, tasks, horizons, vacations, settings…), over any Drizzle database |
| `src/planner.ts` | Plan calendar, Reschedule, Generate the day, the forecast (`outlook`) |
| `src/operations/` | What the buttons do: tick off, commit a day, move/unpin/delete a block, vacations, quick-add |
| `src/scheduler/`, `src/hierarchy.ts`, `src/time/` | Planning: free time, packing, forecast, goal chains, periods, durations |
| `src/calendar/` | Calendar views: `assemble.ts` turns stored data and Google events into drawable items, bands and colours; `load.ts` reads a whole view |
| `src/google/` | Google Calendar: `calendar-api.ts` (REST over fetch), `reads.ts`, `writes.ts`, event parsing and content; `fake-calendar.ts` for tests |
| `src/sync/` | Sync through Google Drive's app data folder — see [docs/phone-sync.md](../../docs/phone-sync.md) |

It is TypeScript source, not a built package: each app compiles it with its own
toolchain. The desktop maps `@timeblock/core/*` to `packages/core/src/*` in
`tsconfig.json`; the phone app includes this repository as a git submodule and
maps the same alias into it.

**Rules**

- Services take an `Env` (`src/env.ts`) — never a global database or Google
  client — so the same code runs on both apps. Queries are always awaited: the
  desktop's Drizzle is async, the phone's synchronous, and `await` suits both.
  Transactions are left to each app (the phone's are synchronous only).
- Import only relative modules and `luxon`, `drizzle-orm`, `fflate` (declared as
  peer dependencies — each app installs them). No Node built-ins, no Next.js,
  no `@/` paths: `src/boundary.test.ts` fails otherwise.
- After changing `src/db/schema.ts`, run `npm run db:generate` in the
  repository root: it writes the SQL migration into `drizzle/` and bundles
  every migration into `src/db/migrations.ts` (a test checks they match).
- A new synced table or column needs nothing else: the sync triggers are
  derived from the live schema at startup. A new *table* is listed in
  `src/sync/tables.ts`.
