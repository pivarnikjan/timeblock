import type { Config } from 'drizzle-kit';

/**
 * Only `drizzle-kit generate` is used — migrations are applied at runtime by
 * lib/db/migrate.ts, because the app talks to SQLite through node:sqlite rather
 * than a driver drizzle-kit can open itself.
 */
export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
} satisfies Config;
