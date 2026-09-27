import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { dayWindow, freeSlots, windowInterval, type BusySpan, type DayShape, type WindowSpec } from './day';
import { forecast } from './forecast';
import { blockCap, planDay, rankTasks, type PlannableTask, type PlannedBlock } from './plan';

const TZ = 'Europe/Vienna';

/** The settings from the v0.2 brief. */
const SHAPE: DayShape = {
  timezone: TZ,
  dayStart: '06:00',
  dayEnd: '18:00',
  bufferMin: 15,
  maxFocusBlockMin: 60,
  minBlockMin: 30,
  lunchStart: '12:00',
  lunchMin: 30,
};

const LEARNING: WindowSpec = { id: 1, name: 'Learning', start: '10:30', end: '14:00', weekdays: [1, 2, 3, 4, 5] };
const WORK: WindowSpec = { id: 2, name: 'Work', start: '14:00', end: '17:30', weekdays: [1, 2, 3, 4, 5] };
const WINDOWS = [LEARNING, WORK];

const local = (date: string, hhmm: string) =>
  DateTime.fromISO(`${date}T${hhmm}`, { zone: TZ }).toUTC().toISO()!;

const meeting = (date: string, from: string, to: string): BusySpan => ({
  start: local(date, from),
  end: local(date, to),
});

const hhmm = (dt: DateTime) => dt.setZone(TZ).toFormat('HH:mm');

const task = (over: Partial<PlannableTask> & { id: number }): PlannableTask => ({
  title: `task ${over.id}`,
  remainingMin: 60,
  priority: 3,
  energy: 'deep',
  dueDate: null,
  sortOrder: over.id,
  windowId: LEARNING.id,
  ...over,
});

/** Blocks as "HH:mm–HH:mm title minutes + …" for readable layout assertions. */
const layout = (blocks: PlannedBlock[], titles: Map<number, string>) =>
  blocks.map(
    (b) =>
      `${hhmm(b.start)}–${hhmm(b.end)} ${b.segments
        .map((s) => `${titles.get(s.taskId)} ${s.minutes}`)
        .join(' + ')}`,
  );

// The daily modules from the brief, in course order.
const COURSE: [string, number][] = [
  ['ebook', 5],
  ['accessibility', 5],
  ['welcome', 20],
  ['intro', 27],
  ['operate', 56],
  ['maintain', 85],
  ['improve', 56],
  ['summary', 10],
];
const COURSE_TASKS = COURSE.map(([title, mins], i) => task({ id: i + 1, title, remainingMin: mins }));
const TITLES = new Map(COURSE_TASKS.map((t) => [t.id, t.title]));

const MONDAY = '2026-09-28'; // Oct · week 1
const TUESDAY = '2026-09-29';

describe('free slots', () => {
  const DATE = '2026-08-12';

  it('opens the full day, minus lunch, when no window is given', () => {
    const slots = freeSlots(DATE, SHAPE, []);

    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([
      ['06:00', '12:00'],
      ['12:30', '18:00'],
    ]);
  });

  it('keeps 15 minutes clear on both sides of a meeting', () => {
    const slots = freeSlots(DATE, SHAPE, [meeting(DATE, '09:00', '10:00')]);

    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([
      ['06:00', '08:45'],
      ['10:15', '12:00'],
      ['12:30', '18:00'],
    ]);
  });

  it('collapses the gap between back-to-back meetings instead of offering it', () => {
    const slots = freeSlots(DATE, SHAPE, [meeting(DATE, '09:00', '10:00'), meeting(DATE, '10:30', '11:30')]);

    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([
      ['06:00', '08:45'],
      ['12:30', '18:00'],
    ]);
  });

  it('confines slots to a window and still removes lunch', () => {
    const slots = freeSlots(DATE, SHAPE, [], windowInterval(DATE, LEARNING, TZ));

    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([
      ['10:30', '12:00'],
      ['12:30', '14:00'],
    ]);
  });

  it('returns nothing for an all-day event', () => {
    expect(freeSlots(DATE, SHAPE, [meeting(DATE, '00:00', '23:59')])).toEqual([]);
  });

  it('holds the local window across both DST transitions', () => {
    for (const date of ['2026-03-29', '2026-10-25']) {
      const window = dayWindow(date, SHAPE);
      expect(hhmm(window.start)).toBe('06:00');
      expect(hhmm(window.end)).toBe('18:00');
    }
  });
});

