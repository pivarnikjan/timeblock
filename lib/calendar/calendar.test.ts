import { describe, expect, it } from 'vitest';
import { windowBands, windowLegend } from './bands';
import { busySpans } from './busy';
import {
  blockColor,
  blockColorId,
  colorUpdate,
  calendarColor,
  energyColor,
  eventColor,
  explicitColorId,
  nearestEventColorId,
  parseHexColor,
  textOn,
  WINDOW_PALETTE,
  windowColor,
  windowColors,
} from './colors';
import { eventKey, isHidden, parseFilters } from './filters';
import { layoutColumns, layoutLanes } from './layout';
import { calendarHref, calendarRange, parseView, visibleHours } from './views';

const TZ = 'Europe/Vienna';

describe('views', () => {
  it('covers one day, the work week and the full week, and no longer knows 3 days', () => {
    expect(parseView('3days')).toBeNull();
    // Wed 30 Sep 2026
    expect(calendarRange('day', '2026-09-30', TZ).days).toEqual(['2026-09-30']);
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
    expect(calendarRange('week', '2026-09-30', TZ).prev).toBe('2026-09-23');
    expect(calendarRange('month', '2026-01-31', TZ).next).toBe('2026-02-01');
  });

  it('titles ranges like Google does', () => {
    expect(calendarRange('day', '2026-09-30', TZ).title).toBe('Wednesday 30 September 2026');
    expect(calendarRange('week', '2026-09-30', TZ).title).toBe('28 Sep – 4 Oct 2026');
    expect(calendarRange('workweek', '2026-10-05', TZ).title).toBe('5 – 9 Oct 2026');
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

  it('applies "only multi-day events" in Month alone, ignoring choices stored for hour views', () => {
    const stored = parseFilters(JSON.stringify({ multiDayOnly: ['week', 'day', 'month'] }));

    expect(isHidden(event({}), stored, 'week')).toBe(false);
    expect(isHidden(event({}), stored, 'day')).toBe(false);
    expect(isHidden(event({}), stored, 'month')).toBe(true);
  });

  it('keeps an important event in Month even when only multi-day events are shown', () => {
    expect(isHidden(event({ important: true }), filters, 'month')).toBe(false);
    expect(isHidden(event({ important: false }), filters, 'month')).toBe(true);
    // Hiding still wins: important does not bring back a hidden calendar.
    expect(isHidden(event({ important: true, calendarId: 'holidays' }), filters, 'month')).toBe(true);
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

describe('time window order', () => {
  // Created in this order (ids), shown by start time.
  const learning = { id: 1, name: 'Learning', start: '10:30', end: '14:00', weekdays: [1, 2, 3, 4, 5], color: null };
  const work = { id: 2, name: 'Work', start: '14:00', end: '17:30', weekdays: [1, 2, 3, 4, 5], color: null };
  const training = { id: 3, name: 'Training', start: '08:15', end: '10:00', weekdays: [1, 2, 3, 4, 5], color: null };
  const family = { id: 4, name: 'Family', start: '18:00', end: '21:00', weekdays: [1, 2, 3, 4, 5], color: '#abcdef' };

  it('lists windows by start time, whatever order they were created in', () => {
    expect(windowLegend([learning, work, training, family]).map((w) => w.name)).toEqual(['Training', 'Learning', 'Work', 'Family']);
  });

  it('keeps each window its colour when the list is re-sorted', () => {
    const colors = windowColors([training, family, work, learning]);

    // Palette colours follow creation order, so Learning keeps the first colour though Training is listed first.
    expect(colors.get(1)).toBe(WINDOW_PALETTE[0]);
    expect(colors.get(2)).toBe(WINDOW_PALETTE[1]);
    expect(colors.get(3)).toBe(WINDOW_PALETTE[2]);
    expect(colors.get(4)).toBe('#abcdef');
    expect(windowLegend([training, learning]).find((w) => w.id === 1)!.color).toBe(WINDOW_PALETTE[0]);
  });
});

describe('event panel and placeholders', () => {
  const meeting = (over: Partial<Parameters<typeof busySpans>[0][number]>) => ({
    calendarId: 'primary',
    seriesId: 'standup',
    start: '2026-09-28T08:00:00Z',
    end: '2026-09-28T08:30:00Z',
    busy: true,
    blockId: null,
    ...over,
  });

  it('opens an item in the panel through the URL, keeping the view and date', () => {
    expect(calendarHref('week', '2026-09-28', 'primary:abc_1')).toBe('/calendar?view=week&date=2026-09-28&item=primary%3Aabc_1');
    expect(calendarHref('week', '2026-09-28')).toBe('/calendar?view=week&date=2026-09-28');
  });

  it('leaves placeholder events out of busy time, for every repeat of the series', () => {
    const events = [
      meeting({}),
      meeting({ seriesId: 'focus', start: '2026-09-28T09:00:00Z', end: '2026-09-28T11:00:00Z' }),
      meeting({ seriesId: 'focus', start: '2026-09-29T09:00:00Z', end: '2026-09-29T11:00:00Z' }),
    ];

    expect(busySpans(events)).toHaveLength(3);
    expect(busySpans(events, new Set(['primary|focus']))).toEqual([{ start: '2026-09-28T08:00:00Z', end: '2026-09-28T08:30:00Z' }]);
  });

  it('never counts TimeBlock blocks, free or declined events as busy', () => {
    expect(busySpans([meeting({ blockId: 7 }), meeting({ busy: false })])).toEqual([]);
  });
});

describe('block colours', () => {
  const LEARNING_GREEN = '#33B679'; // Sage

  it('gives a block its window colour, and work with no window its energy colour', () => {
    expect(blockColor(LEARNING_GREEN, 'deep')).toBe(LEARNING_GREEN);
    expect(blockColor('#a0c020', 'shallow', { colorId: '2', plannedColorId: '2' })).toBe('#a0c020'); // Google has the nearest; here the exact one
    expect(blockColor(null, 'admin')).toBe(energyColor('admin'));
  });

  it('lets a colour chosen in Google win over the window', () => {
    expect(blockColor(LEARNING_GREEN, 'deep', { colorId: '11', plannedColorId: '2' })).toBe('#D50000'); // Tomato
  });

  it('tells a colour chosen by hand from the one TimeBlock gave the event', () => {
    expect(explicitColorId({ colorId: '2', plannedColorId: '2' })).toBeNull();
    expect(explicitColorId({ colorId: '4', plannedColorId: '2' })).toBe('4');
    expect(explicitColorId({ colorId: null, plannedColorId: '2' })).toBeNull();
    // Committed before colours were recorded: the energy colours were TimeBlock's own.
    expect(explicitColorId({ colorId: '9', plannedColorId: null })).toBeNull();
    expect(explicitColorId({ colorId: '3', plannedColorId: null })).toBe('3');
  });

  it('picks the nearest Google event colour for a window colour', () => {
    expect(nearestEventColorId('#33B679')).toBe('2'); // Sage, exactly
    expect(nearestEventColorId('#F4511E')).toBe('6'); // Tangerine, exactly
    expect(nearestEventColorId('#f5c030')).toBe('5'); // a yellow → Banana
    expect(nearestEventColorId('#00a0e0')).toBe('7'); // a cyan → Peacock
    expect(nearestEventColorId('nope')).toBe('9');
  });
});

describe('block colours in Google', () => {
  it('asks Google for the window colour, or the energy colour with no window', () => {
    expect(blockColorId('#33B679', 'deep')).toBe('2'); // Sage
    expect(blockColorId(null, 'shallow')).toBe('7'); // Peacock
  });

  it('repaints TimeBlock colours, leaves colours chosen by hand', () => {
    // Committed before blocks took their window colour: Blueberry was TimeBlock's.
    expect(colorUpdate({ colorId: '9', plannedColorId: null }, '2')).toEqual({ set: '2' });
    // The window's colour changed since the event was committed.
    expect(colorUpdate({ colorId: '2', plannedColorId: '2' }, '6')).toEqual({ set: '6' });
    // Already right, and recorded.
    expect(colorUpdate({ colorId: '2', plannedColorId: '2' }, '2')).toBe('up-to-date');
    // Right energy colour but never recorded: record it, so a later change reads as chosen.
    expect(colorUpdate({ colorId: '7', plannedColorId: null }, '7')).toEqual({ set: '7' });
    // Changed in Google by hand.
    expect(colorUpdate({ colorId: '11', plannedColorId: '2' }, '6')).toBe('chosen-by-hand');
    expect(colorUpdate({ colorId: '3', plannedColorId: null }, '2')).toBe('chosen-by-hand');
  });
});
