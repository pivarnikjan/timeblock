import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { horizons, tasks, taskReschedules } from '@timeblock/core/db/schema';
import type { Env } from '@timeblock/core/env';
import { FakeCalendar } from '@timeblock/core/google/fake-calendar';
import { commitFrom } from '@timeblock/core/google/writes';
import { rescheduledTasks } from '@timeblock/core/insights';
import * as ops from '@timeblock/core/operations/plan';
import { planCalendar } from '@timeblock/core/planner';
import * as blockStore from '@timeblock/core/store/blocks';
import { rescheduleCounts } from '@timeblock/core/store/reschedules';
import { getSettings } from '@timeblock/core/store/settings';
import { testDb } from './db/testing';

/** "Didn't get to it", the morning review's slips, and the Dashboard's count of them. */
function setup() {
  const { db } = testDb();
  const google = new FakeCalendar();
  const env: Env = { db, google: { status: () => 'connected', calendar: () => google } };
  return { db, google, env };
}

async function task(env: Env, title: string, minutes: number, extra: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await env.db.insert(tasks).values({ title, estimateMin: minutes, status: 'active', ...extra }).returning();
  return row;
}

const at = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone);

describe('rescheduling missed work', () => {
  it('moves a missed block to the next free slot after it, with its Google event, and counts the slip', async () => {
    const { db, google, env } = setup();
    const report = await task(env, 'Write the report', 60);
    await task(env, 'Read the paper', 60);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [first, second] = await blockStore.listFrom(db, plan.from);
    const { targetCalendarId, timezone } = await getSettings(db);

    const result = await ops.missBlock(env, first.id);
    const moved = (await blockStore.getBlock(db, first.id))!;
    expect(result.to.blockId).toBe(first.id);
    expect(moved.pinned).toBe(true);
    // After where it was, and not on top of the block that stays.
    expect(moved.startsAt >= first.endsAt).toBe(true);
    expect(moved.endsAt <= second.startsAt || moved.startsAt >= second.endsAt).toBe(true);
    expect(await blockStore.getBlock(db, second.id)).toMatchObject({ startsAt: second.startsAt, pinned: false });
    expect(google.events.get(targetCalendarId!)!.get(first.googleEventId!)!.start?.dateTime).toBe(moved.startsAt);
    expect(at(moved.endsAt, timezone).diff(at(moved.startsAt, timezone), 'minutes').minutes).toBe(60);

    const segmentTask = first.segments[0].taskId;
    expect(result.counts).toEqual([{ taskId: segmentTask, title: segmentTask === report.id ? 'Write the report' : 'Read the paper', count: 1 }]);

    // Missed again: a second slip.
    expect((await ops.missBlock(env, first.id)).counts[0].count).toBe(2);
    const [top] = await rescheduledTasks(env, '30d');
    expect(top).toMatchObject({ taskId: segmentTask, count: 2, minutes: 120, status: 'active' });
  });

  it('moves only the unticked work when part of the block was done', async () => {
    const { db, env } = setup();
    await task(env, 'Short one', 20);
    await task(env, 'Long one', 40);
    const plan = await planCalendar(env);
    const [block] = await blockStore.listFrom(db, plan.from);
    expect(block.segments).toHaveLength(2);
    const [done, open] = block.segments;
    await ops.tick(env, [done.id], true);

    const result = await ops.missBlock(env, block.id);
    expect(result.to.blockId).not.toBe(block.id);
    const kept = (await blockStore.getBlock(db, block.id))!;
    expect(kept.segments.map((s) => s.taskId)).toEqual([done.taskId]);
    const rest = (await blockStore.getBlock(db, result.to.blockId))!;
    expect(rest.segments.map((s) => [s.taskId, s.minutes])).toEqual([[open.taskId, open.minutes]]);
    expect(rest.pinned).toBe(true);
    expect([...(await rescheduleCounts(db))]).toEqual([[open.taskId, 1]]);
  });

  it('keeps a course in order: its later modules move after the missed one', async () => {
    const { db, env } = setup();
    const { timezone } = await getSettings(db);
    const now = DateTime.now().setZone(timezone);
    const [year] = await db
      .insert(horizons)
      .values({ level: 'year', title: 'Learn', periodStart: now.startOf('year').toISODate()!, periodEnd: now.endOf('year').toISODate()! })
      .returning();
    const [month] = await db
      .insert(horizons)
      .values({ level: 'month', title: 'Course', parentId: year.id, periodStart: now.startOf('month').toISODate()!, periodEnd: now.endOf('month').toISODate()! })
      .returning();
    const one = await task(env, 'Module 1', 60, { horizonId: month.id, sortOrder: 1 });
    const two = await task(env, 'Module 2', 60, { horizonId: month.id, sortOrder: 2 });
    const plan = await planCalendar(env);
    const blocks = await blockStore.listFrom(db, plan.from);
    const blockOf = (id: number) => blocks.find((b) => b.segments.some((s) => s.taskId === id))!;
    expect(blockOf(one.id).startsAt < blockOf(two.id).startsAt).toBe(true);

    const result = await ops.missBlock(env, blockOf(one.id).id);
    const movedOne = (await blockStore.getBlock(db, blockOf(one.id).id))!;
    const movedTwo = (await blockStore.getBlock(db, blockOf(two.id).id))!;
    expect(movedTwo.startsAt >= movedOne.endsAt).toBe(true);
    expect(result.shifted).toBe(1);
    // Only the missed module slipped; the one moved along did not.
    expect([...(await rescheduleCounts(db))]).toEqual([[one.id, 1]]);
  });

  it('counts work left unticked in the morning review once, however often the day is reviewed', async () => {
    const { db, env } = setup();
    await task(env, 'Done one', 30);
    await task(env, 'Missed one', 30);
    const plan = await planCalendar(env);
    const day = plan.firstDate!;
    const segments = (await blockStore.listForDate(db, day)).flatMap((b) => b.segments);
    const done = segments.find((s) => s.task.title === 'Done one')!;
    const missed = segments.find((s) => s.task.title === 'Missed one')!;

    await ops.reviewDay(env, day, [done.id]);
    await ops.reviewDay(env, day, [done.id]);

    const rows = await db.select().from(taskReschedules);
    expect(rows.map((r) => [r.taskId, r.reason, r.toStartsAt])).toEqual([[missed.taskId, 'review', null]]);

    // "Didn't get to it" on the same block afterwards is the same slip: still counted once.
    const block = (await blockStore.listForDate(db, day)).find((b) => b.segments.some((s) => s.id === missed.id))!;
    await ops.missBlock(env, block.id);
    expect((await rescheduleCounts(db)).get(missed.taskId)).toBe(1);
  });

  it('refuses a block with nothing left to do, and changes nothing', async () => {
    const { db, env } = setup();
    await task(env, 'Tiny', 30);
    const plan = await planCalendar(env);
    const [block] = await blockStore.listFrom(db, plan.from);
    await ops.completeBlock(env, block.id);
    await expect(ops.missBlock(env, block.id)).rejects.toThrow(/ticked off/);
    expect(await db.select().from(taskReschedules)).toEqual([]);
  });
});
