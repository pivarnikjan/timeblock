import { describe, expect, it } from 'vitest';
import type { Horizon, Task } from '@/lib/db/schema';
import {
  availability,
  breadcrumb,
  effectiveDeadline,
  subtreeIds,
  computeProgress,
  effectiveWindowId,
  findUnconnected,
  formatMinutes,
  indexHorizons,
  remainingMinutes,
  weekOfMonth,
} from './hierarchy';

const horizon = (over: Partial<Horizon> & Pick<Horizon, 'id' | 'level' | 'title'>): Horizon => ({
  description: null,
  parentId: null,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  status: 'active',
  windowId: null,
  sortOrder: 0,
  createdAt: '2026-09-24T00:00:00Z',
  ...over,
});

const task = (over: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  notes: null,
  horizonId: null,
  estimateMin: 60,
  priority: 3,
  energy: 'deep',
  dueDate: null,
  status: 'backlog',
  windowId: null,
  sortOrder: 0,
  createdAt: '2026-09-24T00:00:00Z',
  completedAt: null,
  ...over,
});

// The CIS-ITSM plan from the brief.
const LEARNING = 1;
const WORK = 2;
const year = horizon({ id: 1, level: 'year', title: 'CIS-ITSM Certification', windowId: LEARNING, periodStart: '2026-01-01', periodEnd: '2026-12-31' });
const fundamentals = horizon({ id: 2, level: 'month', title: 'ServiceNow ITSM Fundamentals', parentId: 1 });
const implementation = horizon({ id: 3, level: 'month', title: 'ServiceNow ITSM Implementation', parentId: 1 });
const exam = horizon({ id: 4, level: 'month', title: 'CIS-ITSM Exam', parentId: 1, periodStart: '2026-11-01', periodEnd: '2026-11-30' });
const week1 = horizon({ id: 5, level: 'week', title: 'Service Portfolio Management', parentId: 2, periodStart: '2026-09-28', periodEnd: '2026-10-04' });
const HORIZONS = [year, fundamentals, implementation, exam, week1];

describe('connections', () => {
  it('reads a task back to its yearly goal as a breadcrumb', () => {
    expect(breadcrumb(week1.id, indexHorizons(HORIZONS))).toEqual([
      'CIS-ITSM Certification',
      'ServiceNow ITSM Fundamentals',
      'Oct · week 1 · Service Portfolio Management',
    ]);
  });

  it('inherits the window from the nearest ancestor, then the default', () => {
    const byId = indexHorizons(HORIZONS);

    expect(effectiveWindowId({ windowId: null, horizonId: week1.id }, byId, WORK)).toBe(LEARNING);
    expect(effectiveWindowId({ windowId: WORK, horizonId: week1.id }, byId, WORK)).toBe(WORK);
    expect(effectiveWindowId({ windowId: null, horizonId: null }, byId, WORK)).toBe(WORK);
  });

  it('survives a parent cycle without looping', () => {
    const a = horizon({ id: 10, level: 'month', title: 'A', parentId: 11 });
    const b = horizon({ id: 11, level: 'month', title: 'B', parentId: 10 });
    expect(breadcrumb(10, indexHorizons([a, b]))).toEqual(['B', 'A']);
  });

  it('flags month and week items without a parent, and tasks serving nothing', () => {
    const orphanWeek = horizon({ id: 20, level: 'week', title: 'Loose week' });
    const found = findUnconnected(
      [...HORIZONS, orphanWeek],
      [
        task({ id: 1, title: 'linked', horizonId: week1.id }),
        task({ id: 2, title: 'loose' }),
        task({ id: 3, title: 'finished loose', status: 'done' }),
      ],
    );

    expect(found.horizons.map((h) => h.title)).toEqual(['Loose week']);
    expect(found.tasks.map((t) => t.title)).toEqual(['loose']);
  });
});

describe('when work becomes schedulable', () => {
  const byId = indexHorizons(HORIZONS);

  it('schedules week work from its Monday and keeps carrying it over', () => {
    expect(availability({ status: 'backlog', horizonId: week1.id, dueDate: null }, byId)).toEqual({
      kind: 'from',
      date: '2026-09-28',
    });
  });

  it('leaves a month backlog for weekly planning to pick from', () => {
    expect(availability({ status: 'backlog', horizonId: fundamentals.id, dueDate: null }, byId)).toEqual({ kind: 'never' });
    expect(availability({ status: 'active', horizonId: fundamentals.id, dueDate: null }, byId)).toEqual({ kind: 'now' });
  });

  it('uses the sooner of the due date and the period end as the deadline', () => {
    expect(effectiveDeadline({ horizonId: week1.id, dueDate: null }, byId)).toBe('2026-10-04');
    expect(effectiveDeadline({ horizonId: week1.id, dueDate: '2026-09-30' }, byId)).toBe('2026-09-30');
    expect(effectiveDeadline({ horizonId: null, dueDate: null }, byId)).toBeNull();
  });

  it('collects a whole subtree', () => {
    expect([...subtreeIds(year.id, HORIZONS)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...subtreeIds(fundamentals.id, HORIZONS)].sort()).toEqual([2, 5]);
  });
});

