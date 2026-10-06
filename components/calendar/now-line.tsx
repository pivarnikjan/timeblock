'use client';

import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';

/** How often the line is moved. A minute is under a pixel at this scale. */
const TICK_MS = 30_000;

/**
 * The red line at the current time, in today's column. It follows this
 * computer's clock by itself — no reload, no request — so it is never more
 * than half a minute behind, however long the page stays open.
 *
 * `day` is the column's local date and `zone` the calendar's timezone; the
 * line shows only while that day is today there. `initialNow` is the time the
 * page was drawn with, so the first paint matches the server's.
 */
export function NowLine({
  day,
  zone,
  initialNow,
  startMin,
  endMin,
  pxPerMin,
}: {
  day: string;
  zone: string;
  initialNow: string;
  /** The minutes of the day the grid shows. */
  startMin: number;
  endMin: number;
  pxPerMin: number;
}) {
  const [now, setNow] = useState(() => DateTime.fromISO(initialNow, { zone }));

  useEffect(() => {
    const tick = () => setNow(DateTime.now().setZone(zone));
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    // A tab in the background is throttled: catch up the moment it is looked at again.
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [zone]);

  if (now.toISODate() !== day) return null;
  const top = now.hour * 60 + now.minute + now.second / 60 - startMin;
  if (top < 0 || top > endMin - startMin) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: top * pxPerMin }} aria-label={`Now, ${now.toFormat('HH:mm')}`}>
      <div className="relative h-0.5 bg-[#ea4335]">
        <span className="absolute -left-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-[#ea4335]" />
      </div>
    </div>
  );
}
