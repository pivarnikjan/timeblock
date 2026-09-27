import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { CalendarData, CalendarItem } from '@/lib/calendar/load';
import { calendarHref } from '@/lib/calendar/views';

/**
 * Colours for a calendar item, the way Google draws them: solid event colour
 * with contrasting text; declined events outlined and struck through; drafts
 * (not yet in Google) dashed and tinted. A placeholder — time planning may use —
 * is hatched, so it reads as held rather than taken.
 */
export function chipStyle(item: CalendarItem): { style: CSSProperties; className: string } {
  if (item.declined) {
    return { style: { borderColor: item.color, color: item.color }, className: 'border bg-surface line-through' };
  }
  if (item.draft) {
    return {
      style: { borderColor: item.color, backgroundColor: `${item.color}26`, color: 'var(--foreground)' },
      className: 'border border-dashed',
    };
  }
  if (item.placeholder) {
    return {
      style: {
        borderColor: item.color,
        color: 'var(--foreground)',
        backgroundImage: `repeating-linear-gradient(135deg, ${item.color}33 0 6px, ${item.color}12 6px 12px)`,
      },
      className: 'border border-dashed',
    };
  }
  return { style: { backgroundColor: item.color, color: item.textColor }, className: 'border border-transparent' };
}

/** Where clicking an item goes: the same view, with the item open in the side panel. */
export function itemHref(data: CalendarData, item: CalendarItem): string {
  return calendarHref(data.range.view, data.range.anchor, item.id);
}

/** An item on the calendar; clicking it opens the side panel. The open item is outlined. */
export function ItemLink({
  data,
  item,
  children,
  className = '',
  style,
}: {
  data: CalendarData;
  item: CalendarItem;
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const selected = data.selected === item.id;
  return (
    <Link
      href={itemHref(data, item)}
      scroll={false}
      className={`${className} ${selected ? 'ring-2 ring-foreground ring-offset-1 ring-offset-surface' : ''}`}
      style={style}
      aria-current={selected ? 'true' : undefined}
    >
      {children}
    </Link>
  );
}
