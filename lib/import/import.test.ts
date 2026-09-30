import { readFileSync } from 'node:fs';
import path from 'node:path';
import { asc } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { horizons, tasks, timeWindows } from '@timeblock/core/db/schema';
import { testDb } from '@/lib/db/testing';
import { breadcrumb, computeProgress, effectiveWindowId, indexHorizons } from '@timeblock/core/hierarchy';
import { applyImport } from './apply';
import { parseImport, parseLocalDate, parseWeek, planImport } from './tasks-csv';

const TEMPLATE = readFileSync(path.join(process.cwd(), 'public/templates/timeblock-tasks-template.csv'), 'utf8');
const WINDOWS = [
  { id: 1, name: 'Learning' },
  { id: 2, name: 'Work' },
];

async function importInto(text: string, env = testDb()) {
  const windows = await env.db.select().from(timeWindows);
  const parsed = parseImport(text, windows);
  const plan = planImport(
    parsed.rows,
    await env.db.select().from(horizons),
    await env.db.select().from(tasks),
    1,
  );
  if (parsed.errors.length === 0) await applyImport(env.db, env.sqlite, plan);
  return { ...env, parsed, plan };
}

describe('value readers', () => {
  it('reads ISO and Slovak dates', () => {
    expect(parseLocalDate('2026-10-05')).toBe('2026-10-05');
    expect(parseLocalDate('5.10.2026')).toBe('2026-10-05');
    expect(parseLocalDate('31.2.2026')).toBeNull();
  });

  it('reads ISO weeks, week-of-month and dates as the same Monday', () => {
    expect(parseWeek('2026-W40')?.toISODate()).toBe('2026-09-28');
    expect(parseWeek('2026-10 week 1')?.toISODate()).toBe('2026-09-28');
    expect(parseWeek('2026-10 week 5')?.toISODate()).toBe('2026-10-26');
    expect(parseWeek('2026-10 week 6')).toBeNull();
    expect(parseWeek('1.10.2026')?.toISODate()).toBe('2026-09-28');
  });
});

describe('parsing the template', () => {
  it('reads every row of the shipped template without errors', () => {
    const parsed = parseImport(TEMPLATE, WINDOWS);

    expect(parsed.errors).toEqual([]);
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.rows).toHaveLength(17);
  });

  it('builds a full chain for each module row', () => {
    const operate = parseImport(TEMPLATE, WINDOWS).rows.find((r) => r.task?.title === 'Operate IT Services')!;

    expect(operate.chain.map((h) => [h.level, h.title, h.periodStart])).toEqual([
      ['year', 'CIS-ITSM Certification', '2026-01-01'],
      ['month', 'ServiceNow ITSM Fundamentals', '2026-10-01'],
      ['week', 'Service Portfolio Management', '2026-09-28'],
    ]);
    expect(operate.task).toMatchObject({ estimateMin: 56, priority: 3, energy: 'deep', status: 'backlog' });
  });
});

describe('validation', () => {
  const header = 'year_goal,month_outcome,month,week_priority,week,task,duration,priority,window\n';

  it('rejects broken rows with their line numbers, and a week without its month', () => {
    const parsed = parseImport(
      header +
        'Goal,Outcome,2026-10,,,Fine,30,,\n' +
        'Goal,Outcome,2026-10,,,No duration,,,\n' +
        ',,,Loose week,2026-W41,Orphan,30,,\n' +
        'Goal,Outcome,2026-10,,,Bad priority,30,9,\n' +
        'Goal,Outcome,2026-10,,,Unknown window,30,,Gym\n' +
        'Goal,Outcome,2026-10,Wrong month,2026-W50,Misplaced,30,,\n',
      WINDOWS,
    );

    expect(parsed.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(parsed.errors.map((e) => e.message).join(' | ')).toMatch(/needs a duration/);
    expect(parsed.errors.map((e) => e.message).join(' | ')).toMatch(/must name the month outcome/);
    expect(parsed.errors.map((e) => e.message).join(' | ')).toMatch(/Known: Learning, Work/);
    expect(parsed.errors.map((e) => e.message).join(' | ')).toMatch(/does not fall in October 2026/);
    expect(parsed.rows).toHaveLength(1);
  });

  it('warns rather than fails for work that is not in a week yet', () => {
    const parsed = parseImport(header + 'Goal,Outcome,2026-10,,,Month task,30,,\n,,,,,Loose task,30,,\n', WINDOWS);

    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings.map((w) => w.message)).toEqual([
      expect.stringMatching(/month backlog/),
      expect.stringMatching(/serves no goal/),
    ]);
  });

  it('accepts a semicolon file as Excel saves it in Slovakia', () => {
    const parsed = parseImport('task;duration\nOperate IT Services;1 hour 25 minutes\n', WINDOWS);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].task?.estimateMin).toBe(85);
  });
});

