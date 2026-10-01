import Link from 'next/link';
import { deleteEventAction, setEventMarkAction, setNotVacationAction, toggleEventAction } from '@/app/actions/calendar';
import { deleteBlockAction, unpinBlockAction } from '@/app/actions/plan';
import { deleteVacationAction } from '@/app/actions/vacation';
import { ConfirmButton } from '@/components/confirm-button';
import { formatMinutes } from '@timeblock/core/hierarchy';
import type { CalendarData, CalendarItem } from '@/lib/calendar/load';
import type { Conflicts } from '@/lib/calendar/vacation-conflicts';
import { calendarHref } from '@timeblock/core/calendar/views';
import { formInputs } from '@timeblock/core/vacation';
import { EventCategoryForm, EventTimeForm } from './event-edit';
import { ToggleForm } from './toggle';
import { VacationCleanup } from './vacation-cleanup';
import { VacationForm } from './vacation-form';

/**
 * The panel beside the calendar for the item that was clicked: what it is and
 * when, and what can be done with it. A Google event can be marked important
 * (always in Month) or a placeholder (planning may use its time), hidden, or
 * deleted; a TimeBlock block can be opened in its day, unpinned, or deleted.
 */
export function EventPanel({ data, item, conflicts = null }: { data: CalendarData; item: CalendarItem; conflicts?: Conflicts | null }) {
  const close = calendarHref(data.range.view, data.range.anchor);
  return (
    <aside className="space-y-4 rounded-lg border border-border bg-surface p-4 text-sm lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />
        <h2 className="min-w-0 flex-1 break-words font-medium leading-snug">{item.title}</h2>
        <Link href={close} scroll={false} className="-mr-1 -mt-1 rounded px-1.5 text-lg leading-none text-muted hover:bg-background hover:text-foreground" aria-label="Close" title="Close">
          ×
        </Link>
      </div>

      <p className="text-muted">{when(item)}</p>

      {item.kind === 'event' ? (
        <EventDetails data={data} item={item} close={close} />
      ) : item.kind === 'vacation' ? (
        <VacationDetails data={data} item={item} close={close} conflicts={conflicts} />
      ) : (
        <BlockDetails item={item} close={close} />
      )}
    </aside>
  );
}

/** "Mon 28 Sep · 10:00 – 11:00", "All day · Mon 28 Sep", or a span of days. */
function when(item: CalendarItem): string {
  const day = (dt: CalendarItem['start']) => dt.toFormat('ccc d LLL');
  if (item.vacation) {
    const { start, end } = item.vacation;
    const endText = end.equals(end.startOf('day')) ? `${day(end.minus({ days: 1 }))} 24:00` : `${day(end)} ${end.toFormat('HH:mm')}`;
    return `${day(start)} ${start.toFormat('HH:mm')} – ${endText}`;
  }
  if (item.allDay) {
    const last = item.end.minus({ days: 1 });
    return item.start.hasSame(last, 'day') ? `All day · ${day(item.start)}` : `${day(item.start)} – ${day(last)}`;
  }
  if (!item.start.hasSame(item.end, 'day')) return `${day(item.start)} ${item.start.toFormat('HH:mm')} – ${day(item.end)} ${item.end.toFormat('HH:mm')}`;
  return `${day(item.start)} · ${item.start.toFormat('HH:mm')} – ${item.end.toFormat('HH:mm')}`;
}

