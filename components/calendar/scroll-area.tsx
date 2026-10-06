'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * The time grid's scroll box. Like Google Calendar, it opens scrolled to where
 * the day's action is instead of at the first visible hour.
 *
 * It scrolls there when it appears and when `resetKey` changes (another view or
 * date) — not when the calendar merely refreshes itself, which would pull the
 * grid out from under whoever is reading it.
 */
export function ScrollArea({
  initialTop,
  resetKey,
  className,
  children,
}: {
  initialTop: number;
  resetKey: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const top = useRef(initialTop);
  useLayoutEffect(() => {
    top.current = initialTop;
  }, [initialTop]);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = top.current;
  }, [resetKey]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
