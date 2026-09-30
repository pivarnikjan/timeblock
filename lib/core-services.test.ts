import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { blocks, tasks } from '@timeblock/core/db/schema';
import type { Env } from '@timeblock/core/env';
import { FakeCalendar } from '@timeblock/core/google/fake-calendar';
import { BLOCK_ID_KEY } from '@timeblock/core/google/events';
import { commitFrom } from '@timeblock/core/google/writes';
import * as ops from '@timeblock/core/operations/plan';
import * as vacationOps from '@timeblock/core/operations/vacation';
import { planCalendar, previewReschedule, reschedule } from '@timeblock/core/planner';
import * as blockStore from '@timeblock/core/store/blocks';
import { getSettings } from '@timeblock/core/store/settings';
import { getTask } from '@timeblock/core/store/tasks';
import { eq } from 'drizzle-orm';
import { testDb } from './db/testing';

/**
 * The planner, stores and Google writes that moved into packages/core, run the
 * way both apps run them: over a real (in-memory) database, with Google faked.
 */
function setup() {
  const { db } = testDb();
  const google = new FakeCalendar();
  const env: Env = { db, google: { status: () => 'connected', calendar: () => google } };
  return { db, google, env };
}

async function activeTask(env: Env, title: string, minutes: number) {
  const [task] = await env.db.insert(tasks).values({ title, estimateMin: minutes, status: 'active' }).returning();
  return task;
}

const ownEvents = (google: FakeCalendar, calendarId: string) => [...(google.events.get(calendarId)?.values() ?? [])];

describe('core services over a real database', () => {
  it('plans, commits to Google, ticks off, moves and deletes blocks', async () => {
    const { db, google, env } = setup();
    const task = await activeTask(env, 'Write the report', 90);

    const plan = await planCalendar(env);
    expect(plan.tasksPlaced).toBe(1);
    expect(plan.plannedMinutes).toBe(90);
    const drafts = await blockStore.listFrom(db, plan.from);
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((b) => b.state === 'draft')).toBe(true);

    const committed = await commitFrom(env, plan.from);
    expect(committed.created).toBe(drafts.length);
    const { targetCalendarId } = await getSettings(db);
    expect(google.calendars.get(targetCalendarId!)?.summary).toBe('TimeBlock — Focus');
    const events = ownEvents(google, targetCalendarId!);
    expect(events).toHaveLength(drafts.length);
    const synced = await blockStore.listFrom(db, plan.from);
    expect(synced.every((b) => b.state === 'synced' && b.googleEventId)).toBe(true);
    expect(events.map((e) => e.extendedProperties?.private?.[BLOCK_ID_KEY]).sort()).toEqual(synced.map((b) => String(b.id)).sort());

    // Move the first block by hand: pinned, and its Google event follows.
    const [first, ...rest] = synced;
    const zone = (await getSettings(db)).timezone;
    const day = DateTime.fromISO(first.date, { zone }).plus({ days: 1 }).toISODate()!;
    await ops.moveBlockTo(env, first.id, day, '08:03');
    const moved = (await blockStore.getBlock(db, first.id))!;
    expect(moved.pinned).toBe(true);
    expect(moved.date).toBe(day);
    expect(DateTime.fromISO(moved.startsAt).setZone(zone).toFormat('HH:mm')).toBe('08:05');
    expect(google.events.get(targetCalendarId!)!.get(first.googleEventId!)!.start?.dateTime).toBe(moved.startsAt);

    // Tick every segment: the task is done.
    for (const block of [moved, ...rest]) await ops.completeBlock(env, block.id);
    expect((await getTask(db, task.id))!.status).toBe('done');

    // A block with ticked work cannot be deleted.
    await expect(ops.deleteBlock(env, first.id)).rejects.toThrow(/ticked-off work/);
  });

  it('deletes an untouched committed block together with its Google event', async () => {
    const { db, google, env } = setup();
    await activeTask(env, 'Read', 30);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [block] = await blockStore.listFrom(db, plan.from);
    const { targetCalendarId } = await getSettings(db);

    await ops.deleteBlock(env, block.id);

    expect(await blockStore.getBlock(db, block.id)).toBeNull();
    expect(google.events.get(targetCalendarId!)!.has(block.googleEventId!)).toBe(false);
  });

  it('reschedules around a meeting that lands on committed work', async () => {
    const { db, google, env } = setup();
    await activeTask(env, 'Course module', 60);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [block] = await blockStore.listFrom(db, plan.from);

    google.addEvent('primary', { summary: 'Meeting', start: { dateTime: block.startsAt }, end: { dateTime: block.endsAt } });
    const preview = await previewReschedule(env);
    expect(preview.conflicts).toBe(1);
    expect(preview.toGoogle).toBe(true);

    const result = await reschedule(env);
    expect(result.created).toBeGreaterThan(0);
    const after = await blockStore.listFrom(db, plan.from);
    expect(after.some((b) => b.id === block.id)).toBe(false);
    expect(after.every((b) => b.state === 'synced')).toBe(true);
    expect(after.every((b) => b.endsAt <= block.startsAt || b.startsAt >= block.endsAt)).toBe(true);
  });

  it('saves a vacation with its Google copy, and removes both', async () => {
    const { db, google, env } = setup();
    const saved = await vacationOps.saveVacation(env, {
      from: '2030-07-01T00:00',
      to: '2030-07-05T23:59',
      windowIds: [null],
      note: 'Crete',
      inGoogle: true,
    });
    expect(saved).toMatchObject({ ok: true, date: '2030-07-01', warning: null });
    const { targetCalendarId } = await getSettings(db);
    const [copy] = ownEvents(google, targetCalendarId!);
    expect(copy.summary).toContain('Crete');
    expect(copy.start?.date).toBe('2030-07-01');

    await vacationOps.removeVacation(env, (saved as { id: number }).id);
    expect(ownEvents(google, targetCalendarId!)).toHaveLength(0);

    expect(await vacationOps.saveVacation(env, { from: '2030-07-05T00:00', to: '2030-07-01T00:00', windowIds: [null], note: '', inGoogle: false })).toEqual({
      ok: false,
      message: 'The vacation must end after it starts.',
    });
  });

  it("refuses to delete TimeBlock's own events as plain events", async () => {
    const { db, env } = setup();
    await activeTask(env, 'Read', 30);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [block] = await db.select().from(blocks).where(eq(blocks.state, 'synced'));
    const { targetCalendarId } = await getSettings(db);

    await expect(vacationOps.deleteGoogleEvent(env, targetCalendarId!, block.googleEventId!)).rejects.toThrow(/deleted as blocks/);
  });
});
