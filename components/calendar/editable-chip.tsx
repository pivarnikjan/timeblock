'use client';

import Link from 'next/link';
import { DateTime } from 'luxon';
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { EditTarget } from './edit-target';
import { usePendingEdits } from './pending-edits';

/** Drops land on 5-minute steps, like the planner's own block edges. */
const SNAP_MIN = 5;
/** Less movement than this is a click (open the panel), not a drag. */
const DRAG_THRESHOLD_PX = 4;
const DAY_MIN = 24 * 60;
/** Nothing is resized shorter than this. */
const MIN_LENGTH = 15;

/** Where the chip is drawn: days from its own column, minute of the day it starts, and its length. */
interface Place {
  days: number;
  startMin: number;
  lengthMin: number;
}

const clock = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const snap = (mins: number) => Math.round(mins / SNAP_MIN) * SNAP_MIN;

/**
 * An event or block on the time grid whose time can be changed by hand: drag
 * it to another time or visible day, or drag its bottom edge to make it longer
 * or shorter. A change is not saved — it stays where it was dropped, dashed,
 * with its old place outlined, until it is saved (or undone) from the bar above
 * the calendar or the event panel.
 */
export function EditableChip({
  target,
  href,
  className,
  style,
  children,
  dayIndex,
  dayCount,
  pxPerMin,
  hoursStartMin,
  colLeftPct,
  colWidthPct,
}: {
  target: EditTarget;
  href: string;
  className: string;
  /** Where the chip is drawn at its saved time. */
  style: CSSProperties;
  children: ReactNode;
  /** This day's position among the visible days, and how many there are. */
  dayIndex: number;
  dayCount: number;
  pxPerMin: number;
  /** First minute of the day the grid shows. */
  hoursStartMin: number;
  /** The chip's lane inside its day column, in percent of the column. */
  colLeftPct: number;
  colWidthPct: number;
}) {
  const { edits, stage, saving } = usePendingEdits();
  const pending = edits.get(target.id) ?? null;
  const [drag, setDrag] = useState<Place | null>(null);
  const origin = useRef<{ x: number; y: number; colWidth: number; mode: 'move' | 'resize'; base: Place } | null>(null);
  const latest = useRef<Place | null>(null);
  const dragged = useRef(false);

  const zone = target.zone;
  const savedStart = DateTime.fromISO(target.start, { zone });
  const column = savedStart.startOf('day');
  const placeOf = (start: string, end: string): Place => {
    const s = DateTime.fromISO(start, { zone });
    return {
      days: Math.round(s.startOf('day').diff(column, 'days').days),
      startMin: Math.round(s.diff(s.startOf('day'), 'minutes').minutes),
      lengthMin: Math.round(DateTime.fromISO(end, { zone }).diff(s, 'minutes').minutes),
    };
  };
  const current = drag ?? (pending ? placeOf(pending.start, pending.end) : null);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || saving) return;
    const col = e.currentTarget.parentElement;
    if (!col) return;
    const mode = (e.target as HTMLElement).dataset.resize ? 'resize' : 'move';
    const base = current ?? placeOf(target.start, target.end);
    origin.current = { x: e.clientX, y: e.clientY, colWidth: col.getBoundingClientRect().width, mode, base };
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const o = origin.current;
    if (!o) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (!dragged.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragged.current = true;

    const { base } = o;
    let next: Place;
    if (o.mode === 'resize') {
      const lengthMin = Math.max(MIN_LENGTH, Math.min(DAY_MIN - base.startMin, base.lengthMin + snap(dy / pxPerMin)));
      next = { ...base, lengthMin };
    } else {
      const days = Math.max(-dayIndex, Math.min(dayCount - 1 - dayIndex, base.days + Math.round(dx / o.colWidth)));
      const startMin = Math.max(0, Math.min(DAY_MIN - base.lengthMin, base.startMin + snap(dy / pxPerMin)));
      next = { ...base, days, startMin };
    }
    latest.current = next;
    setDrag(next);
  };

  const finish = () => {
    const drop = latest.current;
    origin.current = null;
    latest.current = null;
    setDrag(null);
    if (!dragged.current || !drop) return;
    const start = column.plus({ days: drop.days, minutes: drop.startMin });
    stage(target, start.toISO()!, start.plus({ minutes: drop.lengthMin }).toISO()!);
  };

  const cancel = () => {
    origin.current = null;
    latest.current = null;
    setDrag(null);
  };

  // A drag ends with a click on the same element; it must not open the panel.
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!dragged.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragged.current = false;
  };

  // A change to a day this view does not show (made in the panel) is marked where the item was.
  const inView = current !== null && current.days >= -dayIndex && current.days <= dayCount - 1 - dayIndex;
  const moved: CSSProperties | null =
    inView && current
      ? {
          top: (current.startMin - hoursStartMin) * pxPerMin + 1,
          height: Math.max(current.lengthMin * pxPerMin - 2, 14),
          // Percentages of the day column: whole columns over (plus their 1px borders), then the lane.
          left: `calc(${colLeftPct}% + ${current.days * 100}% + ${current.days + 1}px)`,
          width: `calc(${colWidthPct}% - 3px)`,
        }
      : null;

  return (
    <>
      {inView && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded border-2 border-dashed border-foreground/40"
          style={{ top: style.top, height: style.height, left: style.left, width: style.width }}
        />
      )}
      <Link
        href={href}
        scroll={false}
        draggable={false}
        className={`${className} cursor-grab touch-none select-none ${
          current ? 'z-20 opacity-95 shadow-lg outline-2 outline-offset-1 outline-dashed outline-accent' : ''
        } ${drag ? 'cursor-grabbing' : ''} ${saving && pending ? 'animate-pulse' : ''}`}
        style={moved ? { ...style, ...moved } : style}
        title="Drag to move · drag the bottom edge to change the length · click for details"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onClickCapture={onClickCapture}
      >
        {current && (
          <span className="absolute bottom-1 right-0.5 z-30 whitespace-nowrap rounded bg-foreground px-1 py-px text-[10px] font-medium tabular-nums text-background shadow">
            {!inView && `→ ${column.plus({ days: current.days }).toFormat('ccc d LLL')} `}
            {clock(current.startMin)} – {clock(current.startMin + current.lengthMin)}
            {inView && current.days !== 0 && ` · ${current.days > 0 ? '+' : ''}${current.days}d`}
          </span>
        )}
        {children}
        <span data-resize="1" aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-foreground/20" />
      </Link>
    </>
  );
}
