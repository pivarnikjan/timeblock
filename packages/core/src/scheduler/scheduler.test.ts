import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { dayWindow, freeSlots, windowInterval, type BusySpan, type DayShape, type WindowSpec } from './day';
import { dueAfter, forecast, planRange } from './forecast';
import { blockCap, planDay, rankTasks, type PlannableTask, type PlannedBlock } from './plan';
import { conflictOf, diffBlocks, doneAheadAt, whenDone } from './reschedule';
import { isoWeek, sequentialAgenda, type ChainTask } from './sequential';

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

describe('course sequence', () => {
  const udemy = (id: number, index: number, over: Partial<PlannableTask> = {}) =>
    task({ id, title: `udemy ${index}`, sequenceKey: 'udemy', sequenceIndex: index, ...over });

  it('keeps a course in order even when a later module outranks an earlier one', () => {
    const ranked = rankTasks(
      [
        udemy(1, 1, { priority: 3 }),
        udemy(2, 2, { priority: 1 }), // higher priority must not let section 2 jump ahead
        udemy(3, 3, { dueDate: '2026-09-01' }), // nor may being overdue
      ],
      MONDAY,
    );

    expect(ranked.map((t) => t.title)).toEqual(['udemy 1', 'udemy 2', 'udemy 3']);
  });

  it('lets two courses interleave while each keeps its own order', () => {
    const copilot = (id: number, index: number, over: Partial<PlannableTask> = {}) =>
      task({ id, title: `copilot ${index}`, sequenceKey: 'copilot', sequenceIndex: index, ...over });
    const ranked = rankTasks(
      [udemy(1, 1, { sortOrder: 1 }), copilot(2, 2, { sortOrder: 2 }), udemy(3, 2, { sortOrder: 3 }), copilot(4, 1, { sortOrder: 4 })],
      MONDAY,
    );

    // Positions are kept per course (udemy 1st and 3rd, copilot 2nd and 4th); members are re-seated in order.
    expect(ranked.map((t) => t.title)).toEqual(['udemy 1', 'copilot 1', 'udemy 2', 'copilot 2']);
  });

  it('never skips a module that does not fit to fill the gap with a later one', () => {
    // 10:30–11:15 then a meeting: 45 free minutes before it. Module 1 needs 90, module 2 only 30.
    const busy = [meeting(MONDAY, '11:30', '14:00')];
    const plan = planDay(MONDAY, SHAPE, busy, WINDOWS, [udemy(1, 1, { remainingMin: 90 }), udemy(2, 2, { remainingMin: 30 })]);
    const titles = new Map([[1, 'udemy 1'], [2, 'udemy 2']]);

    expect(layout(plan.blocks, titles)).toEqual(['10:30–11:15 udemy 1 45']);
    expect(plan.unplaced.map((u) => u.taskId)).toEqual([1, 2]);
  });

  it('holds a module in another window until the one before it is finished', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [
      udemy(1, 1, { remainingMin: 300 }), // more than a day of Learning
      udemy(2, 2, { remainingMin: 30, windowId: WORK.id }),
      task({ id: 3, remainingMin: 30, windowId: WORK.id }), // independent work is unaffected
    ]);

    const placed = new Set(plan.blocks.flatMap((b) => b.segments.map((s) => s.taskId)));
    expect(placed.has(2)).toBe(false);
    expect(placed.has(3)).toBe(true);
    expect(plan.unplaced.find((u) => u.taskId === 2)?.reason).toMatch(/waits for “udemy 1”/);
  });

  it('plans the calendar day by day, continuing each course where it stopped', () => {
    const course = [udemy(1, 1, { remainingMin: 120 }), udemy(2, 2, { remainingMin: 120 }), udemy(3, 3, { remainingMin: 60 })];
    const result = planRange(
      MONDAY,
      10,
      SHAPE,
      WINDOWS,
      course.map((t) => ({ ...t, availableFrom: null })),
    );

    const order = result.days.flatMap((d) => d.blocks.flatMap((b) => b.segments.map((s) => s.taskId)));
    // Once a module appears, no earlier module may appear after it.
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
    expect(result.days.map((d) => d.date)).toEqual([MONDAY, TUESDAY]);
    expect(result.leftover.size).toBe(0);
    expect(result.finishes.get(3)).toBe(TUESDAY);
  });

  it('skips closed days and stops once everything is placed', () => {
    const FRIDAY = '2026-10-02';
    const result = planRange(FRIDAY, 30, SHAPE, WINDOWS, [{ ...udemy(1, 1, { remainingMin: 300 }), availableFrom: null }]);

    // Friday, then (no Learning at the weekend) Monday.
    expect(result.days.map((d) => d.date)).toEqual([FRIDAY, '2026-10-05']);
    expect(result.to).toBe('2026-10-05');
  });
});

