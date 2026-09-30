# @timeblock/core

What the TimeBlock desktop app (this repository) and the Android app
([timeblock-mobile](https://github.com/pivarnikjan/timeblock-mobile)) share, so
both follow exactly the same rules:

| Folder | What |
| --- | --- |
| `src/db/` | Drizzle schema, bundled migrations and their runner (over any synchronous SQLite driver) |
| `src/scheduler/`, `src/hierarchy.ts`, `src/time/` | Planning: free time, packing, forecast, goal chains, periods |
| `src/calendar/` | Calendar views: `assemble.ts` turns stored data and Google events into drawable items, bands and colours |
| `src/google/` | Google Calendar event parsing and the events TimeBlock writes |
| `src/sync/` | Sync through Google Drive's app data folder — see [docs/phone-sync.md](../../docs/phone-sync.md) |

It is TypeScript source, not a built package: each app compiles it with its own
toolchain. The desktop maps `@timeblock/core/*` to `packages/core/src/*` in
`tsconfig.json`; the phone app includes this repository as a git submodule and
maps the same alias into it.

**Rules**

- Import only relative modules and `luxon`, `drizzle-orm`, `fflate` (declared as
  peer dependencies — each app installs them). No Node built-ins, no Next.js,
  no `@/` paths: `src/boundary.test.ts` fails otherwise.
- After changing `src/db/schema.ts`, run `npm run db:generate` in the
  repository root: it writes the SQL migration into `drizzle/` and bundles
  every migration into `src/db/migrations.ts` (a test checks they match).
- A new synced table or column needs nothing else: the sync triggers are
  derived from the live schema at startup. A new *table* is listed in
  `src/sync/tables.ts`.