function EventDetails({ data, item, close }: { data: CalendarData; item: CalendarItem; close: string }) {
  const key = item.hideKey!;
  return (
    <>
      <dl className="space-y-1 text-xs">
        {item.calendarName && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted">Calendar</dt>
            <dd className="min-w-0 break-words">{item.calendarName}</dd>
          </div>
        )}
        {item.recurring && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted">Repeats</dt>
            <dd>Marks and hiding apply to every repeat; delete removes only this one.</dd>
          </div>
        )}
        {item.declined && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted">Status</dt>
            <dd>Declined — never counts as busy.</dd>
          </div>
        )}
      </dl>
      {item.htmlLink && (
        <a href={item.htmlLink} target="_blank" rel="noreferrer" className="inline-block text-xs text-accent underline underline-offset-2">
          Open in Google Calendar ↗
        </a>
      )}

      {item.multiDay && <VacationQuestion data={data} item={item} />}

      <div className="border-t border-border pt-3">
        <EventCategoryForm
          eventKey={key}
          title={item.title}
          categories={data.categories}
          current={item.category}
          source={item.categorySource}
          recurring={item.recurring}
        />
      </div>

      {item.writable && !item.allDay && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">Edit time</summary>
          <div className="pt-3">
            <EventTimeForm
              key={`${item.id}|${item.start.toISO()}|${item.end.toISO()}`}
              calendarId={item.calendarId!}
              eventId={item.eventId!}
              seriesId={item.seriesId!}
              date={item.start.toISODate()!}
              start={item.start.toFormat('HH:mm')}
              end={item.end.toFormat('HH:mm')}
              recurring={item.recurring}
            />
          </div>
        </details>
      )}

      <div className="space-y-3 border-t border-border pt-3">
        <Mark
          label="★ Important in Month view"
          help="Always shown in Month, starred — even with “Only multi-day events” on."
          checked={item.important}
          fields={{ key, title: item.title, field: 'important' }}
        />
        <Mark
          label="Placeholder"
          help="Time held, not taken: Plan calendar and Generate the day may schedule work during it."
          checked={item.placeholder}
          fields={{ key, title: item.title, field: 'placeholder' }}
        />
        <div>
          <ToggleForm
            action={toggleEventAction}
            checked
            fields={{ eventKey: key, title: item.title }}
            label={<span>Show on the calendar</span>}
            title="Untick to hide (all repeats of this event)"
          />
          <p className="mt-0.5 pl-5 text-xs text-muted">
            Untick to hide it. Hidden events are listed in the left panel and in{' '}
            <Link href="/settings#calendar" className="underline">
              Settings
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        {item.writable ? (
          <form action={deleteEventAction}>
            <input type="hidden" name="calendarId" value={item.calendarId!} />
            <input type="hidden" name="eventId" value={item.eventId!} />
            <input type="hidden" name="returnTo" value={close} />
            <ConfirmButton
              tone="danger"
              className="!px-0"
              confirm={`Delete “${item.title}” from Google Calendar${item.recurring ? ' (this occurrence only)' : ''}? This cannot be undone here.`}
            >
              Delete from Google Calendar{item.recurring ? ' (this one)' : ''}
            </ConfirmButton>
          </form>
        ) : (
          <p className="text-xs text-muted">
            {data.connection.status === 'connected'
              ? 'This calendar is read-only for your account, so the event cannot be deleted here.'
              : 'Connect Google Calendar to delete events.'}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * A multi-day event's one question: is it a vacation? Made into one, it stops
 * counting as busy and the vacation closes just the windows chosen; said not to
 * be, it stays as Google has it and is not asked about again.
 */
function VacationQuestion({ data, item }: { data: CalendarData; item: CalendarItem }) {
  const LINK = 'text-accent underline underline-offset-2';
  if (item.madeVacationId !== null) {
    return (
      <div className="space-y-1 border-t border-border pt-3 text-xs">
        <p>🏖 Made into a vacation — it no longer counts as busy; the vacation closes the windows you chose.</p>
        <Link href={calendarHref(data.range.view, data.range.anchor, `vacation:${item.madeVacationId}`)} scroll={false} className={LINK}>
          Open the vacation
        </Link>
      </div>
    );
  }
  const decided = item.notVacation || item.placeholder;
  return (
    <div className="space-y-2 border-t border-border pt-3 text-xs">
      {decided ? (
        <div className="text-muted">
          {item.notVacation ? 'Not a vacation, as you said' : 'A placeholder'} — it is not asked about again.
          {item.notVacation && (
            <form action={setNotVacationAction} className="inline">
              <input type="hidden" name="key" value={item.hideKey!} />
              <input type="hidden" name="title" value={item.title} />
              <input type="hidden" name="not" value="0" />{' '}
              <button type="submit" className={LINK}>
                Ask again
              </button>
            </form>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
          <strong>Is this a vacation?</strong> Until you say, it {item.busy ? 'blocks every window while it lasts' : 'blocks nothing — it is marked free, so work may be planned into it'}.
        </p>
      )}
      <details>
        <summary className={`cursor-pointer ${LINK}`}>Make {item.recurring ? 'this one ' : 'it '}a vacation…</summary>
        <div className="pt-3">
          <VacationForm
            windows={data.windows}
            initial={{ ...formInputs(item.start, item.end), note: item.title, sourceEvent: item.occurrence! }}
            submitLabel="Make it a vacation"
            googleConnected={data.connection.status === 'connected'}
          />
        </div>
      </details>
      {!decided && (
        <form action={setNotVacationAction}>
          <input type="hidden" name="key" value={item.hideKey!} />
          <input type="hidden" name="title" value={item.title} />
          <input type="hidden" name="not" value="1" />
          <button type="submit" className={LINK} title="It stays as Google has it, and is not asked about again">
            Not a vacation{item.recurring ? ' (every repeat)' : ''}
          </button>
        </form>
      )}
    </div>
  );
}

function Mark({ label, help, checked, fields }: { label: string; help: string; checked: boolean; fields: Record<string, string> }) {
  return (
    <div>
      <ToggleForm action={setEventMarkAction} checked={checked} fields={fields} label={<span>{label}</span>} title={help} />
      <p className="mt-0.5 pl-5 text-xs text-muted">{help}</p>
    </div>
  );
}

function BlockDetails({ item, close }: { item: CalendarItem; close: string }) {
  const state = item.blockState === 'draft' ? 'Draft — not in Google yet' : item.blockState === 'done' ? 'Kept as history' : 'In Google Calendar';
  return (
    <>
      <p className="text-xs text-muted">
        TimeBlock block · {state}
        {item.pinned && ' · 📌 placed by hand'}
      </p>
      <ul className="space-y-1 border-t border-border pt-3">
        {item.segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${s.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'}`}>
              {s.done ? '✓' : ''}
            </span>
            <span className={`min-w-0 flex-1 ${s.done ? 'text-muted line-through' : ''}`}>{s.title}</span>
            <span className="text-xs tabular-nums text-muted">{formatMinutes(s.minutes)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
        <Link href={calendarHref('day', item.planDate!)} className="text-accent underline underline-offset-2">
          Tick off in the day →
        </Link>
        {item.pinned && item.blockState !== 'done' && (
          <form action={unpinBlockAction}>
            <input type="hidden" name="blockId" value={item.blockId!} />
            <button type="submit" className="text-accent underline underline-offset-2" title="Let the next plan move or replace this block">
              Unpin
            </button>
          </form>
        )}
      </div>
      <div className="border-t border-border pt-3">
        {item.movable ? (
          <form action={deleteBlockAction}>
            <input type="hidden" name="blockId" value={item.blockId!} />
            <input type="hidden" name="returnTo" value={close} />
            <ConfirmButton
              tone="danger"
              className="!px-0"
              confirm={
                item.blockState === 'synced'
                  ? 'Delete this block and its event in Google Calendar? Its tasks are planned again next time.'
                  : 'Delete this draft block? Its tasks are planned again next time.'
              }
            >
              Delete block{item.blockState === 'synced' ? ' (and its Google event)' : ''}
            </ConfirmButton>
          </form>
        ) : (
          <p className="text-xs text-muted">Has ticked-off work, so it stays as a record of what was done.</p>
        )}
      </div>
    </>
  );
}

/** A vacation: the windows it closes, and a way to remove it. */
function VacationDetails({
  data,
  item,
  close,
  conflicts,
}: {
  data: CalendarData;
  item: CalendarItem;
  close: string;
  conflicts: Conflicts | null;
}) {
  const v = item.vacation!;
  return (
    <>
      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs text-muted">Unavailable for</p>
        <p>{v.windows.length > 0 ? v.windows.join(', ') : 'no windows'}</p>
        <p className="text-xs text-muted">Nothing is planned in these windows while you are away; other windows work as usual.</p>
        <p className="pt-1 text-xs">
          {v.inGoogle && v.inGoogleNow
            ? '📅 Also in Google Calendar (TimeBlock — Focus).'
            : v.inGoogle
              ? '📅 Meant to be in Google Calendar, but not there yet — save it again to retry.'
              : 'Not in Google Calendar — tick “Also show in Google Calendar” under Edit to add it.'}
        </p>
      </div>

      {conflicts && (
        <div className="border-t border-border pt-3">
          <VacationCleanup items={conflicts.items} problem={conflicts.problem} />
        </div>
      )}

      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">Edit dates, windows or note</summary>
        <div className="pt-3">
          <VacationForm
            key={`${v.from}|${v.until}|${v.windowIds.join(',')}|${v.note ?? ''}|${v.inGoogle}`}
            windows={data.windows}
            initial={{ id: v.id, from: v.from, until: v.until, windowIds: v.windowIds, note: v.note, inGoogle: v.inGoogle }}
            submitLabel="Save changes"
            googleConnected={data.connection.status === 'connected'}
          />
        </div>
      </details>

      <div className="border-t border-border pt-3">
        <form action={deleteVacationAction}>
          <input type="hidden" name="id" value={v.id} />
          <input type="hidden" name="returnTo" value={close} />
          <ConfirmButton tone="danger" className="!px-0" confirm="Delete this vacation? Its windows open again for planning.">
            Delete vacation
          </ConfirmButton>
        </form>
      </div>
    </>
  );
}
