import { describe, expect, it } from 'vitest';
import { windowBands, windowLegend } from './bands';
import { calendarColor, energyColor, eventColor, parseHexColor, textOn, WINDOW_PALETTE, windowColor } from './colors';
import { eventKey, isHidden, parseFilters } from './filters';
import { layoutColumns, layoutLanes } from './layout';
import { calendarRange, parseView, visibleHours } from './views';

const TZ = 'Europe/Vienna';

describe('views', () => {
  it('covers one day, three days, the work week and the full week', () => {
    // Wed 30 Sep 2026
    expect(calendarRange('day', '2026-09-30', TZ).days).toEqual(['2026-09-30']);
    expect(calendarRange('3days', '2026-09-30', TZ).days).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
    expect(calendarRange('workweek', '2026-09-30', TZ).days).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(calendarRange('week', '2026-09-30', TZ).days.at(-1)).toBe('2026-10-04');
  });

  it('shows whole Monday–Sunday weeks for a month', () => {
    const october = calendarRange('month', '2026-10-15', TZ);

    expect(october.days[0]).toBe('2026-09-28');
    expect(october.days.at(-1)).toBe('2026-11-01');
    expect(october.days.length % 7).toBe(0);
    expect(october.title).toBe('October 2026');
    expect(october.month).toBe('2026-10');
  });

  it('moves by the size of the view', () => {
    expect(calendarRange('day', '2026-09-30', TZ).next).toBe('2026-10-01');
    expect(calendarRange('3days', '2026-09-30', TZ).next).toBe('2026-10-03');
    expect(calendarRange('week', '2026-09-30', TZ).prev).toBe('2026-09-23');
    expect(calendarRange('month', '2026-01-31', TZ).next).toBe('2026-02-01');
  });

  it('titles ranges like Google does', () => {
    expect(calendarRange('day', '2026-09-30', TZ).title).toBe('Wednesday 30 September 2026');
    expect(calendarRange('week', '2026-09-30', TZ).title).toBe('28 Sep – 4 Oct 2026');
    expect(calendarRange('3days', '2026-10-05', TZ).title).toBe('5 – 7 Oct 2026');
  });

  it('reads visible hours, treating an end of 00:00 as midnight', () => {
    expect(visibleHours('05:00', '00:00')).toEqual({ startMin: 300, endMin: 1440 });
    expect(visibleHours('07:30', '19:00')).toEqual({ startMin: 450, endMin: 1140 });
    expect(visibleHours('garbage', 'x')).toEqual({ startMin: 300, endMin: 1440 });
  });

  it('accepts only known views', () => {
    expect(parseView('workweek')).toBe('workweek');
    expect(parseView('year')).toBeNull();
  });
});

describe('Google colours', () => {
  it('uses the event colour when set, else the calendar colour — mapped to the modern palette', () => {
    expect(eventColor('11', '#9fe1e7')).toBe('#D50000'); // Tomato event on a Peacock calendar
    expect(eventColor(null, '#9fe1e7')).toBe('#039BE5'); // legacy Peacock → modern Peacock
    expect(calendarColor('#123456')).toBe('#123456'); // custom colours pass through
  });

  it('gives TimeBlock blocks the colours they get once committed', () => {
    expect(energyColor('deep')).toBe('#3F51B5'); // Blueberry
    expect(energyColor('admin')).toBe('#F6BF26'); // Banana
  });

  it('picks readable text', () => {
    expect(textOn('#3F51B5')).toBe('#ffffff');
    expect(textOn('#F6BF26')).toBe('#1f1f1f');
  });
});

describe('overlap columns', () => {
  it('puts overlapping events side by side and leaves separate ones full width', () => {
    const laid = layoutColumns([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
      { id: 'c', start: 60, end: 120 }, // overlaps b only, reuses a's column
      { id: 'd', start: 200, end: 230 },
    ]);
    const by = (id: string) => laid.find((x) => x.id === id)!;

    expect([by('a').col, by('b').col, by('c').col]).toEqual([0, 1, 0]);
    expect([by('a').cols, by('b').cols, by('c').cols]).toEqual([2, 2, 2]);
    expect(by('d')).toMatchObject({ col: 0, cols: 1 });
  });
});

describe('multi-day lanes', () => {
  it('stacks overlapping bars and marks bars cut by the row edges', () => {
    const laid = layoutLanes(
      [
        { id: 'trip', startDay: -2, endDay: 3 }, // started last week
        { id: 'conf', startDay: 1, endDay: 4 },
        { id: 'holiday', startDay: 5, endDay: 9 }, // continues next week
      ],
      7,
    );
    const by = (id: string) => laid.find((x) => x.id === id)!;

    expect(by('trip')).toMatchObject({ lane: 0, col: 0, span: 3, continuesBefore: true, continuesAfter: false });
    expect(by('conf')).toMatchObject({ lane: 1, col: 1, span: 3 });
    expect(by('holiday')).toMatchObject({ lane: 0, col: 5, span: 2, continuesAfter: true });
  });

  it('drops bars entirely outside the row', () => {
    expect(layoutLanes([{ startDay: 8, endDay: 10 }], 7)).toEqual([]);
  });
});

