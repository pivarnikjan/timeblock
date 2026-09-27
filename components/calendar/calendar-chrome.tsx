import Link from 'next/link';
import { restoreEventsAction, toggleMultiDayOnlyAction, togglePlanAction, toggleWindowsFrontAction } from '@/app/actions/calendar';
import { energyColor } from '@/lib/calendar/colors';
import type { CalendarData } from '@/lib/calendar/load';
import { VIEW_LABEL, VIEWS } from '@/lib/calendar/views';
import { ToggleForm } from './toggle';

const href = (view: string, date: string) => `/calendar?view=${view}&date=${date}`;

/** Title, ‹ › arrows, jump-to-today, and the view switcher. */
export function CalendarHeader({ data }: { data: CalendarData }) {
  const { range, today } = data;
  const showsToday = range.days.includes(today) && (range.month === null || today.startsWith(range.month));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <IconLink href={href(range.view, range.prev)} label="Previous">
          ‹
        </IconLink>
        <IconLink href={href(range.view, range.next)} label="Next">
          ›
        </IconLink>
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{range.title}</h1>
      {!showsToday && (
        <Link
          href={href(range.view, today)}
          className="rounded-md border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
        >
          Back to today
        </Link>
      )}

      <nav className="ml-auto flex overflow-hidden rounded-md border border-border text-sm" aria-label="Calendar view">
        {VIEWS.map((view) => (
          <Link
            key={view}
            // "Today" opens the one-day view on today; the others keep the date you are looking at.
            href={href(view, view === 'day' && range.view !== 'day' ? today : range.anchor)}
            className={`px-3 py-1.5 ${
              view === range.view ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-foreground'
            } ${view !== VIEWS[0] ? 'border-l border-border' : ''}`}
            aria-current={view === range.view ? 'page' : undefined}
          >
            {VIEW_LABEL[view]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function IconLink({ href: to, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-muted hover:bg-border/60 hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/**
 * The left-hand panel: TimeBlock's own plan, the time windows with their
 * colours (and whether they sit behind or in front of the blocks), the "only
 * multi-day events" switch for the current view, and the events hidden one by
 * one — each a click away from coming back. Which Google calendars are shown
 * rarely changes, so that choice lives in Settings → Calendar.
 */
export function FilterPanel({ data }: { data: CalendarData }) {
  const multiOnly = data.filters.multiDayOnly.includes(data.view);
  const hidden = Object.entries(data.filters.hiddenEvents);

  return (
    <aside className="space-y-5 text-sm">
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Show</h2>
        <ul className="space-y-1.5">
          <li>
            <ToggleForm
              action={togglePlanAction}
              checked={!data.filters.hidePlan}
              fields={{}}
              color={energyColor('deep')}
              label={<span>TimeBlock plan</span>}
              title="Blocks planned by TimeBlock"
            />
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          {data.connection.status === 'connected' ? (
            <>
              Google calendars: {data.calendars.filter((c) => !c.hidden).length} of {data.calendars.length} shown ·{' '}
              <Link href="/settings#calendar" className="underline">
                choose
              </Link>
            </>
          ) : (
            <>
              Google calendars appear once <Link href="/settings" className="underline">connected</Link>.
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Time windows</h2>
        {data.windows.length === 0 ? (
          <p className="text-xs text-muted">
            None yet — add them in <Link href="/settings" className="underline">Settings</Link>.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {data.windows.map((w) => (
                <li key={w.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: w.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {w.start}–{w.end}
                  </span>
                </li>
              ))}
            </ul>
            <ToggleForm
              action={toggleWindowsFrontAction}
              checked={data.filters.windowsInFront}
              fields={{}}
              className="mt-2"
              label={<span>Show in front</span>}
              title="Draw the windows and their names over the blocks"
            />
            <p className="mt-1 pl-5 text-xs text-muted">
              Colours are set in <Link href="/settings#windows" className="underline">Settings</Link>.
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Focus</h2>
        <ToggleForm
          action={toggleMultiDayOnlyAction}
          checked={multiOnly}
          fields={{ view: data.view }}
          label={<span>Only multi-day events</span>}
          title="Show only events that span several days in this view"
        />
        <p className="mt-1 pl-5 text-xs text-muted">Remembered separately for each view.</p>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Hidden events{hidden.length > 0 ? ` (${hidden.length})` : ''}
        </h2>
        {hidden.length === 0 ? (
          <p className="text-xs text-muted">
            Point at an event and untick its box to hide it. A repeating event hides every time it repeats.
          </p>
        ) : (
          <>
            <ul className="space-y-0.5">
              {hidden.map(([key, title]) => (
                <li key={key}>
                  <form action={restoreEventsAction} className="flex items-center gap-1">
                    <input type="hidden" name="eventKey" value={key} />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted" title={title}>
                      {title || '(no title)'}
                    </span>
                    <button type="submit" className="shrink-0 text-xs text-accent hover:underline">
                      show
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {hidden.length > 1 && (
              <form action={restoreEventsAction} className="mt-1.5">
                <button type="submit" className="text-xs text-accent hover:underline">
                  Show all
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </aside>
  );
}