describe('as soon as possible', () => {
  it('puts the earliest deadline first, even for work captured later', () => {
    const ranked = rankTasks(
      [
        task({ id: 1, title: 'other goal, next month', sortOrder: 1, dueDate: '2026-11-29' }),
        task({ id: 2, title: 'genai, this week', sortOrder: 50, dueDate: '2026-10-04' }),
        task({ id: 3, title: 'loose, no deadline', sortOrder: 0 }),
      ],
      MONDAY,
    );

    expect(ranked.map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it('fills every learning day back to back until the goal is done', () => {
    // Four weeks of a course, each week's modules due at that week's end — all schedulable now.
    const weeks = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'];
    const course = weeks.flatMap((due, w) =>
      [50, 40, 60].map((mins, i) =>
        task({ id: w * 3 + i + 1, remainingMin: mins, dueDate: due, sequenceKey: 'udemy', sequenceIndex: w * 3 + i }),
      ),
    );
    const total = course.reduce((n, t) => n + t.remainingMin, 0); // 600

    const result = planRange(MONDAY, 30, SHAPE, WINDOWS, course.map((t) => ({ ...t, availableFrom: null })));
    const perDay = result.days.map((d) => [d.date, d.blocks.reduce((n, b) => n + b.segments.reduce((m, s) => m + s.minutes, 0), 0)]);

    // 150 usable learning minutes a day, Monday to Thursday, no gaps between.
    expect(perDay).toEqual([
      [MONDAY, 150],
      [TUESDAY, 150],
      ['2026-09-30', 150],
      ['2026-10-01', total - 450],
    ]);
  });

  it('fills a block with the start of the next task instead of leaving it idle', () => {
    // 10:30–11:15 free, then a meeting (its 15-minute buffer starts 11:15).
    const busy = [meeting(MONDAY, '11:30', '14:00')];
    const plan = planDay(MONDAY, SHAPE, busy, WINDOWS, [task({ id: 1, remainingMin: 30 }), task({ id: 2, remainingMin: 40 })]);

    expect(layout(plan.blocks, new Map([[1, 'a'], [2, 'b']]))).toEqual(['10:30–11:15 a 30 + b 15']);
    expect(plan.unplaced.find((u) => u.taskId === 2)?.remainingMin).toBe(25);
  });
});

describe('vacation', () => {
  const closeAll = (from: string, to: string, windowIds: (number | null)[] = [LEARNING.id, WORK.id]) =>
    windowIds.map((windowId) => ({ windowId, start: from, end: to }));

  it('places nothing in a window the vacation closes, and says why', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [task({ id: 1 }), task({ id: 2, windowId: WORK.id })], closeAll(local(MONDAY, '00:00'), local(TUESDAY, '00:00')));

    expect(plan.blocks).toEqual([]);
    expect(plan.unplaced.map((u) => u.reason)).toEqual([
      'Learning window is closed — you are on vacation',
      'Work window is closed — you are on vacation',
    ]);
  });

  it('closes only the windows chosen for it', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [task({ id: 1 }), task({ id: 2, windowId: WORK.id })], closeAll(local(MONDAY, '00:00'), local(TUESDAY, '00:00'), [LEARNING.id]));

    expect(plan.blocks.flatMap((b) => b.segments.map((s) => s.taskId))).toEqual([2]);
  });

  it('opens the window again the minute a part-day vacation ends — no buffer, unlike a meeting', () => {
    const plan = planDay(MONDAY, SHAPE, [], WINDOWS, [task({ id: 1, remainingMin: 30 })], closeAll(local(MONDAY, '00:00'), local(MONDAY, '12:30')));

    expect(layout(plan.blocks, new Map([[1, 'a']]))).toEqual(['12:30–13:00 a 30']);
  });

  it('carries the work past the vacation when planning the calendar', () => {
    // Away Tue–Wed: a 300-minute course fills Monday, skips two days, finishes Thursday.
    const result = planRange(MONDAY, 10, SHAPE, WINDOWS, [{ ...task({ id: 1, remainingMin: 300 }), availableFrom: null }], new Map(), closeAll(local(TUESDAY, '00:00'), local('2026-10-01', '00:00')));

    expect(result.days.map((d) => d.date)).toEqual([MONDAY, '2026-10-01']);
  });
});

