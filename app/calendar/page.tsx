import Link from 'next/link';
import { DateTime } from 'luxon';
import { CalendarHeader, FilterPanel } from '@/components/calendar/calendar-chrome';
import { EventPanel } from '@/components/calendar/event-panel';
import { MonthGrid } from '@/components/calendar/month-grid';
import { PlanCalendarBar } from '@/components/plan-calendar-bar';
import { TimeGrid } from '@/components/calendar/time-grid';
import { PlanningPanel } from '@/components/planning-panel';
import { loadCalendarView } from '@/lib/calendar/load';
import { vacationConflicts } from '@/lib/calendar/vacation-conflicts';
import { parseView } from '@/lib/calendar/views';
import { busySpans } from '@/lib/google/calendar';
import { loadDay } from '@/lib/planner';
import * as blockRepo from '@/lib/repo/blocks';
import { getVacation } from '@/lib/repo/vacations';
import { getSettings } from '@/lib/repo/settings';
import { nowIn } from '@/lib/time/periods';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const params = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;

  const view = parseView(params.view) ?? parseView(settings.calendarView) ?? 'week';
  const asked = typeof params.date === 'string' ? params.date : null;
  const anchor = asked && DateTime.fromISO(asked, { zone }).isValid ? asked : nowIn(zone).toISODate()!;

  const askedItem = typeof params.item === 'string' ? params.item : null;
  const [data, draftDates] = await Promise.all([
    loadCalendarView(view, anchor, askedItem),
    blockRepo.draftDatesFrom(nowIn(zone).toISODate()!),
  ]);
  // The clicked item, if it is still there (a deleted or hidden one simply closes the panel).
  const selected = data.items.find((i) => i.id === askedItem) ?? null;
  // An open vacation lists what is already scheduled during it (read for its whole span, not just this view).
  const vacation = selected?.vacation ? await getVacation(selected.vacation.id) : null;
  const conflicts = vacation ? await vacationConflicts(vacation, settings) : null;
  const drafts = {
    blocks: draftDates.reduce((n, d) => n + d.blocks, 0),
    days: draftDates.length,
    first: draftDates[0]?.date ?? null,
    last: draftDates.at(-1)?.date ?? null,
  };

  // The one-day view is where a day is planned: reuse the events just read.
  const day =
    view === 'day'
      ? await loadDay(anchor, { events: data.events, busy: busySpans(data.events, data.placeholders), problem: data.problem })
      : null;

  return (
    <div className="space-y-5">
      <CalendarHeader data={data} />
      <PlanCalendarBar drafts={drafts} googleConnected={data.connection.status === 'connected'} />

      {(data.connection.status === 'not-configured' || data.connection.status === 'not-connected') && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          Google Calendar is not connected — you see TimeBlock&apos;s plan only, and days are planned as if you had no
          meetings.{' '}
          <Link href="/settings" className="underline">
            Connect it in Settings
          </Link>
          .
        </p>
      )}
      {data.problem && (
        <p className="rounded-md border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          Could not read the calendar: {data.problem}
        </p>
      )}

      <div
        className={`grid gap-5 ${
          !selected
            ? 'lg:grid-cols-[13rem_minmax(0,1fr)]'
            : selected.kind === 'vacation'
              ? 'lg:grid-cols-[13rem_minmax(0,1fr)_22rem]'
              : 'lg:grid-cols-[13rem_minmax(0,1fr)_19rem]'
        }`}
      >
        <FilterPanel data={data} />
        {view === 'month' ? <MonthGrid data={data} /> : <TimeGrid data={data} />}
        {selected && <EventPanel key={selected.id} data={data} item={selected} conflicts={conflicts} />}
      </div>

      {day ? (
        <PlanningPanel day={day} />
      ) : (
        <p className="text-sm text-muted">
          Planning happens one day at a time — click a day&apos;s date, or choose <strong>Today</strong>, to review,
          generate and commit its blocks.
        </p>
      )}
    </div>
  );
}