describe('block sizing', () => {
  it('shortens a block when a full one would strand an unusable remainder', () => {
    expect(blockCap(90, SHAPE)).toBe(45); // 45 + 15 break + 30
    expect(blockCap(120, SHAPE)).toBe(60); // 60 + 15 break + 45
    expect(blockCap(70, SHAPE)).toBe(60); // no second block possible either way
    expect(blockCap(45, SHAPE)).toBe(45);
  });

  it('uses 150 of the 180 learning minutes on an empty day, instead of 120', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [task({ id: 1, remainingMin: 1000 })]);

    expect(plan.blocks.map((b) => `${hhmm(b.start)}–${hhmm(b.end)}`)).toEqual([
      '10:30–11:15',
      '11:30–12:00',
      '12:30–13:15',
      '13:30–14:00',
    ]);
    expect(plan.scheduledMinutes).toBe(150);
  });
});

describe('packing the CIS-ITSM course', () => {
  it('combines short modules and fills day 1', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, COURSE_TASKS);

    expect(layout(plan.blocks, TITLES)).toEqual([
      '10:30–11:00 ebook 5 + accessibility 5 + welcome 20',
      '11:15–12:00 intro 27 + operate 18',
      '12:30–13:10 operate 38',
      '13:25–14:00 maintain 35',
    ]);
    expect(plan.unplaced.map((u) => [TITLES.get(u.taskId), u.remainingMin])).toEqual([
      ['maintain', 50],
      ['improve', 56],
      ['summary', 10],
    ]);
  });

  it('continues on day 2 exactly where day 1 stopped', () => {
    const day1 = planDay(MONDAY, SHAPE, [], WINDOWS, COURSE_TASKS);
    const carried = day1.unplaced.map((u) => ({
      ...COURSE_TASKS.find((t) => t.id === u.taskId)!,
      remainingMin: u.remainingMin,
    }));

    const day2 = planDay(TUESDAY, SHAPE, [], WINDOWS, carried);

    expect(layout(day2.blocks, TITLES)).toEqual([
      '10:30–11:05 maintain 35',
      '11:20–12:00 maintain 15 + improve 25',
      '12:30–13:15 improve 31 + summary 10',
    ]);
    expect(day2.unplaced).toEqual([]);
  });

  it('keeps every block within 30–60 minutes and inside the learning window', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, COURSE_TASKS);
    const window = windowInterval(MONDAY, LEARNING, TZ);

    for (const block of plan.blocks) {
      const length = block.end.diff(block.start, 'minutes').minutes;
      expect(length).toBeGreaterThanOrEqual(30);
      expect(length).toBeLessThanOrEqual(60);
      expect(block.start >= window.start && block.end <= window.end).toBe(true);
    }
  });

  it('leaves a 15-minute break after every block', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, COURSE_TASKS);

    for (let i = 1; i < plan.blocks.length; i++) {
      const gap = plan.blocks[i].start.diff(plan.blocks[i - 1].end, 'minutes').minutes;
      expect(gap).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('windows and meetings', () => {
  it('never places a block inside a meeting buffer', () => {
    const plan = planDay(MONDAY, SHAPE, [meeting(MONDAY, '11:00', '11:30')], WINDOWS, COURSE_TASKS);

    const forbiddenStart = DateTime.fromISO(local(MONDAY, '10:45'));
    const forbiddenEnd = DateTime.fromISO(local(MONDAY, '11:45'));
    for (const block of plan.blocks) {
      expect(block.start >= forbiddenEnd || block.end <= forbiddenStart).toBe(true);
    }
  });

  it('keeps learning and work in their own windows', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [
      task({ id: 1, remainingMin: 60, windowId: LEARNING.id }),
      task({ id: 2, remainingMin: 60, windowId: WORK.id }),
    ]);

    const learning = plan.blocks.filter((b) => b.windowId === LEARNING.id);
    const work = plan.blocks.filter((b) => b.windowId === WORK.id);
    expect(learning.every((b) => hhmm(b.start) >= '10:30' && hhmm(b.end) <= '14:00')).toBe(true);
    expect(work.every((b) => hhmm(b.start) >= '14:00' && hhmm(b.end) <= '17:30')).toBe(true);
    expect(learning.length).toBeGreaterThan(0);
    expect(work.length).toBeGreaterThan(0);
  });

  it('never double-books overlapping windows', () => {
    const overlapping: WindowSpec = { id: 3, name: 'Admin', start: '13:00', end: '15:00', weekdays: [1, 2, 3, 4, 5] };
    const plan = planDay(MONDAY, SHAPE, [], [...WINDOWS, overlapping], [
      task({ id: 1, remainingMin: 300, windowId: LEARNING.id }),
      task({ id: 2, remainingMin: 300, windowId: overlapping.id }),
    ]);

    const sorted = [...plan.blocks].sort((a, b) => a.start.toMillis() - b.start.toMillis());
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start >= sorted[i - 1].end).toBe(true);
    }
  });

  it('holds work for a window that is closed today', () => {
    const saturday = '2026-10-03';
    const plan = planDay(saturday, SHAPE, [], WINDOWS, [task({ id: 1, remainingMin: 30 })]);

    expect(plan.blocks).toEqual([]);
    expect(plan.unplaced[0].reason).toMatch(/Learning window is closed/);
  });

  it('plans work with no window anywhere in the day', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [task({ id: 1, remainingMin: 45, windowId: null })]);

    expect(plan.blocks).toHaveLength(1);
    expect(hhmm(plan.blocks[0].start)).toBe('06:00');
  });
});