describe('dated work further out', () => {
  it('counts tasks dated after the range as later, not as work that does not fit', () => {
    const tasks = [
      { id: 1, availableFrom: null }, // schedulable now
      { id: 2, availableFrom: '2026-10-09' }, // last day of a 12-day range from Monday
      { id: 3, availableFrom: '2026-10-10' }, // the day after
      { id: 4, availableFrom: '2027-03-01' },
    ];

    expect(dueAfter(tasks, MONDAY, 12, TZ)).toEqual(new Map([[3, '2026-10-10'], [4, '2027-03-01']]));
  });

  it('plans a dated workout on its day, not before', () => {
    const WEDNESDAY = '2026-09-30';
    const result = planRange(MONDAY, 7, SHAPE, WINDOWS, [{ ...task({ id: 1, remainingMin: 60, dueDate: WEDNESDAY }), availableFrom: WEDNESDAY }]);

    expect(result.days.map((d) => d.date)).toEqual([WEDNESDAY]);
  });
});

describe('reschedule', () => {
  const placed = (date: string, from: string, to: string, segments: [number, number][], over: Partial<{ pinned: boolean; windowId: number | null }> = {}) => ({
    startsAt: local(date, from),
    endsAt: local(date, to),
    windowId: LEARNING.id,
    segments: segments.map(([taskId, minutes]) => ({ taskId, minutes })),
    pinned: false,
    ...over,
  });

  it('finds a block a new meeting now sits on, but not one the meeting only touches', () => {
    const block = placed(MONDAY, '10:30', '11:15', [[1, 45]]);

    expect(conflictOf(block, [meeting(MONDAY, '11:00', '12:00')], [])).toBe('meeting');
    expect(conflictOf(block, [meeting(MONDAY, '11:15', '12:00')], [])).toBeNull();
  });

  it('lets a vacation displace a planned block, but not one placed by hand', () => {
    const closure = { windowId: LEARNING.id, start: local(MONDAY, '00:00'), end: local(TUESDAY, '00:00') };

    expect(conflictOf(placed(MONDAY, '10:30', '11:15', [[1, 45]]), [], [closure])).toBe('vacation');
    expect(conflictOf(placed(MONDAY, '10:30', '11:15', [[1, 45]], { pinned: true }), [], [closure])).toBeNull();
    expect(conflictOf(placed(MONDAY, '14:30', '15:15', [[1, 45]], { windowId: WORK.id }), [], [closure])).toBeNull();
  });

  it('keeps identical blocks and counts the tasks of every block that changes', () => {
    const current = [
      placed(MONDAY, '10:30', '11:15', [[1, 45]]),
      placed(MONDAY, '11:30', '12:00', [[1, 15], [2, 15]]),
      placed(TUESDAY, '10:30', '11:30', [[3, 60]]),
    ];
    // A meeting at 11:30 pushed the second block to 12:30; the Tuesday block did not move.
    const next = [
      placed(MONDAY, '10:30', '11:15', [[1, 45]]),
      placed(MONDAY, '12:30', '13:00', [[1, 15], [2, 15]]),
      placed(TUESDAY, '10:30', '11:30', [[3, 60]]),
    ];

    const diff = diffBlocks(current, next);

    expect(diff.kept).toEqual([current[0], current[2]]);
    expect(diff.removed).toEqual([current[1]]);
    expect(diff.added).toEqual([next[1]]);
    expect([...diff.impacted].sort()).toEqual([1, 2]);
  });

  it('treats the same time with different work as a change', () => {
    const diff = diffBlocks([placed(MONDAY, '10:30', '11:15', [[1, 45]])], [placed(MONDAY, '10:30', '11:15', [[1, 30], [2, 15]])]);

    expect(diff.kept).toEqual([]);
    expect([...diff.impacted].sort()).toEqual([1, 2]);
  });

  it('after a new meeting, moves only the blocks that change', () => {
    const tasks = [task({ id: 1, remainingMin: 45 }), task({ id: 2, remainingMin: 90 })];
    const before = planDay(MONDAY, SHAPE, [], WINDOWS, tasks).blocks;
    const after = planDay(MONDAY, SHAPE, [meeting(MONDAY, '11:30', '12:00')], WINDOWS, tasks).blocks;
    const asPlaced = (blocks: PlannedBlock[]) =>
      blocks.map((b) => ({ startsAt: b.start.toUTC().toISO()!, endsAt: b.end.toUTC().toISO()!, windowId: b.windowId, segments: b.segments }));

    const diff = diffBlocks(asPlaced(before), asPlaced(after));

    const at = (blocks: { startsAt: string }[]) => blocks.map((b) => hhmm(DateTime.fromISO(b.startsAt)));
    expect(at(diff.kept)).toEqual(['10:30', '12:30']); // identical before and after: untouched
    expect(at(diff.removed)).toEqual(['11:30', '13:30']); // under the meeting, and the block its minutes cascade into
    expect([...diff.impacted]).toEqual([2]);
  });
});

