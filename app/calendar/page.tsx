import Link from 'next/link';
import { DateTime } from 'luxon';
import { CalendarHeader, FilterPanel } from '@/components/calendar/calendar-chrome';
import { MonthGrid } from '@/components/calendar/month-grid';
import { TimeGrid } from '@/components/calendar/time-grid';
import { PlanningPanel } from '@/components/planning-panel';
import { loadCalendarView } from '@/lib/calendar/load';
import { parseView } from '@/lib/calendar/views';
import { busySpans } from '@/lib/google/calendar';
import { loadDay } from '@/lib/planner';
import { getSettings } from '@/lib/repo/settings';
import { nowIn } from '@/lib/time/periods';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const params = await searchParams;
  const settings = await getSettings();
  const zone = settings.timezone;

  const view = parseView(params.view) ?? parseView(settings.calendarView) ?? 'day';
  const asked = typeof params.date === 'string' ? params.date : null;
  const anchor = asked && DateTime.fromISO(asked, { zone }).isValid ? asked : nowIn(zone).toISODate()!;

  const data = await loadCalendarView(view, anchor);

  // The one-day view is where a day is planned: reuse the events just read.
  const day =
    view === 'day'
      ? await loadDay(anchor, { events: data.events, busy: busySpans(data.events), problem: data.problem })
      : null;

  return (
    <div className="space-y-5">
      <CalendarHeader data={data} />

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

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <FilterPanel data={data} />
        {view === 'month' ? <MonthGrid data={data} /> : <TimeGrid data={data} />}
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