describe('importing', () => {
  it('builds the connected plan from the template', async () => {
    const { db, plan } = await importInto(TEMPLATE);

    expect(plan.summary).toEqual({
      goals: { created: 1, updated: 0 },
      outcomes: { created: 3, updated: 0 },
      weeks: { created: 4, updated: 0 },
      tasks: { created: 9, updated: 0 },
    });

    const allHorizons = await db.select().from(horizons);
    const allTasks = await db.select().from(tasks).orderBy(asc(tasks.sortOrder));
    const byId = indexHorizons(allHorizons);
    const learning = (await db.select().from(timeWindows)).find((w) => w.name === 'Learning')!;

    const operate = allTasks.find((t) => t.title === 'Operate IT Services')!;
    expect(breadcrumb(operate.horizonId, byId)).toEqual([
      'CIS-ITSM Certification',
      'ServiceNow ITSM Fundamentals',
      'Oct · week 1 · Service Portfolio Management',
    ]);
    // "Learning" was set once, on the yearly goal, and reaches every module.
    expect(effectiveWindowId(operate, byId, null)).toBe(learning.id);
    // Course order survives as task order.
    expect(allTasks.slice(0, 3).map((t) => t.title)).toEqual([
      'Ebook assistance',
      'Accessibility information',
      'Welcome to IT Service Management Fundamentals',
    ]);

    const year = allHorizons.find((h) => h.level === 'year')!;
    const progress = computeProgress({ horizons: allHorizons, tasks: allTasks, ticked: new Map() });
    expect(progress.get(year.id)).toMatchObject({ ratio: 0, totalTasks: 9, totalMin: 264 + 30 });
  });

  it('updates instead of duplicating on re-import, and never touches status', async () => {
    const first = await importInto(TEMPLATE);
    const operate = (await first.db.select().from(tasks)).find((t) => t.title === 'Operate IT Services')!;
    first.sqlite.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(operate.id);

    const corrected = TEMPLATE.replace('Operate IT Services,56 minutes', 'Operate IT Services,1:00');
    const second = await importInto(corrected, first);

    expect(second.plan.summary.tasks).toEqual({ created: 0, updated: 9 });
    expect(second.plan.summary.weeks).toEqual({ created: 0, updated: 4 });

    const after = (await second.db.select().from(tasks)).find((t) => t.id === operate.id)!;
    expect(await second.db.select().from(tasks)).toHaveLength(9);
    expect(after).toMatchObject({ estimateMin: 60, status: 'done' });
  });

  it('reads the sequential column, and a file without it leaves the flag alone', async () => {
    const header = 'year_goal,month_outcome,month,task,duration,due_date,sequential\n';
    const rows = (flag: string) =>
      `My Fitness,Fáza 1,2026-10,Tréning A · týž. 1,45,2026-09-28,${flag}\nMy Fitness,Fáza 1,2026-10,Týždenná kontrola · týž. 1,10,2026-09-29,\n`;
    const first = await importInto(header + rows('áno'));
    const flags = async (env: typeof first) => Object.fromEntries((await env.db.select().from(tasks)).map((t) => [t.title, t.sequential]));
    expect(first.parsed.errors).toEqual([]);
    expect(await flags(first)).toEqual({ 'Tréning A · týž. 1': true, 'Týždenná kontrola · týž. 1': false });

    const withoutColumn = header.replace(',sequential', '') + rows('').replace(/,\n/g, '\n');
    const second = await importInto(withoutColumn, first);
    expect(second.parsed.errors).toEqual([]);
    expect(await flags(second)).toEqual({ 'Tréning A · týž. 1': true, 'Týždenná kontrola · týž. 1': false });

    const bad = await importInto(header + rows('maybe'));
    expect(bad.parsed.errors[0].message).toContain('Sequential must be yes or no');
  });

  it('writes nothing when any row has an error', async () => {
    const broken = `${TEMPLATE}CIS-ITSM Certification,2026,,,,,Broken task,forever,,,,,,\n`;
    const { db, parsed } = await importInto(broken);

    expect(parsed.errors).toHaveLength(1);
    expect(await db.select().from(tasks)).toHaveLength(0);
    expect(await db.select().from(horizons)).toHaveLength(0);
  });
});

describe('yearly goals over several years', () => {
  const HEADER = 'year_goal,year,month_outcome,month,task,duration,due_date\n';
  const OLD = `${HEADER}My Fitness,2026,,,,,\nMy Fitness,2027,,,,,\nMy Fitness,,Fáza 1,2026-10,Tréning A · týž. 1,45,2026-09-28\nMy Fitness,,Fáza 2,2027-01,Tréning A · týž. 15,55,2027-01-04\n`;

  it('reads 2026-2027 as one goal from 1 Jan 2026 to 31 Dec 2027, holding both years', async () => {
    const { db, parsed } = await importInto(OLD.replace('My Fitness,2026,', 'My Fitness,2026-2027,'));
    expect(parsed.errors).toEqual([]);
    const goals = (await db.select().from(horizons)).filter((h) => h.level === 'year');
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ periodStart: '2026-01-01', periodEnd: '2027-12-31' });
    const months = (await db.select().from(horizons)).filter((h) => h.level === 'month');
    expect(months.every((m) => m.parentId === goals[0].id)).toBe(true);
  });

  it('joins a plan imported year by year into one goal when imported again as 2026-2027', async () => {
    const first = await importInto(OLD);
    expect((await first.db.select().from(horizons)).filter((h) => h.level === 'year')).toHaveLength(2);

    const second = await importInto(OLD.replace('My Fitness,2026,', 'My Fitness,2026-2027,'), first);
    expect(second.parsed.errors).toEqual([]);
    const all = await second.db.select().from(horizons);
    const goals = all.filter((h) => h.level === 'year');
    expect(goals).toHaveLength(1);
    expect(goals[0].periodEnd).toBe('2027-12-31');
    expect(all.filter((h) => h.level === 'month').every((m) => m.parentId === goals[0].id)).toBe(true);
    expect(await second.db.select().from(tasks)).toHaveLength(2); // matched, not duplicated
  });

  it('rejects a year it cannot read', async () => {
    const { parsed } = await importInto(`${HEADER}My Fitness,2027-2026,,,,,\n`);
    expect(parsed.errors[0].message).toContain('2026-2027 for a goal over several years');
  });
});