describe('work done ahead of plan', () => {
  const block = (doneAt: (string | null)[]) => ({
    startsAt: local(TUESDAY, '10:30'),
    endsAt: local(TUESDAY, '11:15'),
    segments: doneAt.map((d) => ({ doneAt: d })),
  });
  const MONDAY_EVENING = local(MONDAY, '20:07');

  it('recognises a block ticked off before it began', () => {
    expect(doneAheadAt(block([MONDAY_EVENING]), local(MONDAY, '21:00'))).toBe(MONDAY_EVENING);
    expect(doneAheadAt(block([MONDAY_EVENING, null]), local(MONDAY, '21:00'))).not.toBeNull(); // part done ahead
  });

  it('leaves blocks alone that were not ticked, were ticked during them, or have begun', () => {
    expect(doneAheadAt(block([null]), local(MONDAY, '21:00'))).toBeNull();
    expect(doneAheadAt(block([local(TUESDAY, '11:20')]), local(TUESDAY, '12:00'))).toBeNull(); // begun already
    expect(doneAheadAt(block([local(TUESDAY, '10:40')]), local(MONDAY, '21:00'))).toBeNull(); // ticked after it began
  });

  it('puts it back as history, ending when it was ticked off', () => {
    const at = whenDone(block([MONDAY_EVENING]), MONDAY_EVENING, TZ);

    expect(at.date).toBe(MONDAY);
    expect([hhmm(DateTime.fromISO(at.startsAt)), hhmm(DateTime.fromISO(at.endsAt))]).toEqual(['19:25', '20:10']);
  });
});

