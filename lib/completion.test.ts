import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { tasks } from '@timeblock/core/db/schema';
import type { Env } from '@timeblock/core/env';
import { FakeCalendar } from '@timeblock/core/google/fake-calendar';
import { commitFrom } from '@timeblock/core/google/writes';
import * as ops from '@timeblock/core/operations/plan';
import { planCalendar } from '@timeblock/core/planner';
import * as blockStore from '@timeblock/core/store/blocks';
import { getSettings } from '@timeblock/core/store/settings';
import { getTask } from '@timeblock/core/store/tasks';
import { testDb } from './db/testing';

/** Work done when its time has passed, "Clear plan", and a week of sessions that starts again. */
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

const after = (iso: string, minutes = 1) => new Date(Date.parse(iso) + minutes * 60_000);
const ownEvents = (google: FakeCalendar, calendarId: string) => [...(google.events.get(calendarId)?.values() ?? [])];

afterEach(() => vi.useRealTimers());

describe('work is done when its time has passed', () => {
  it('ticks off a committed block once it has ended, dated to its end — never a draft, never early', async () => {
    const { db, env } = setup();
    const report = await task(env, 'Write the report', 150);
    const plan = await planCalendar(env);
    const drafts = await blockStore.listFrom(db, plan.from);
    expect(drafts.length).toBeGreaterThan(1);

    // Drafts are a proposal: time passing does nothing to them.
    expect(await ops.completeElapsed(env, after(drafts.at(-1)!.endsAt))).toBe(0);

    await commitFrom(env, plan.from);
    const [first, ...rest] = await blockStore.listFrom(db, plan.from);
    expect(await ops.completeElapsed(env, new Date(Date.parse(first.startsAt)))).toBe(0);

    // Its first block has ended: that part is done, the later parts are still ahead.
    expect(await ops.completeElapsed(env, after(first.endsAt))).toBe(first.segments.length);
    const done = (await blockStore.getBlock(db, first.id))!;
    expect(done.segments.every((s) => s.doneAt === first.endsAt)).toBe(true);
    expect((await blockStore.getBlock(db, rest[0].id))!.segments.every((s) => s.doneAt === null)).toBe(true);
    expect((await getTask(db, report.id))!.status).toBe('active');

    // All of it has ended: the task is done. Asking again changes nothing.
    await ops.completeElapsed(env, after(rest.at(-1)!.endsAt));
    expect((await getTask(db, report.id))!.status).toBe('done');
    expect(await ops.completeElapsed(env, after(rest.at(-1)!.endsAt, 60))).toBe(0);
  });

  it('leaves work unticked by hand open, until it is moved to a new time', async () => {
    const { db, env } = setup();
    await task(env, 'Read the paper', 45);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [block] = await blockStore.listFrom(db, plan.from);

    await ops.completeElapsed(env, after(block.endsAt));
    await ops.tick(env, [block.segments[0].id], false); // "that did not happen"
    expect(await ops.completeElapsed(env, after(block.endsAt, 120))).toBe(0);

    // "Didn't get to it" gives it a new time; when that has passed, it is done.
    const { to } = await ops.missBlock(env, block.id);
    expect(await ops.completeElapsed(env, after(to.endsAt))).toBe(1);
  });

  it('does not tick off work that slipped and was planned again later', async () => {
    const { db, env } = setup();
    const one = await task(env, 'Workshop prep', 60);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [slipped] = await blockStore.listFrom(db, plan.from);

    // The same hour planned a second time, a day later — the first block is what slipped.
    const laterStart = DateTime.fromISO(slipped.startsAt).plus({ days: 1 });
    const again = await blockStore.insertDraft(db, laterStart.toISODate()!, {
      startsAt: laterStart.toUTC().toISO()!,
      endsAt: laterStart.plus({ minutes: 60 }).toUTC().toISO()!,
      windowId: slipped.windowId,
      segments: [{ taskId: one.id, minutes: 60 }],
    });
    await blockStore.markSynced(db, again, 'ev-again');

    expect(await ops.completeElapsed(env, after(slipped.endsAt))).toBe(0);
    expect(await ops.completeElapsed(env, after(laterStart.plus({ minutes: 60 }).toUTC().toISO()!))).toBe(1);
    expect((await blockStore.getBlock(db, slipped.id))!.segments[0].doneAt).toBeNull();
    expect((await blockStore.getBlock(db, again))!.segments[0].doneAt).not.toBeNull();
    expect((await getTask(db, one.id))!.status).toBe('done');
  });
});

