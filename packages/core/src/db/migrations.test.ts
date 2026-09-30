import { describe, expect, it } from 'vitest';
import { readMigrations } from '../../scripts/bundle-migrations.mjs';
import { MIGRATIONS } from './migrations';

describe('bundled migrations', () => {
  it('match the SQL files drizzle-kit generated (run `npm run db:generate` after changing the schema)', () => {
    expect(MIGRATIONS).toEqual(readMigrations());
  });
});
