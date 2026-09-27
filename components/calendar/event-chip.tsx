import Link from 'next/link';
import type { CSSProperties } from 'react';
import { toggleEventAction } from '@/app/actions/calendar';
import type { CalendarItem } from '@/lib/calendar/load';
import { ToggleForm } from './toggle';

/**
 * Colours for a calendar item, the way Google draws them: solid event colour
 * with contrasting text; declined events outlined and struck through; drafts
 * (not yet in Google) dashed and tinted.
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
  return { style: { backgroundColor: item.color, color: item.textColor }, className: 'border border-transparent' };
}

/**
 * The per-event checkbox: untick to hide the event — for a repeating event,
 * every repeat. It only appears while the pointer is over the event (or it has
 * keyboard focus), so a busy calendar is not a wall of checkboxes. The element
 * it sits in needs the `group` class.
 */
export function HideToggle({ item }: { item: CalendarItem }) {
  if (!item.hideKey) return null;
  return (
    <ToggleForm
      action={toggleEventAction}
      checked
      fields={{ eventKey: item.hideKey, title: item.title }}
      title="Untick to hide (all repeats of this event)"
      className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
    />
  );
}

/** Blocks link to the day they belong to, where they are ticked off. */
export function PlanLink({
  item,
  children,
  className,
  style,
}: {
  item: CalendarItem;
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return item.planDate ? (
    <Link href={`/calendar?view=day&date=${item.planDate}`} className={className} style={style}>
      {children}
    </Link>
  ) : (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
