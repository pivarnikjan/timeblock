import { describe, expect, it } from 'vitest';
import { parseDuration } from './duration';
import { detectDelimiter, parseCsv, readTable } from './parse';

describe('CSV parsing', () => {
  it('handles quotes, doubled quotes and delimiters inside quotes', () => {
    const rows = parseCsv('task,notes\n"Ebook, part 1","He said ""go"""\n');

    expect(rows.map((r) => r.values)).toEqual([
      ['task', 'notes'],
      ['Ebook, part 1', 'He said "go"'],
    ]);
  });

  it('keeps line breaks inside quoted fields and reports the starting line', () => {
    const rows = parseCsv('task,notes\r\nA,"line one\r\nline two"\r\nB,x\r\n');

    expect(rows[1]).toEqual({ line: 2, values: ['A', 'line one\r\nline two'] });
    expect(rows[2]).toEqual({ line: 4, values: ['B', 'x'] });
  });

  it('detects semicolons from Slovak Excel and strips the BOM', () => {
    const text = '﻿task;duration\nOperate IT Services;56\n';

    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text).map((r) => r.values)).toEqual([
      ['task', 'duration'],
      ['Operate IT Services', '56'],
    ]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n').map((r) => r.values)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads cells by header, ignoring case and spacing', () => {
    const table = readTable('Task, Due Date \nWrite, 2026-10-05\n');

    expect(table.rows[0].get('task')).toBe('Write');
    expect(table.rows[0].get('due_date')).toBe('2026-10-05');
    expect(table.rows[0].get('missing')).toBe('');
  });
});

describe('durations', () => {
  it.each([
    ['5', 5],
    ['85m', 85],
    ['56 minutes', 56],
    ['5 min', 5],
    ['1 hour 25 minutes', 85],
    ['1h 25m', 85],
    ['1h25', 85],
    ['1:25', 85],
    ['1.5h', 90],
    ['2 hours', 120],
    ['1 hod 25 min', 85],
  ])('reads %s as %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it.each(['', 'soon', '25 parsecs', '0', 'about an hour'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});