describe('sequential sessions (a training plan)', () => {
  // Week 1: 28 Sep – 4 Oct (Mon–Sun); week 2 starts 5 Oct. Training on weekdays.
  const W1 = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const W2 = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const W3 = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  const week =(dates: string[], firstId: number, over: Partial<ChainTask> = {}): ChainTask[] =>
    dates.map((d, i) => ({
      id: firstId + i,
      chain: 'fitness',
      week: isoWeek(d),
      estimateMin: 45,
      remainingMin: 45,
      doneOn: null,
      availableFrom: d,
      heldOn: null,
      ...over,
    }));
  const weekday = (d: string) => [1, 2, 3, 4, 5].includes(DateTime.fromISO(d).weekday);
  const open = (closed: string[] = []) => (d: string) => weekday(d) && !closed.includes(d);
  const days = (agenda: ReturnType<typeof sequentialAgenda>, ids: number[]) => ids.map((id) => agenda.days.get(id) ?? null);

  it('plans one session a day, in order, on its own date', () => {
    const agenda = sequentialAgenda(week(W1, 1), W1[0], 30, open());
    expect(days(agenda, [1, 2, 3, 4, 5])).toEqual(W1);
    expect(agenda.redo.size).toBe(0);
  });

  it('does not start a week a vacation would interrupt: it waits for the next week, and the plan moves back', () => {
    const agenda = sequentialAgenda([...week(W1, 1), ...week(W2, 11)], W1[0], 30, open([W1[2]])); // off on Wednesday
    expect(days(agenda, [1, 2, 3, 4, 5])).toEqual(W2);
    expect(days(agenda, [11, 12, 13, 14, 15])).toEqual(W3);
  });

  it('carries on with the week under way when the rest of it still fits', () => {
    const tasks = week(W1, 1).map((t, i) => (i < 2 ? { ...t, remainingMin: 0, doneOn: W1[i] } : t));
    const agenda = sequentialAgenda(tasks, W1[2], 30, open());
    expect(days(agenda, [3, 4, 5])).toEqual(W1.slice(2));
    expect(agenda.redo.size).toBe(0);
  });

  it('starts an interrupted week again from its first session, the ones already done included', () => {
    const tasks = [...week(W1, 1).map((t, i) => (i < 2 ? { ...t, remainingMin: 0, doneOn: W1[i] } : t)), ...week(W2, 11)];
    const agenda = sequentialAgenda(tasks, W1[2], 30, open([W1[2], W1[3], W1[4]])); // away Wed–Fri

    expect([...agenda.redo].sort()).toEqual([1, 2]);
    expect(days(agenda, [1, 2, 3, 4, 5])).toEqual(W2);
    expect(days(agenda, [11, 12, 13, 14, 15])).toEqual(W3);
    expect(agenda.restarts).toEqual([{ chain: 'fitness', week: isoWeek(W1[0]), taskIds: [1, 2, 3, 4, 5], redone: [1, 2], on: W2[0] }]);
  });

  it('starts a week again when its first sessions were done in an earlier week', () => {
    const tasks = week(W1, 1).map((t, i) => (i < 2 ? { ...t, remainingMin: 0, doneOn: W1[i] } : t));
    const agenda = sequentialAgenda(tasks, W2[0], 30, open());
    expect([...agenda.redo].sort()).toEqual([1, 2]);
    expect(days(agenda, [1, 2, 3, 4, 5])).toEqual(W2);
  });

  it('back in the middle of a week, the next week waits for Monday', () => {
    const agenda = sequentialAgenda(week(W2, 11), W2[2], 30, open()); // Wednesday, nothing done
    expect(days(agenda, [11, 12, 13, 14, 15])).toEqual(W3);
  });

  it('keeps a lone session (no week) one a day, after the one before', () => {
    const lone = (id: number): ChainTask => ({ id, chain: 'c', week: null, estimateMin: 30, remainingMin: 30, doneOn: null, availableFrom: null, heldOn: null });
    const agenda = sequentialAgenda([lone(1), lone(2), lone(3)], W1[0], 30, open([W1[1]]));
    expect(days(agenda, [1, 2, 3])).toEqual([W1[0], W1[2], W1[3]]);
  });

  it('never plans two sessions on one day, even when both would fit', () => {
    const tasks = [task({ id: 1, title: 'A', remainingMin: 45, windowId: LEARNING.id }), task({ id: 2, title: 'pás', remainingMin: 25, windowId: LEARNING.id })];
    const range = planRange(MONDAY, 7, SHAPE, WINDOWS, tasks.map((t) => ({ ...t, availableFrom: null })), new Map(), [], {
      ids: new Set([1, 2]),
      days: new Map([[1, MONDAY], [2, TUESDAY]]),
    });
    expect(range.days.map((d) => [d.date, d.blocks.flatMap((b) => b.segments.map((s) => s.taskId))])).toEqual([
      [MONDAY, [1]],
      [TUESDAY, [2]],
    ]);
  });
});

describe('sessions are never split', () => {
  const TRAINING: WindowSpec = { id: 3, name: 'Training', start: '08:30', end: '10:00', weekdays: [1, 2, 3, 4, 5] };

  it('gives a 55-minute training one block, not 40 + 15 on the same morning', () => {
    const split = planDay(MONDAY, SHAPE, [], [TRAINING], [task({ id: 1, title: 'Tréning A', remainingMin: 55, windowId: 3 })]);
    const whole = planDay(MONDAY, SHAPE, [], [TRAINING], [task({ id: 1, title: 'Tréning A', remainingMin: 55, windowId: 3, whole: true })]);
    const titles = new Map([[1, 'A']]);

    expect(layout(split.blocks, titles)).toEqual(['08:30–09:10 A 40', '09:25–09:55 A 15']); // what happened from 12 Oct
    expect(layout(whole.blocks, titles)).toEqual(['08:30–09:25 A 55']);
  });

  it('waits for a slot that holds the whole session', () => {
    const plan = planDay(MONDAY, SHAPE, [meeting(MONDAY, '09:15', '09:30')], [TRAINING], [task({ id: 1, remainingMin: 55, windowId: 3, whole: true })]);
    expect(plan.blocks).toEqual([]);
  });
});
