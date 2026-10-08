import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Env } from '@timeblock/core/env';
import { FakeCalendar } from '@timeblock/core/google/fake-calendar';
import { getSettings, updateSettings } from '@timeblock/core/store/settings';
import { listAllTasks } from '@timeblock/core/store/tasks';
import { refusal } from '@/lib/api/guard';
import { testDb } from '@/lib/db/testing';
import { CommandError } from './command';
import { handleMcp, mcpTools } from './mcp';
import { openApiDocument } from './openapi';
import { commands, failure, runCommand } from './registry';
import { validate } from './schema';

/** The commands the way the routes run them: over a real (in-memory) database, with Google faked. */
function setup(status: 'connected' | 'not-connected' = 'connected') {
  const { db } = testDb();
  const google = new FakeCalendar([
    { id: 'primary', summary: 'Me', primary: true, selected: true, accessRole: 'owner' },
    { id: 'holidays', summary: 'Holidays', selected: true, accessRole: 'reader' },
  ]);
  const env: Env = { db, google: { status: () => status, calendar: () => google } };
  const events = () => [...google.events.get('primary')!.values()];
  return { db, google, env, events };
}

const refused = async (run: Promise<unknown>): Promise<CommandError> => {
  const error = await run.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(CommandError);
  return error as CommandError;
};

/** A timed event put straight into Google, in the Settings timezone. */
async function meeting(env: Env, google: FakeCalendar, title: string, date: string, start: string, end: string, extra: object = {}) {
  const { timezone: zone } = await getSettings(env.db);
  const at = (time: string) => ({ dateTime: DateTime.fromISO(`${date}T${time}`, { zone }).toISO()!, timeZone: zone });
  return google.addEvent('primary', { summary: title, start: at(start), end: at(end), ...extra });
}

describe('input schemas', () => {
  it('names each problem and where it is', () => {
    const schema = commands.find((c) => c.name === 'preview_changes')!.input;
    expect(validate(schema, { changes: [{ kind: 'create_event', title: 'Lunch', date: '2026-10-08', startTime: '12:00', endTime: '13:00' }] })).toEqual([]);
    expect(validate(schema, {})).toEqual(['changes is required.']);
    expect(validate(schema, { changes: [] })[0]).toMatch(/at least 1/);
    expect(validate(schema, { changes: [{ kind: 'paint_event' }] })[0]).toMatch(/changes\[0\]: "kind" must be one of "create_event"/);
    const problems = validate(schema, { changes: [{ kind: 'create_event', title: '', date: '8.10.2026', colour: 'red' }] });
    expect(problems).toEqual([
      'changes[0].title must not be empty.',
      'changes[0].date is not in the expected form (the day it starts, YYYY-MM-DD).',
      expect.stringMatching(/^changes\[0\]\.colour is not a known field/),
    ]);
    expect(validate(schema, { changes: [{ kind: 'create_task', title: 'Read', priority: 9, estimateMin: '1h' }] })).toEqual([
      'changes[0].priority must be at most 4.',
      'changes[0].estimateMin must be an integer.',
    ]);
  });

  it('refuses input that does not fit before a command runs', async () => {
    const { env } = setup();
    const error = await refused(runCommand(env, 'list_events', { from: 'tomorrow' }));
    expect(error.status).toBe(400);
    expect(error.problems[0]).toMatch(/^from is not in the expected form/);
    expect((await refused(runCommand(env, 'drop_database', {}))).status).toBe(404);
  });
});

