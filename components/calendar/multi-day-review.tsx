import Link from 'next/link';
import { DateTime } from 'luxon';
import { setNotVacationAction } from '@/app/actions/calendar';
import { matchEventAction } from '@/app/actions/vacation';
import type { CalendarData } from '@/lib/calendar/load';
import { spanLabel, type MultiDayReview } from '@/lib/calendar/multi-day';
import { calendarHref } from '@/lib/calendar/views';
import { formInputs } from '@/lib/vacation';
import { VacationForm } from './vacation-form';

const LINK = 'text-accent underline underline-offset-2';

/**
 * Multi-day events that need a decision, above the calendar: is it a vacation?
 * Each can be answered here or in the event's own panel. Converted vacations
 * whose event has moved in Google are listed too, to be brought back in step.
 */
export function MultiDayReviewList({ data, reviews }: { data: CalendarData; reviews: MultiDayReview[] }) {
  if (reviews.length === 0) return null;
  const undecided = reviews.filter((r) => r.kind === 'undecided').length;
  const moved = reviews.length - undecided;

  return (
    <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
      <div>
        <h2 className="font-medium">
          {[
            undecided > 0 && `${undecided} multi-day event${undecided === 1 ? '' : 's'} need${undecided === 1 ? 's' : ''} your decision — is it a vacation?`,
            moved > 0 && `${moved} vacation${moved === 1 ? '' : 's'} no longer match${moved === 1 ? 'es' : ''} ${moved === 1 ? 'its' : 'their'} event in Google.`,
          ]
            .filter(Boolean)
            .join(' ')}
        </h2>
        {undecided > 0 && (
          <p className="mt-0.5 text-xs text-muted">
            Until you decide, a busy one blocks every window and a free one (most all-day events) blocks none — so work may be
            planned into time you are away. A vacation closes just the windows you choose; the event then no longer counts
            as busy.
          </p>
        )}
      </div>
      <ul className="space-y-2">
        {reviews.map((r) => (
          <li key={r.occurrence} className="rounded-md border border-border bg-surface px-3 py-2">
            {r.kind === 'undecided' ? <Undecided data={data} review={r} /> : <Moved data={data} review={r} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function openHref(data: CalendarData, review: MultiDayReview, item: string): string {
  const date = DateTime.fromISO(review.start).setZone(data.zone).toISODate()!;
  return calendarHref(data.range.view, date, item);
}

function Undecided({ data, review: r }: { data: CalendarData; review: MultiDayReview }) {
  const start = DateTime.fromISO(r.start).setZone(data.zone);
  const end = DateTime.fromISO(r.end).setZone(data.zone);
  return (
    <div className="space-y-1.5">
      <p>
        <strong>{r.title}</strong> · <span className="text-muted">{spanLabel(r.start, r.end, r.allDay, data.zone)}</span>
        {r.repeats > 1 && (
          <span className="text-xs text-muted"> · repeats ({r.repeats}× in the next three months — one answer covers them all)</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <details className="group">
          <summary className={`cursor-pointer ${LINK}`}>Vacation…</summary>
          <div className="mt-2 max-w-sm rounded-md border border-border p-3">
            <VacationForm
              windows={data.windows}
              initial={{ ...formInputs(start, end), note: r.title, sourceEvent: r.occurrence }}
              submitLabel={r.repeats > 1 ? 'Make this one a vacation' : 'Make it a vacation'}
              googleConnected={data.connection.status === 'connected'}
            />
          </div>
        </details>
        <form action={setNotVacationAction}>
          <input type="hidden" name="key" value={r.key} />
          <input type="hidden" name="title" value={r.title} />
          <input type="hidden" name="not" value="1" />
          <button type="submit" className={LINK} title="It stays as Google has it (busy or free), and is not asked about again">
            Not a vacation
          </button>
        </form>
        <Link href={openHref(data, r, `${r.calendarId}:${r.eventId}`)} scroll={false} className={LINK}>
          Open event
        </Link>
      </div>
    </div>
  );
}

function Moved({ data, review: r }: { data: CalendarData; review: MultiDayReview }) {
  const v = r.vacation!;
  return (
    <div className="space-y-1.5">
      <p>
        <strong>{r.title}</strong> moved in Google: the vacation is{' '}
        <span className="text-muted">{spanLabel(v.startsAt, v.endsAt, r.allDay, data.zone)}</span>, the event is now{' '}
        <span className="text-muted">{spanLabel(r.start, r.end, r.allDay, data.zone)}</span>.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <form action={matchEventAction}>
          <input type="hidden" name="id" value={v.id} />
          <input type="hidden" name="start" value={r.start} />
          <input type="hidden" name="end" value={r.end} />
          <button type="submit" className={LINK}>
            Move the vacation with it
          </button>
        </form>
        <Link href={openHref(data, r, `vacation:${v.id}`)} scroll={false} className={LINK}>
          Open vacation
        </Link>
      </div>
    </div>
  );
}
