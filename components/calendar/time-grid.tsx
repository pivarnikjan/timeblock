import Link from 'next/link';
import { DateTime } from 'luxon';
import type { CalendarData, CalendarItem } from '@/lib/calendar/load';
import { textOn } from '@/lib/calendar/colors';
import { layoutColumns, layoutLanes } from '@/lib/calendar/layout';
import { vacationPieces, type VacationPiece } from '@/lib/calendar/vacation-overlay';
import { DraggableBlock } from './draggable-block';
import { chipStyle, ItemLink, itemHref } from './event-chip';
import { ScrollArea } from './scroll-area';

/** 48px an hour, like Google Calendar's default density. */
const PX_PER_MIN = 0.8;
const LANE_PX = 22;

const dayIndex = (data: CalendarData, dt: DateTime) =>
  Math.round(dt.startOf('day').diff(DateTime.fromISO(data.range.days[0], { zone: data.zone }), 'days').days);

/** Exclusive end day of an all-day/multi-day item, as an index into the visible days. */
function endIndex(data: CalendarData, item: CalendarItem): number {
  // All-day ends are exclusive midnights; a timed multi-day event covers the day its end falls in.
  const lastDay = item.allDay || item.end.equals(item.end.startOf('day')) ? item.end.minus({ milliseconds: 1 }) : item.end;
  return dayIndex(data, lastDay) + 1;
}

