import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { horizons, settings, tasks, timeWindows } from './schema';
import { testDb } from './testing';

describe('sqlite-proxy bridge over node:sqlite', () => {
  it('seeds a single settings row with the agreed day shape', async () => {
    const { db } = testDb();

    const rows = await db.select().from(settings);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      timezone: 'Europe/Vienna',
      dayStart: '06:00',
      dayEnd: '18:00',
      bufferMin: 15,
      maxFocusBlockMin: 60,
      minBlockMin: 30,
    });
  });

  it('seeds the Learning and Work windows and defaults loose work to Work', async () => {
    const { db } = testDb();

    const windows = await db.select().from(timeWindows);
    const [row] = await db.select().from(settings);

    expect(windows.map((w) => [w.name, w.startTime, w.endTime, w.weekdays])).toEqual([
      ['Learning', '10:30', '14:00', '1,2,3,4,5'],
      ['Work', '14:00', '17:30', '1,2,3,4,5'],
    ]);
    expect(row.defaultWindowId).toBe(windows.find((w) => w.name === 'Work')!.id);
  });

  it('round-trips inserts, returning ids and typed columns', async () => {
    const { db } = testDb();

    const [year] = await db
      .insert(horizons)
      .values({
        level: 'year',
        title: 'Ship TimeBlock and use it daily',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      })
      .returning();

    expect(year.id).toBeTypeOf('number');
    expect(year.status).toBe('active');
    expect(year.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await db.insert(tasks).values({
      title: 'Design the scheduler',
      horizonId: year.id,
      estimateMin: 120,
      priority: 1,
      energy: 'deep',
    });

    const found = await db.select().from(tasks).where(eq(tasks.horizonId, year.id));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ estimateMin: 120, priority: 1, energy: 'deep', status: 'backlog' });
    expect(found[0].notes).toBeNull();
  });

  it('returns undefined from get() when nothing matches', async () => {
    const { db } = testDb();

    const missing = await db.select().from(tasks).where(eq(tasks.id, 999)).get();

    expect(missing).toBeUndefined();
  });

  it('updates in place and supports a single-row get', async () => {
    const { db } = testDb();

    await db.update(settings).set({ targetCalendarId: 'cal-123' }).where(eq(settings.id, 1));
    const row = await db.select().from(settings).where(eq(settings.id, 1)).get();

    expect(row?.targetCalendarId).toBe('cal-123');
  });

  it('is idempotent when migrations run twice', () => {
    const { sqlite } = testDb();

    expect(() => {
      sqlite.exec('INSERT OR IGNORE INTO settings (id) VALUES (1)');
    }).not.toThrow();
    const count = sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number };
    expect(count.n).toBe(1);
  });
});
