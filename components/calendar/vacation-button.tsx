'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteVacationAction } from '@/app/actions/vacation';
import type { WindowLegend } from '@timeblock/core/calendar/bands';
import { calendarHref, type CalendarView } from '@timeblock/core/calendar/views';
import { VacationForm } from './vacation-form';

/**
 * "Set vacation" beside the view switcher. It opens the vacation form right
 * below it; once saved, the new vacation opens in the side panel, which lists
 * what is already scheduled during it. Upcoming vacations are listed under the form.
 */
export function VacationButton({
  windows,
  upcoming,
  today,
  view,
  anchor,
  visible,
  googleConnected,
}: {
  windows: WindowLegend[];
  upcoming: { id: number; label: string; startDate: string }[];
  today: string;
  view: CalendarView;
  anchor: string;
  /** The dates on screen. */
  visible: string[];
  googleConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`rounded-md border px-3 py-1.5 text-sm ${open ? 'border-accent text-foreground' : 'border-border text-muted hover:text-foreground'}`}
      >
        🏖 Set vacation
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-border bg-surface p-4 text-sm shadow-xl">
          <VacationForm
            windows={windows}
            initial={{ from: `${today}T00:00`, until: `${today}T23:59`, note: null }}
            submitLabel="Save vacation"
            googleConnected={googleConnected}
            onSaved={(id, date) => {
              setOpen(false);
              // Show the week it starts in, with it open in the panel; stay put if it is already in view.
              router.push(calendarHref(view, visible.includes(date) ? anchor : date, `vacation:${id}`), { scroll: false });
            }}
            onCancel={() => setOpen(false)}
          />

          {upcoming.length > 0 && (
            <div className="border-t border-border pt-3">
              <h3 className="mb-1 text-xs font-medium text-muted">Upcoming</h3>
              <ul className="space-y-1">
                {upcoming.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left hover:underline"
                      title="Open it — edit, or see what is scheduled during it"
                      onClick={() => {
                        setOpen(false);
                        router.push(calendarHref(view, v.startDate, `vacation:${v.id}`), { scroll: false });
                      }}
                    >
                      {v.label}
                    </button>
                    <form action={deleteVacationAction}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="shrink-0 text-muted hover:text-red-500" title="Delete this vacation">
                        remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
