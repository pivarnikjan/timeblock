'use client';

import { DateTime } from 'luxon';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { refreshCalendarAction } from '@/app/actions/calendar';

/** Coming back to the tab refreshes the calendar, unless it was refreshed this recently. */
const ON_RETURN_AFTER_MS = 3 * 60 * 1000;
/** While the tab stays in view, the calendar refreshes itself this often. */
const WHILE_VISIBLE_MS = 10 * 60 * 1000;
const CHECK_MS = 60 * 1000;

/**
 * Keeps the open Calendar current without a reload: it draws itself again when
 * you come back to the tab, every ten minutes while it is in view, and when the
 * day changes — never while the tab is in the background. Those refreshes reuse
 * what was read from Google in the last few minutes (see `GOOGLE_READS_FRESH_MS`),
 * so they cost few requests or none.
 *
 * **Refresh** reads Google again now — for a meeting just added there. Beside
 * it, when Google was last actually read.
 */
export function CalendarRefresh({
  zone,
  today,
  googleReadAt,
  connected,
}: {
  zone: string;
  /** The local date the page was drawn for. */
  today: string;
  /** When Google Calendar was last read (ISO), if it has been. */
  googleReadAt: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const drawnAt = useRef(0);

  // Every time the server draws the page again — by any route — the clock starts over.
  useEffect(() => {
    drawnAt.current = Date.now();
  }, [googleReadAt, today]);

  useEffect(() => {
    const redraw = () => {
      drawnAt.current = Date.now();
      router.refresh();
    };
    const due = (after: number) => document.visibilityState === 'visible' && Date.now() - drawnAt.current >= after;
    const onReturn = () => {
      if (due(ON_RETURN_AFTER_MS)) redraw();
    };
    const timer = window.setInterval(() => {
      // Past midnight the page is about yesterday: today's column and the plan move on.
      const dayChanged = DateTime.now().setZone(zone).toISODate() !== today;
      if (due(WHILE_VISIBLE_MS) || (dayChanged && due(CHECK_MS))) redraw();
    }, CHECK_MS);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [router, zone, today]);

  const readAt = googleReadAt ? DateTime.fromISO(googleReadAt, { zone }) : null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      {connected && readAt && (
        <span title="When Google Calendar was last read. The calendar refreshes itself; changes made in Google show within a few minutes.">
          Google read {readAt.toFormat('HH:mm')}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await refreshCalendarAction();
            drawnAt.current = Date.now();
          })
        }
        className="rounded-md border border-border px-2 py-1 hover:text-foreground disabled:opacity-50"
        title={connected ? 'Read Google Calendar again now' : 'Draw the calendar again now'}
      >
        {pending ? 'Refreshing…' : '↻ Refresh'}
      </button>
    </div>
  );
}
