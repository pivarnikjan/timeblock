'use client';

import Link from 'next/link';
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { moveBlockAction } from '@/app/actions/plan';

/** Drops land on 5-minute steps, like the planner's own block edges. */
const SNAP_MIN = 5;
/** Less movement than this is a click (open the day), not a drag. */
const DRAG_THRESHOLD_PX = 4;
const DAY_MIN = 24 * 60;

interface Offset {
  days: number;
  minutes: number;
  x: number;
  y: number;
  /** The position the offset was measured from; a stale offset is ignored once the block has moved. */
  from: string;
  saving: boolean;
}

const clock = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/**
 * A TimeBlock block on the time grid that can be dragged to another time or
 * another visible day. Where it is dropped is where it stays: windows do not
 * apply to a block placed by hand, so a Learning block may end at 14:15.
 */
export function DraggableBlock({
  blockId,
  href,
  className,
  style,
  children,
  dayIndex,
  dayCount,
  pxPerMin,
  startMin,
  lengthMin,
}: {
  blockId: number;
  href: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
  /** This day's position among the visible days, and how many there are. */
  dayIndex: number;
  dayCount: number;
  pxPerMin: number;
  /** Local minute of the day the block starts at, and its length. */
  startMin: number;
  lengthMin: number;
}) {
  const position = `${dayIndex}:${startMin}`;
  const [offset, setOffset] = useState<Offset | null>(null);
  const origin = useRef<{ x: number; y: number; colWidth: number } | null>(null);
  const latest = useRef<Offset | null>(null);
  const dragged = useRef(false);

  const active = offset && offset.from === position ? offset : null;

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || active?.saving) return;
    const column = e.currentTarget.parentElement;
    if (!column) return;
    origin.current = { x: e.clientX, y: e.clientY, colWidth: column.getBoundingClientRect().width };
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

    const days = Math.max(-dayIndex, Math.min(dayCount - 1 - dayIndex, Math.round(dx / o.colWidth)));
    const snapped = Math.round(dy / pxPerMin / SNAP_MIN) * SNAP_MIN;
    const minutes = Math.max(-startMin, Math.min(DAY_MIN - lengthMin - startMin, snapped));
    const next = { days, minutes, x: days * o.colWidth, y: minutes * pxPerMin, from: position, saving: false };
    latest.current = next;
    setOffset(next);
  };

  const finish = async () => {
    const drop = latest.current;
    origin.current = null;
    latest.current = null;
    if (!dragged.current || !drop || (drop.days === 0 && drop.minutes === 0)) {
      setOffset(null);
      return;
    }
    // Stay where it was dropped while saving; the refreshed page then draws it there for real.
    setOffset({ ...drop, saving: true });
    try {
      await moveBlockAction(blockId, drop.days, drop.minutes);
    } catch (error) {
      setOffset(null);
      window.alert(`Could not move the block: ${(error as Error).message}`);
    }
  };

  const cancel = () => {
    origin.current = null;
    latest.current = null;
    setOffset(null);
  };

  // A drag ends with a click on the same element; it must not open the day.
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!dragged.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragged.current = false;
  };

  const newStart = startMin + (active?.minutes ?? 0);
  return (
    <Link
      href={href}
      draggable={false}
      className={`${className} cursor-grab touch-none select-none ${active ? 'z-20 cursor-grabbing opacity-90 shadow-lg ring-2 ring-accent' : ''} ${
        active?.saving ? 'animate-pulse' : ''
      }`}
      style={active ? { ...style, transform: `translate(${active.x}px, ${active.y}px)` } : style}
      title="Drag to move · click to open the day"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onClickCapture={onClickCapture}
    >
      {active && (
        <span className="absolute bottom-0.5 right-0.5 z-30 whitespace-nowrap rounded bg-foreground px-1 py-px text-[10px] font-medium tabular-nums text-background shadow">
          {clock(newStart)} – {clock(newStart + lengthMin)}
          {active.days !== 0 && ` · ${active.days > 0 ? '+' : ''}${active.days}d`}
        </span>
      )}
      {children}
    </Link>
  );
}
