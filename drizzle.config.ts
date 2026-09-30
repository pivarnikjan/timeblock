import type { Config } from 'drizzle-kit';

/**
 * Only `drizzle-kit generate` is used — migrations are applied at runtime by
 * packages/core/src/db/migrate.ts (desktop and phone alike), because both apps
 * talk to SQLite through bridges drizzle-kit cannot open. `npm run db:generate`
 * also bundles the SQL into packages/core/src/db/migrations.ts.
 */
export default {
  schema: './packages/core/src/db/schema.ts',
  out: './packages/core/drizzle',
  dialect: 'sqlite',
} satisfies Config;