describe('preview, then apply', () => {
  it('writes nothing on preview, and everything on apply — once', async () => {
    const { env, db, events } = setup();
    const preview = await runCommand(env, 'preview_changes', {
      changes: [
        { kind: 'create_event', title: 'Lunch with Peter', date: '2026-10-08', startTime: '12:00', endTime: '13:00', location: 'Soho' },
        { kind: 'create_event', title: 'Conference', date: '2026-10-12', endDate: '2026-10-14' },
        { kind: 'create_task', title: 'Book the exam', estimateMin: 85, priority: 1, dueDate: '2026-10-30', status: 'active' },
      ],
    });
    expect((preview.changes as { summary: string }[]).map((c) => c.summary)).toEqual([
      'Create event "Lunch with Peter" · Thu 8 Oct 2026 12:00–13:00 · calendar Me',
      'Create event "Conference" · Mon 12 Oct 2026 – Wed 14 Oct 2026 (all day) · calendar Me',
      'Create task "Book the exam" · 1h 25m · priority 1 · deep · active · due 2026-10-30',
    ]);
    expect(events()).toHaveLength(0);
    expect(await listAllTasks(db)).toHaveLength(0);

    const applied = await runCommand(env, 'apply_changes', { changeSetId: preview.changeSetId });
    expect(applied).toMatchObject({ applied: 3, failed: 0 });
    const { timezone: zone } = await getSettings(db);
    const [lunch, conference] = events();
    expect(lunch).toMatchObject({ summary: 'Lunch with Peter', location: 'Soho' });
    expect(DateTime.fromISO(lunch.start!.dateTime!).setZone(zone).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-10-08 12:00');
    // Google's all-day end is the day after the last.
    expect(conference).toMatchObject({ start: { date: '2026-10-12' }, end: { date: '2026-10-15' } });
    expect(await listAllTasks(db)).toMatchObject([{ title: 'Book the exam', estimateMin: 85, priority: 1, dueDate: '2026-10-30', status: 'active' }]);

    // Spent: a second apply repeats nothing.
    expect((await refused(runCommand(env, 'apply_changes', { changeSetId: preview.changeSetId }))).status).toBe(404);
    expect(events()).toHaveLength(2);
  });

  it('prepares nothing when one change has a problem, and says which', async () => {
    const { env, db, events } = setup();
    await updateSettings(db, { targetCalendarId: 'timeblock' });
    const error = await refused(
      runCommand(env, 'preview_changes', {
        changes: [
          { kind: 'create_event', title: 'Fine', date: '2026-10-08', startTime: '09:00', endTime: '10:00' },
          { kind: 'create_event', title: 'Read-only', date: '2026-10-08', calendarId: 'holidays' },
          { kind: 'create_event', title: 'Half a time', date: '2026-10-08', startTime: '09:00' },
          { kind: 'create_event', title: 'Not a day', date: '2026-02-30' },
          { kind: 'delete_event', calendarId: 'primary', eventId: 'gone' },
          { kind: 'delete_event', calendarId: 'timeblock', eventId: 'block-event' },
          { kind: 'update_task', taskId: 42, title: 'Nobody' },
          { kind: 'create_task', title: 'Orphan', goalId: 7 },
        ],
      }),
    );
    expect(error.status).toBe(422);
    expect(error.message).toBe('Nothing was prepared: 7 of 8 changes have a problem.');
    expect(error.problems.map((p) => p.replace(/^(changes\[\d\]) \(\w+\): /, '$1 '))).toEqual([
      'changes[1] The calendar "Holidays" is read-only.',
      'changes[2] Give both a start and an end time — or neither, for an all-day event.',
      'changes[3] Choose a day (YYYY-MM-DD).',
      'changes[4] No such event — it may have been deleted. List the events again.',
      'changes[5] TimeBlock’s own blocks and vacations are changed in TimeBlock, not as events.',
      'changes[6] There is no task 42 — list the tasks again.',
      'changes[7] There is no goal 7 — see list_goals.',
    ]);
    expect(events()).toHaveLength(0);
  });

  it('moves, renames and deletes events; a new start keeps the length', async () => {
    const { env, google, events } = setup();
    const review = await meeting(env, google, 'Review', '2026-10-09', '14:00', '14:45');
    const dentist = await meeting(env, google, 'Dentist', '2026-10-09', '08:00', '09:00');

    const preview = await runCommand(env, 'preview_changes', {
      changes: [
        { kind: 'update_event', calendarId: 'primary', eventId: review, date: '2026-10-12', startTime: '15:00', title: 'Weekly review' },
        { kind: 'delete_event', calendarId: 'primary', eventId: dentist },
      ],
    });
    expect((preview.changes as { summary: string }[]).map((c) => c.summary)).toEqual([
      'Change event "Review" · Fri 9 Oct 2026 14:00–14:45 → Mon 12 Oct 2026 15:00–15:45 · renamed "Weekly review" · calendar Me',
      'Delete event "Dentist" · Fri 9 Oct 2026 08:00–09:00 · calendar Me',
    ]);
    expect(events().map((e) => e.summary)).toEqual(['Review', 'Dentist']);

    expect(await runCommand(env, 'apply_changes', { changeSetId: preview.changeSetId })).toMatchObject({ applied: 2, failed: 0 });
    const listed = await runCommand(env, 'list_events', { from: '2026-10-09', to: '2026-10-12' });
    expect(listed.events).toMatchObject([{ eventId: review, title: 'Weekly review', weekday: 'Mon', start: '2026-10-12T15:00', end: '2026-10-12T15:45', editable: true }]);
  });

  it('applies nothing when what it changes was changed after the preview', async () => {
    const { env, google, events } = setup();
    const standup = await meeting(env, google, 'Stand-up', '2026-10-09', '09:00', '09:15');
    const preview = await runCommand(env, 'preview_changes', {
      changes: [
        { kind: 'create_event', title: 'New', date: '2026-10-09', startTime: '10:00', endTime: '11:00' },
        { kind: 'update_event', calendarId: 'primary', eventId: standup, startTime: '09:30' },
      ],
    });
    // Someone moves it in Google meanwhile.
    await meeting(env, google, 'Stand-up', '2026-10-09', '11:00', '11:15', { id: standup });

    const error = await refused(runCommand(env, 'apply_changes', { changeSetId: preview.changeSetId }));
    expect(error.status).toBe(409);
    expect(error.problems).toEqual(['changes[1] (update_event): what it changes was itself changed after the preview.']);
    expect(events().map((e) => e.summary)).toEqual(['Stand-up']);
  });

  it('changes and deletes tasks, clearing a field with an empty value', async () => {
    const { env, db } = setup();
    const made = await runCommand(env, 'preview_changes', {
      changes: [
        { kind: 'create_task', title: 'Write the report', dueDate: '2026-10-20' },
        { kind: 'create_task', title: 'Old idea' },
      ],
    });
    await runCommand(env, 'apply_changes', { changeSetId: made.changeSetId });
    const { tasks } = (await runCommand(env, 'list_tasks', {})) as { tasks: { taskId: number; title: string }[] };
    const [report, idea] = tasks;

    const preview = await runCommand(env, 'preview_changes', {
      changes: [
        { kind: 'update_task', taskId: report.taskId, estimateMin: 120, dueDate: '', status: 'done' },
        { kind: 'delete_task', taskId: idea.taskId },
      ],
    });
    expect((preview.changes as { summary: string }[])[0].summary).toBe(
      'Change task "Write the report" · estimate 1h → 2h · dueDate 2026-10-20 → — · status backlog → done',
    );
    await runCommand(env, 'apply_changes', { changeSetId: preview.changeSetId });
    const left = await listAllTasks(db);
    expect(left).toMatchObject([{ title: 'Write the report', estimateMin: 120, dueDate: null, status: 'done' }]);
    expect(left[0].completedAt).not.toBeNull();
  });

  it('says so when Google is not connected, and still works on tasks', async () => {
    const { env } = setup('not-connected');
    const error = await refused(runCommand(env, 'preview_changes', { changes: [{ kind: 'create_event', title: 'Lunch', date: '2026-10-08' }] }));
    expect(error.status).toBe(409);
    expect(error.message).toMatch(/not connected/);
    expect((await refused(runCommand(env, 'list_events', { from: '2026-10-08' }))).status).toBe(409);
    expect(await runCommand(env, 'get_context', {})).toMatchObject({ google: { status: 'not-connected' }, calendars: [] });
    expect(await runCommand(env, 'preview_changes', { changes: [{ kind: 'create_task', title: 'Offline' }] })).toMatchObject({ count: 1 });
  });
});

describe('reading', () => {
  it('gives the context a model needs: today, the timezone, the calendars it may write to', async () => {
    const { env, db } = setup();
    const { timezone } = await getSettings(db);
    const context = await runCommand(env, 'get_context', {});
    expect(context).toMatchObject({ timezone, today: DateTime.now().setZone(timezone).toISODate() });
    expect(context.calendars).toEqual([
      { id: 'primary', name: 'Me', primary: true, writable: true, timeblockOwn: false },
      { id: 'holidays', name: 'Holidays', primary: false, writable: false, timeblockOwn: false },
    ]);
    expect((context.timeWindows as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('the HTTP API’s description and the MCP adapter are made from the same commands', () => {
  it('describes every command in OpenAPI', () => {
    const doc = openApiDocument(commands, 'http://localhost:4321') as { paths: Record<string, { post: { operationId: string; requestBody: unknown } }> };
    expect(Object.keys(doc.paths)).toEqual(commands.map((c) => `/api/v1/${c.name}`));
    expect(doc.paths['/api/v1/apply_changes'].post).toMatchObject({ operationId: 'apply_changes', 'x-read-only': false, 'x-destructive': true });
  });

  it('offers every command as an MCP tool, marked read-only or destructive', () => {
    expect(mcpTools().map((t) => t.name)).toEqual(commands.map((c) => c.name));
    expect(mcpTools().find((t) => t.name === 'list_tasks')!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(mcpTools().find((t) => t.name === 'apply_changes')!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('speaks MCP: initialize, list tools, call one, report a failed call as a result', async () => {
    const { env, db } = setup();
    const call = async (method: string, params?: unknown, id: number | undefined = 1) => (await handleMcp(env, { jsonrpc: '2.0', id, method, params })) as { reply: { result?: any; error?: any } | null; wrote: boolean }; // eslint-disable-line @typescript-eslint/no-explicit-any

    const hello = await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    expect(hello.reply!.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'timeblock' } });
    expect((await call('initialize', { protocolVersion: '1999-01-01' })).reply!.result.protocolVersion).toBe('2025-06-18');
    expect(await handleMcp(env, { jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual({ reply: null, wrote: false });
    expect((await call('tools/list')).reply!.result.tools).toHaveLength(commands.length);
    expect((await call('resources/list')).reply!.error.code).toBe(-32601);
    expect((await call('tools/call', { name: 'nope', arguments: {} })).reply!.error.code).toBe(-32602);

    const preview = await call('tools/call', { name: 'preview_changes', arguments: { changes: [{ kind: 'create_task', title: 'From a prompt' }] } });
    expect(preview.wrote).toBe(false);
    expect(preview.reply!.result.isError).toBe(false);
    const { changeSetId } = preview.reply!.result.structuredContent;
    expect(JSON.parse(preview.reply!.result.content[0].text).changeSetId).toBe(changeSetId);
    expect(await listAllTasks(db)).toHaveLength(0);

    const applied = await call('tools/call', { name: 'apply_changes', arguments: { changeSetId } });
    expect(applied.wrote).toBe(true);
    expect(applied.reply!.result.structuredContent).toMatchObject({ applied: 1 });
    expect(await listAllTasks(db)).toMatchObject([{ title: 'From a prompt' }]);

    const bad = await call('tools/call', { name: 'preview_changes', arguments: { changes: [{ kind: 'delete_task', taskId: 1 }] } });
    expect(bad.reply!.result).toMatchObject({ isError: true });
    expect(bad.reply!.result.content[0].text).toMatch(/Nothing was prepared[\s\S]*There is no task 1/);
  });

  it('keeps the stdio bridge a pipe: no database, no core, no dependencies', () => {
    const bridge = readFileSync(fileURLToPath(new URL('../../scripts/timeblock-mcp.mjs', import.meta.url)), 'utf8');
    const imports = [...bridge.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);
    expect(imports).toEqual(['node:readline']);
  });
});

describe('who may call the API', () => {
  const token = 'tb_test-token-for-the-guard';
  const headers = (init: Record<string, string>) => new Headers({ host: 'localhost:4321', authorization: `Bearer ${token}`, ...init });

  it('lets a local program with the token through', () => {
    expect(refusal(headers({}), token)).toBeNull();
    expect(refusal(headers({ host: '127.0.0.1:4321' }), token)).toBeNull();
    expect(refusal(headers({ host: '[::1]:4321' }), token)).toBeNull();
    expect(refusal(headers({ origin: 'http://localhost:4321' }), token)).toBeNull();
  });

  it('refuses a missing or wrong token', () => {
    expect(refusal(new Headers({ host: 'localhost:4321' }), token)?.status).toBe(401);
    expect(refusal(headers({ authorization: 'Bearer tb_wrong' }), token)?.status).toBe(401);
    expect(refusal(headers({ authorization: token }), token)?.status).toBe(401);
  });

  it('refuses other sites’ pages and names pointed at this computer, token or not', () => {
    expect(refusal(headers({ origin: 'https://evil.example' }), token)?.status).toBe(403);
    expect(refusal(headers({ origin: 'null' }), token)?.status).toBe(403);
    expect(refusal(headers({ host: 'evil.example:4321' }), token)?.status).toBe(403);
    expect(refusal(headers({ host: '192.168.1.20:4321' }), token)?.status).toBe(403);
    expect(refusal(headers({ host: 'localhost.evil.example' }), token)?.status).toBe(403);
  });

  it('reports failures with a status a client can act on', () => {
    expect(failure(new CommandError(409, 'Stale.', ['a']))).toEqual({ status: 409, body: { error: 'Stale.', problems: ['a'] } });
    expect(failure(new Error('boom'))).toEqual({ status: 500, body: { error: 'boom' } });
  });
});