describe('hiding', () => {
  const filters = parseFilters(
    JSON.stringify({
      hiddenCalendars: ['holidays'],
      hiddenEvents: { 'primary|breakfast': 'Ranajky' },
      multiDayOnly: ['month'],
    }),
  );
  const event = (over: Partial<Parameters<typeof isHidden>[0]>) => ({
    calendarId: 'primary',
    key: 'primary|x',
    isBlock: false,
    multiDay: false,
    ...over,
  });

  it('hides by calendar, by event series, and by the multi-day-only switch per view', () => {
    expect(isHidden(event({ calendarId: 'holidays' }), filters, 'week')).toBe(true);
    expect(isHidden(event({ key: 'primary|breakfast' }), filters, 'week')).toBe(true);
    expect(isHidden(event({}), filters, 'week')).toBe(false);
    expect(isHidden(event({}), filters, 'month')).toBe(true);
    expect(isHidden(event({ multiDay: true }), filters, 'month')).toBe(false);
  });

  it('hides the TimeBlock plan only when asked', () => {
    expect(isHidden(event({ isBlock: true, calendarId: null, key: null }), filters, 'week')).toBe(false);
    expect(isHidden(event({ isBlock: true }), { ...filters, hidePlan: true }, 'week')).toBe(true);
  });

  it('keys recurring events by series', () => {
    expect(eventKey({ calendarId: 'primary', seriesId: 'breakfast' })).toBe('primary|breakfast');
  });

  it('carries over choices saved when these switches greyed items out', () => {
    const legacy = parseFilters(JSON.stringify({ greyCalendars: ['wizz'], greyPlan: true, greyEvents: { 'a|b': 'Obed' } }));

    expect(legacy).toMatchObject({ hiddenCalendars: ['wizz'], hidePlan: true, hiddenEvents: { 'a|b': 'Obed' } });
  });

  it('survives malformed stored filters', () => {
    expect(parseFilters('not json')).toMatchObject({ hiddenCalendars: [], hidePlan: false });
    expect(parseFilters('{"multiDayOnly":["month","nope"]}').multiDayOnly).toEqual(['month']);
  });
});

describe('time windows on the calendar', () => {
  const learning = { id: 1, name: 'Learning', start: '10:30', end: '14:00', weekdays: [1, 2, 3, 4, 5], color: null };
  const work = { id: 2, name: 'Work', start: '14:00', end: '17:30', weekdays: [1, 2, 3, 4, 5], color: '#123abc' };
  const training = { id: 3, name: 'Training', start: '08:15', end: '10:00', weekdays: [6], color: null };
  const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

  it('uses a chosen colour, else a distinct palette colour by position', () => {
    expect(windowColor('#123abc', 0)).toBe('#123abc');
    expect(windowColor(null, 0)).toBe(WINDOW_PALETTE[0]);
    expect(windowColor('not a colour', 1)).toBe(WINDOW_PALETTE[1]);
    expect(windowColor(null, WINDOW_PALETTE.length)).toBe(WINDOW_PALETTE[0]);
    expect((WINDOW_PALETTE as readonly string[]).includes(energyColor('deep'))).toBe(false); // never mistaken for a block
    expect(windowLegend([learning, work]).map((w) => w.color)).toEqual([WINDOW_PALETTE[0], '#123abc']);
  });

  it('accepts only #rrggbb from the colour picker', () => {
    expect(parseHexColor('#33B679')).toBe('#33b679');
    expect(parseHexColor('red')).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });

  it('names each window once per view, on the first day it opens', () => {
    const bands = windowBands(WEEK, [learning, work, training], TZ);
    const labelled = Object.entries(bands).flatMap(([day, list]) => list.filter((b) => b.labelled).map((b) => `${day} ${b.name}`));

    expect(labelled).toEqual(['2026-09-28 Learning', '2026-09-28 Work', '2026-10-03 Training']);
    expect(bands['2026-09-29'].map((b) => b.name)).toEqual(['Learning', 'Work']);
    expect(bands['2026-10-04']).toEqual([]);
    expect(bands['2026-09-29'][0].start.toFormat('HH:mm')).toBe('10:30');
  });

  it('keeps windows behind the blocks unless brought to the front', () => {
    expect(parseFilters('{}').windowsInFront).toBe(false);
    expect(parseFilters(JSON.stringify({ windowsInFront: true })).windowsInFront).toBe(true);
    expect(parseFilters(JSON.stringify({ windowsInFront: 'yes' })).windowsInFront).toBe(false);
  });
});