describe('week of month (ISO Thursday rule)', () => {
  it('gives October 2026 five weeks, starting 28 Sep', () => {
    expect(weekOfMonth('2026-09-28')).toMatchObject({ month: '2026-10', week: 1 });
    expect(weekOfMonth('2026-10-05')).toMatchObject({ month: '2026-10', week: 2 });
    expect(weekOfMonth('2026-10-26')).toMatchObject({ month: '2026-10', week: 5 });
    expect(weekOfMonth('2026-09-28').label).toBe('Oct · week 1 (28 Sep – 4 Oct)');
  });

  it('puts a week whose Thursday is in the next month into that month', () => {
    // 2 Nov 2026 is a Monday; its Thursday is 5 Nov.
    expect(weekOfMonth('2026-11-02')).toMatchObject({ month: '2026-11', week: 1 });
  });
});

describe('progress roll-up', () => {
  it('weighs each child equally, so an unplanned exam still counts', () => {
    const tasks = [
      task({ id: 1, title: 'fundamentals module', horizonId: fundamentals.id, status: 'done', estimateMin: 264 }),
      task({ id: 2, title: 'implementation module', horizonId: implementation.id, estimateMin: 600 }),
    ];

    // Without week1: an empty week under Fundamentals would itself count as 0.
    const horizons = [year, fundamentals, implementation, exam];
    const progress = computeProgress({ horizons, tasks, ticked: new Map() });

    expect(progress.get(fundamentals.id)?.ratio).toBe(1);
    expect(progress.get(implementation.id)?.ratio).toBe(0);
    expect(progress.get(exam.id)?.ratio).toBeNull();
    expect(progress.get(year.id)?.ratio).toBeCloseTo(1 / 3);
    expect(progress.get(year.id)).toMatchObject({ doneMin: 264, totalMin: 864, doneTasks: 1, totalTasks: 2 });
  });

  it('counts an empty child week as 0 against its month', () => {
    const tasks = [task({ id: 1, title: 'f', horizonId: fundamentals.id, status: 'done' })];

    const progress = computeProgress({ horizons: HORIZONS, tasks, ticked: new Map() });

    // Fundamentals = average(week1 with nothing planned = 0, own tasks = 1).
    expect(progress.get(fundamentals.id)?.ratio).toBe(0.5);
  });

  it('counts ticked segments toward a task that is not finished yet', () => {
    const tasks = [task({ id: 1, title: 'maintain IT services', horizonId: week1.id, estimateMin: 85 })];

    const progress = computeProgress({ horizons: HORIZONS, tasks, ticked: new Map([[1, 55]]) });

    expect(progress.get(week1.id)?.ratio).toBeCloseTo(55 / 85);
    expect(progress.get(week1.id)).toMatchObject({ doneMin: 55, totalMin: 85, doneTasks: 0 });
  });

  it('treats a horizon marked done as complete and ignores dropped work', () => {
    const doneExam = { ...exam, status: 'done' as const };
    const dropped = { ...implementation, status: 'dropped' as const };
    const tasks = [
      task({ id: 1, title: 'f', horizonId: fundamentals.id, status: 'done' }),
      task({ id: 2, title: 'dropped task', horizonId: fundamentals.id, status: 'dropped' }),
    ];

    const progress = computeProgress({
      horizons: [year, fundamentals, dropped, doneExam],
      tasks,
      ticked: new Map(),
    });

    expect(progress.get(fundamentals.id)?.ratio).toBe(1);
    // fundamentals 100%, exam done 100%; implementation dropped and left out.
    expect(progress.get(year.id)?.ratio).toBe(1);
  });

  it('never reports more remaining than the estimate, or anything once done', () => {
    expect(remainingMinutes({ status: 'backlog', estimateMin: 85 }, 55)).toBe(30);
    expect(remainingMinutes({ status: 'backlog', estimateMin: 85 }, 200)).toBe(0);
    expect(remainingMinutes({ status: 'done', estimateMin: 85 }, 0)).toBe(0);
  });

  it('formats minutes for labels', () => {
    expect(formatMinutes(264)).toBe('4h 24m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(27)).toBe('27m');
  });
});