describe('clearing the plan', () => {
  it('takes every planned block from today on off the calendar and out of Google, keeping ticked work and the tasks', async () => {
    const { db, google, env } = setup();
    const report = await task(env, 'Write the report', 60);
    const paper = await task(env, 'Read the paper', 60);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [first, second] = await blockStore.listFrom(db, plan.from);
    const { targetCalendarId } = await getSettings(db);
    await ops.completeBlock(env, first.id);
    // A later draft, placed by hand, goes too.
    await task(env, 'Late idea', 30);
    await planCalendar(env);
    const draft = (await blockStore.listFrom(db, plan.from)).find((b) => b.state === 'draft')!;
    await blockStore.setPinned(db, draft.id, true);

    const result = await ops.clearPlan(env);
    expect(result).toEqual({ removed: 2, events: 1, kept: 0 });
    const left = await blockStore.listFrom(db, plan.from);
    expect(left.map((b) => b.id)).toEqual([first.id]);
    expect(ownEvents(google, targetCalendarId!).map((e) => e.id)).toEqual([first.googleEventId]);
    expect(await blockStore.getBlock(db, second.id)).toBeNull();

    // The tasks are untouched: finished stays finished, the rest is planned afresh.
    const doneId = first.segments[0].taskId;
    expect((await getTask(db, doneId))!.status).toBe('done');
    const replan = await planCalendar(env);
    expect(replan.plannedMinutes).toBe(90);
    expect(replan.tasksPlaced).toBe(2);
    expect([report.id, paper.id]).toContain(doneId);

    // Nothing left to clear: nothing happens.
    await ops.discardDrafts(env);
    expect(await ops.clearPlan(env)).toEqual({ removed: 0, events: 0, kept: 0 });
  });

  it('keeps just the ticked work of a partly ticked block', async () => {
    const { db, env } = setup();
    await task(env, 'Short one', 20);
    await task(env, 'Long one', 40);
    const plan = await planCalendar(env);
    await commitFrom(env, plan.from);
    const [block] = await blockStore.listFrom(db, plan.from);
    await ops.tick(env, [block.segments[0].id], true);

    expect(await ops.clearPlan(env)).toEqual({ removed: 0, events: 0, kept: 1 });
    const kept = (await blockStore.getBlock(db, block.id))!;
    expect(kept.state).toBe('done');
    expect(kept.segments.map((s) => s.id)).toEqual([block.segments[0].id]);
  });
});

describe('a week of sessions that starts again', () => {
  it('plans every session again — also one whose block from the interrupted week is still there', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // A Friday noon; the week's sessions were due Monday to Friday.
    vi.setSystemTime(new Date('2030-03-08T11:00:00Z'));
    const { db, env } = setup();
    const { timezone } = await getSettings(db);
    const session = (title: string, due: string) => task(env, title, 45, { sequential: true, dueDate: due });
    const a = await session('Training A', '2030-03-04');
    const hill = await session('Hill walk', '2030-03-05');
    const b = await session('Training B', '2030-03-06');
    const c = await session('Training C', '2030-03-08');

    const committed = async (taskId: number, date: string, done: boolean) => {
      const start = DateTime.fromISO(`${date}T08:30`, { zone: timezone });
      const id = await blockStore.insertDraft(db, date, {
        startsAt: start.toUTC().toISO()!,
        endsAt: start.plus({ minutes: 45 }).toUTC().toISO()!,
        windowId: null,
        segments: [{ taskId, minutes: 45 }],
      });
      await blockStore.markSynced(db, id, `ev-${taskId}`);
      if (done) await ops.completeBlock(env, id);
      return id;
    };
    // A and B were done; the hill walk never happened; C's block this morning was unticked by hand.
    await committed(a.id, '2030-03-04', true);
    await committed(b.id, '2030-03-06', true);
    const stale = await committed(c.id, '2030-03-08', false);
    await ops.tick(env, await blockStore.segmentIdsOfBlock(db, stale), false);

    const plan = await planCalendar(env);
    expect(plan.restarts).toHaveLength(1);
    const drafts = (await blockStore.listFrom(db, plan.from)).filter((x) => x.state === 'draft');
    const dayOf = (taskId: number) => drafts.find((x) => x.segments.some((s) => s.taskId === taskId))?.date;
    // The whole week again, next week, one a day and in order — C included.
    const days = [a.id, hill.id, b.id, c.id].map(dayOf);
    expect(days.every((d) => d !== undefined && d >= '2030-03-11' && d <= '2030-03-17')).toBe(true);
    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(4);
  });
});