export function TimeGrid({ data }: { data: CalendarData }) {
  const { days } = data.range;
  const { startMin, endMin } = data.hours;
  const columns = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;
  const height = (endMin - startMin) * PX_PER_MIN;

  const spanning = data.items.filter((i) => i.allDay || i.multiDay);
  const timed = data.items.filter((i) => !i.allDay && !i.multiDay);
  const lanes = layoutLanes(
    spanning.map((item) => ({ item, startDay: dayIndex(data, item.start), endDay: endIndex(data, item) })),
    days.length,
  );
  const laneCount = lanes.reduce((max, l) => Math.max(max, l.lane + 1), 0);
  const away = vacationPieces(
    data.items.flatMap((i) => (i.vacation ? [i.vacation] : [])),
    days,
    data.zone,
    data.hours,
  );

  // Open an hour before now when today is shown, else an hour before the first
  // timed item — never scrolled to an empty early morning.
  const firstMin = (dt: DateTime) => dt.diff(dt.startOf('day'), 'minutes').minutes;
  const focus = days.includes(data.today)
    ? firstMin(data.now)
    : timed.reduce((min, i) => Math.min(min, firstMin(i.start)), Infinity);
  const initialTop = Number.isFinite(focus) ? Math.max(0, (focus - 60 - startMin) * PX_PER_MIN) : 0;

  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m < endMin; m += 60) hours.push(m);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Day headers */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
        <div className="flex items-end justify-center pb-1 text-[10px] text-muted">{data.now.toFormat('ZZZZ')}</div>
        {days.map((day) => {
          const dt = DateTime.fromISO(day, { zone: data.zone });
          const isToday = day === data.today;
          return (
            <Link
              key={day}
              href={`/calendar?view=day&date=${day}`}
              className="flex flex-col items-center gap-0.5 py-2 hover:bg-background"
            >
              <span className={`text-[11px] font-medium uppercase ${isToday ? 'text-[#1a73e8]' : 'text-muted'}`}>
                {dt.toFormat('ccc')}
              </span>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xl ${
                  isToday ? 'bg-[#1a73e8] text-white' : ''
                }`}
              >
                {dt.toFormat('d')}
              </span>
            </Link>
          );
        })}
      </div>

      {/* All-day and multi-day events, as bars across the days they cover */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
        <div className="py-1 pr-1 text-right text-[10px] text-muted">all day</div>
        <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, height: Math.max(laneCount * LANE_PX, 8) + 4 }}>
          {lanes.map(({ item, lane, col, span, continuesBefore, continuesAfter }) => {
            const { style, className } = chipStyle(item);
            return (
              <ItemLink
                key={item.id}
                data={data}
                item={item}
                className={`absolute flex items-center gap-1 overflow-hidden px-1.5 text-xs ${className} ${
                  continuesBefore ? 'rounded-l-none' : 'rounded-l'
                } ${continuesAfter ? 'rounded-r-none' : 'rounded-r'}`}
                style={{
                  ...style,
                  top: lane * LANE_PX + 2,
                  height: LANE_PX - 3,
                  left: `calc(${(col / days.length) * 100}% + 2px)`,
                  width: `calc(${(span / days.length) * 100}% - 4px)`,
                }}
              >
                <span className="min-w-0 flex-1 truncate font-medium" title={item.title}>
                  {continuesBefore && '◂ '}
                  {item.title}
                  {continuesAfter && ' ▸'}
                </span>
              </ItemLink>
            );
          })}
        </div>
      </div>

      {/* Time grid */}
      <ScrollArea initialTop={initialTop} className="max-h-[75vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted"
                style={{ top: (m - startMin) * PX_PER_MIN }}
              >
                {m === startMin ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          {days.map((day, i) => (
            <DayColumn
              key={day}
              data={data}
              day={day}
              dayIndex={i}
              timed={timed}
              height={height}
              hours={hours}
              away={away[day] ?? []}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function DayColumn({
  data,
  day,
  dayIndex,
  timed,
  height,
  hours,
  away,
}: {
  data: CalendarData;
  day: string;
  dayIndex: number;
  timed: CalendarItem[];
  away: VacationPiece[];
  height: number;
  hours: number[];
}) {
  const { startMin, endMin } = data.hours;
  const dayStart = DateTime.fromISO(day, { zone: data.zone }).startOf('day');
  const visibleStart = dayStart.plus({ minutes: startMin });
  const visibleEnd = dayStart.plus({ minutes: endMin });
  const toMin = (dt: DateTime) => dt.diff(dayStart, 'minutes').minutes - startMin;

  // Timed items clipped to this day's visible hours; an event crossing midnight shows on both days.
  const pieces = timed
    .filter((item) => item.start < visibleEnd && item.end > visibleStart)
    .map((item) => ({
      item,
      start: toMin(DateTime.max(item.start, visibleStart)),
      end: Math.max(toMin(DateTime.min(item.end, visibleEnd)), toMin(DateTime.max(item.start, visibleStart)) + 15),
    }));

  const nowTop = day === data.today ? toMin(data.now) : null;

  return (
    <div className="relative border-l border-border" style={{ height }}>
      {hours.map((m) => (
        <div key={m} className="absolute inset-x-0 border-t border-border/70" style={{ top: (m - startMin) * PX_PER_MIN }} />
      ))}

      {/* Time windows (Learning, Work…): behind the blocks unless brought to the front */}
      {!data.filters.windowsInFront && <WindowBands data={data} day={day} front={false} />}

      {layoutColumns(pieces).map(({ item, start, end, col, cols }) => {
        const { style, className } = chipStyle(item);
        const heightPx = (end - start) * PX_PER_MIN;
        const time = `${item.start.toFormat('HH:mm')} – ${item.end.toFormat('HH:mm')}`;
        const selected = data.selected === item.id;
        const chipClass = `absolute overflow-hidden rounded px-1.5 py-0.5 text-xs leading-tight shadow-sm ${className} ${
          selected ? 'z-[5] ring-2 ring-foreground ring-offset-1 ring-offset-surface' : ''
        }`;
        const chipStyleProps = {
          ...style,
          top: start * PX_PER_MIN + 1,
          height: Math.max(heightPx - 2, 14),
          left: `calc(${(col / cols) * 100}% + 1px)`,
          width: `calc(${100 / cols}% - 3px)`,
        };
        const note = item.draft ? ' · draft' : item.placeholder ? ' · placeholder' : '';
        const content = (
          <span className="block min-w-0">
            <span className="block truncate font-medium" title={`${item.title} · ${time}${note}`}>
              {item.pinned && <span title="Placed by hand — planning works around it">📌 </span>}
              {item.title}
            </span>
            {heightPx >= 30 && <span className="block truncate opacity-80">{time}{note}</span>}
          </span>
        );

        // Blocks that start and end on this day can be dragged; anything else stays a link.
        if (item.movable && item.blockId !== null && item.planDate && item.start.hasSame(item.end.minus({ milliseconds: 1 }), 'day')) {
          return (
            <DraggableBlock
              key={`${item.id}@${day}`}
              blockId={item.blockId}
              href={itemHref(data, item)}
              className={chipClass}
              style={chipStyleProps}
              dayIndex={dayIndex}
              dayCount={data.range.days.length}
              pxPerMin={PX_PER_MIN}
              startMin={item.start.hour * 60 + item.start.minute}
              lengthMin={Math.round(item.end.diff(item.start, 'minutes').minutes)}
            >
              {content}
            </DraggableBlock>
          );
        }
        return (
          <ItemLink key={`${item.id}@${day}`} data={data} item={item} className={chipClass} style={chipStyleProps}>
            {content}
          </ItemLink>
        );
      })}

      {data.filters.windowsInFront && <WindowBands data={data} day={day} front />}

      {/* Vacation: hatched over everything, so it is plain what falls inside it */}
      {away.map((piece) => (
        <VacationHatch key={piece.id} piece={piece} />
      ))}

      {nowTop !== null && nowTop >= 0 && nowTop <= endMin - startMin && (
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowTop * PX_PER_MIN }}>
          <div className="relative h-0.5 bg-[#ea4335]">
            <span className="absolute -left-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-[#ea4335]" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A day's time windows as tinted bands in each window's colour, with a stripe
 * down the left edge. The name appears once per view, on the first day a
 * window opens. In front, the bands sit over the blocks (clicks and drags pass
 * through) and the name becomes a solid label that nothing can cover.
 */
function WindowBands({ data, day, front }: { data: CalendarData; day: string; front: boolean }) {
  const { startMin, endMin } = data.hours;
  const dayStart = DateTime.fromISO(day, { zone: data.zone }).startOf('day');
  const toMin = (dt: DateTime) => dt.diff(dayStart, 'minutes').minutes - startMin;

  return (
    <>
      {(data.bands[day] ?? []).map((band) => {
        const top = Math.max(0, toMin(band.start)) * PX_PER_MIN;
        const bottom = Math.min(endMin - startMin, toMin(band.end)) * PX_PER_MIN;
        if (bottom <= top) return null;
        const time = `${band.start.toFormat('HH:mm')}–${band.end.toFormat('HH:mm')}`;
        return (
          <div
            key={`${band.id}@${band.start.toMillis()}`}
            className={`pointer-events-none absolute inset-x-0 overflow-hidden ${front ? 'z-10 border-2' : 'border-y border-dashed'}`}
            style={{
              top,
              height: bottom - top,
              backgroundColor: `${band.color}${front ? '24' : '14'}`,
              borderColor: front ? band.color : `${band.color}66`,
              borderLeft: `3px solid ${band.color}`,
            }}
            title={`${band.name} ${time}`}
          >
            {band.labelled &&
              (front ? (
                <span
                  className="absolute left-0 top-0 max-w-full truncate rounded-br px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide shadow-sm"
                  style={{ backgroundColor: band.color, color: textOn(band.color) }}
                >
                  {band.name}
                </span>
              ) : (
                <span
                  className="absolute right-1 top-0.5 max-w-full truncate text-[9px] font-semibold uppercase tracking-wide"
                  style={{ color: band.color }}
                >
                  {band.name}
                </span>
              ))}
          </div>
        );
      })}
    </>
  );
}

const VACATION_RED = '#E53935';

/**
 * A vacation's share of one day: red diagonal hatching with a red outline, in
 * front of events and blocks (clicks pass through to them). Deliberately not
 * how Google draws anything — time away should be unmistakable.
 */
function VacationHatch({ piece }: { piece: VacationPiece }) {
  const heightPx = piece.length * PX_PER_MIN;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[15] flex items-center justify-center overflow-hidden border-2"
      style={{
        top: piece.top * PX_PER_MIN,
        height: heightPx,
        borderColor: VACATION_RED,
        backgroundImage: `repeating-linear-gradient(135deg, ${VACATION_RED}b3 0 2px, transparent 2px 14px)`,
      }}
      aria-label="Vacation"
    >
      {piece.labelled && heightPx >= 60 && (
        <span
          className="-rotate-[65deg] select-none whitespace-nowrap text-xl font-bold uppercase tracking-[0.2em]"
          style={{ color: VACATION_RED, textShadow: '0 0 6px var(--surface)' }}
        >
          Vacation
        </span>
      )}
    </div>
  );
}