describe('ranking', () => {
  it('puts overdue work first, then priority, then capture order', () => {
    const ranked = rankTasks(
      [
        task({ id: 1, priority: 3, sortOrder: 1 }),
        task({ id: 2, priority: 1, sortOrder: 9 }),
        task({ id: 3, priority: 3, sortOrder: 0 }),
        task({ id: 4, priority: 4, dueDate: '2026-09-01' }),
      ],
      MONDAY,
    );

    expect(ranked.map((t) => t.id)).toEqual([4, 2, 3, 1]);
  });
});

describe('forecast', () => {
  it('finishes the course on day 2', () => {
    const result = forecast(
      MONDAY,
      7,
      SHAPE,
      WINDOWS,
      COURSE_TASKS.map((t) => ({ ...t, availableFrom: null })),
    );

    expect(result.finishes.get(1)).toBe(MONDAY); // ebook
    expect(result.finishes.get(8)).toBe(TUESDAY); // summary
    expect(result.leftover.size).toBe(0);
  });

  it('does not start next week’s work early, and reports what does not fit', () => {
    const result = forecast(MONDAY, 2, SHAPE, WINDOWS, [
      { ...task({ id: 1, remainingMin: 60 }), availableFrom: '2026-10-05' },
      { ...task({ id: 2, remainingMin: 600 }), availableFrom: null },
    ]);

    expect(result.finishes.has(1)).toBe(false);
    expect(result.leftover.get(1)).toBe(60);
    expect(result.leftover.get(2)).toBe(600 - 2 * 150);
  });

  it('accounts for known meetings on specific days', () => {
    const busy = new Map([[MONDAY, [meeting(MONDAY, '10:30', '14:00')]]]);
    const result = forecast(MONDAY, 1, SHAPE, WINDOWS, [{ ...task({ id: 1, remainingMin: 30 }), availableFrom: null }], busy);

    expect(result.finishes.has(1)).toBe(false);
    expect(result.leftover.get(1)).toBe(30);
  });
});
