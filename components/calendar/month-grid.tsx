import Link from 'next/link';
import { DateTime } from 'luxon';
import type { CalendarData, CalendarItem } from '@/lib/calendar/load';
import { layoutLanes } from '@timeblock/core/calendar/layout';
import { chipStyle, ItemLink } from './event-chip';

const BAR_PX = 20;
/** Height of a cell's date line (mt-1 + h-6) — bars start just below it. */
const HEADER_PX = 28;
/** Timed events listed per day before collapsing into "+N more". */
const MAX_TIMED = 4;

export function MonthGrid({ data }: { data: CalendarData }) {
  const weeks: string[][] = [];
  for (let i = 0; i < data.range.days.length; i += 7) weeks.push(data.range.days.slice(i, i + 7));

  const weekdays = weeks[0].map((d) => DateTime.fromISO(d, { zone: data.zone }).toFormat('ccc'));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((w) => (
          <div key={w} className="py-1.5 text-center text-[11px] font-medium uppercase text-muted">
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <Week key={week[0]} data={data} week={week} />
      ))}
    </div>
  );
}

function Week({ data, week }: { data: CalendarData; week: string[] }) {
  const weekStart = DateTime.fromISO(week[0], { zone: data.zone });
  const index = (dt: DateTime) => Math.round(dt.startOf('day').diff(weekStart, 'days').days);
  const exclusiveEnd = (item: CalendarItem) =>
    index(item.allDay || item.end.equals(item.end.startOf('day')) ? item.end.minus({ milliseconds: 1 }) : item.end) + 1;

  const bars = layoutLanes(
    data.items
      .filter((i) => i.allDay || i.multiDay)
      .map((item) => ({ item, startDay: index(item.start), endDay: exclusiveEnd(item) })),
    7,
  );
  const laneCount = bars.reduce((max, b) => Math.max(max, b.lane + 1), 0);

  return (
    <div className="relative grid min-h-28 grid-cols-7 border-b border-border last:border-b-0">
      {week.map((day, i) => {
        const dt = DateTime.fromISO(day, { zone: data.zone });
        const inMonth = data.range.month === null || dt.toFormat('yyyy-MM') === data.range.month;
        const isToday = day === data.today;
        const timed = data.items.filter((item) => !item.allDay && !item.multiDay && item.start.toISODate() === day);
        const extra = timed.length - MAX_TIMED;

        return (
          <div key={day} className={`flex flex-col ${i > 0 ? 'border-l border-border' : ''} ${inMonth ? '' : 'bg-background/60'}`}>
            <Link
              href={`/calendar?view=day&date=${day}`}
              className="mx-auto mt-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs hover:bg-background"
            >
              <span
                className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 ${
                  isToday ? 'bg-[#1a73e8] font-medium text-white' : inMonth ? '' : 'text-muted'
                }`}
              >
                {dt.day === 1 ? dt.toFormat('d LLL') : dt.toFormat('d')}
              </span>
            </Link>

            {/* Room for the multi-day bars drawn across this week */}
            <div style={{ height: laneCount * BAR_PX }} />

            <ul className="space-y-px px-1 pb-1">
              {timed.slice(0, MAX_TIMED).map((item) => (
                <TimedRow key={item.id} data={data} item={item} />
              ))}
              {extra > 0 && (
                <li>
                  <Link href={`/calendar?view=day&date=${day}`} className="block rounded px-1 text-[11px] font-medium text-muted hover:bg-background">
                    +{extra} more
                  </Link>
                </li>
              )}
            </ul>
          </div>
        );
      })}

      {/* Multi-day and all-day events as bars spanning the days they cover */}
      {bars.map(({ item, lane, col, span, continuesBefore, continuesAfter }) => {
        const { style, className } = chipStyle(item);
        return (
          <ItemLink
            key={item.id}
            data={data}
            item={item}
            className={`absolute flex items-center gap-1 overflow-hidden px-1.5 text-[11px] ${className} ${
              continuesBefore ? 'rounded-l-none' : 'rounded-l'
            } ${continuesAfter ? 'rounded-r-none' : 'rounded-r'}`}
            style={{
              ...style,
              top: HEADER_PX + lane * BAR_PX + 2,
              height: BAR_PX - 3,
              left: `calc(${(col / 7) * 100}% + 2px)`,
              width: `calc(${(span / 7) * 100}% - 4px)`,
            }}
          >
            <span
              className="min-w-0 flex-1 truncate font-medium"
              title={`${item.title} · ${item.start.toFormat('d LLL')} – ${item.end.minus({ milliseconds: item.allDay ? 1 : 0 }).toFormat('d LLL')}`}
            >
              {continuesBefore && '◂ '}
              {item.important && '★ '}
              {!item.allDay && !continuesBefore && `${item.start.toFormat('HH:mm')} `}
              {item.title}
              {continuesAfter && ' ▸'}
            </span>
          </ItemLink>
        );
      })}
    </div>
  );
}

/**
 * A timed event in a month cell: coloured dot, start time, title — as in Google
 * Calendar. One marked important is starred and set in bold.
 */
function TimedRow({ data, item }: { data: CalendarData; item: CalendarItem }) {
  return (
    <li className="flex items-center gap-1">
      <ItemLink
        data={data}
        item={item}
        className={`flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-[11px] hover:bg-background ${
          item.declined ? 'line-through' : ''
        } ${item.important ? 'font-semibold' : ''}`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${item.draft ? 'border border-dashed' : ''}`}
          style={item.draft ? { borderColor: item.color } : { backgroundColor: item.color }}
        />
        <span className="shrink-0 tabular-nums opacity-80">{item.start.toFormat('HH:mm')}</span>
        <span className="truncate">
          {item.important && '★ '}
          {item.title}
        </span>
      </ItemLink>
    </li>
  );
}
