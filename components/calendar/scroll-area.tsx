'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * The time grid's scroll box. Like Google Calendar, it opens scrolled to where
 * the day's action is instead of at the first visible hour.
 */
export function ScrollArea({ initialTop, className, children }: { initialTop: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = initialTop;
  }, [initialTop]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
