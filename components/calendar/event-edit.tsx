'use client';

import { useActionState } from 'react';
import { editEventTimeAction, setEventCategoryAction, type EventEditState } from '@/app/actions/calendar';
import { Button } from '@/components/ui';

const INPUT = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent';

function Outcome({ state }: { state: EventEditState }) {
  if (state.kind === 'error') return <p className="text-xs text-red-500">{state.message}</p>;
  if (state.kind === 'saved' && state.warning) return <p className="text-xs text-amber-600">{state.warning}</p>;
  if (state.kind === 'saved') return <p className="text-xs text-emerald-600">Saved.</p>;
  return null;
}

/**
 * An event's category: one chosen by hand (on the series, so every repeat
 * follows), none on purpose, or whatever the title words say. The colour
 * follows on the calendar and in Google.
 */
export function EventCategoryForm({
  eventKey,
  title,
  categories,
  current,
  source,
  recurring,
}: {
  eventKey: string;
  title: string;
  categories: { id: number; name: string; color: string }[];
  current: { id: number; name: string } | null;
  source: 'chosen' | 'rule' | null;
  recurring: boolean;
}) {
  const [state, action, pending] = useActionState<EventEditState, FormData>(setEventCategoryAction, { kind: 'idle' });
  const selected = source === 'chosen' ? (current ? String(current.id) : 'none') : 'rules';
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="key" value={eventKey} />
      <input type="hidden" name="title" value={title} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Category</span>
        <div className="flex gap-2">
          <select key={selected} name="choice" defaultValue={selected} className={INPUT}>
            <option value="rules">By title words{source === 'rule' && current ? ` (${current.name})` : ' (none matches)'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">No category</option>
          </select>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </label>
      <p className="text-xs text-muted">
        Its colour follows the category, here and in Google Calendar{recurring ? ' — for every repeat' : ''}. Categories are set up in Settings.
      </p>
      <Outcome state={state} />
    </form>
  );
}

/**
 * Moves a Google event: a new day, start and end. A repeating event asks
 * whether this occurrence moves, or this and every following one.
 */
export function EventTimeForm({
  calendarId,
  eventId,
  seriesId,
  date,
  start,
  end,
  recurring,
}: {
  calendarId: string;
  eventId: string;
  seriesId: string;
  date: string;
  start: string;
  end: string;
  recurring: boolean;
}) {
  const [state, action, pending] = useActionState<EventEditState, FormData>(editEventTimeAction, { kind: 'idle' });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="calendarId" value={calendarId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="seriesId" value={seriesId} />
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">Day</span>
          <input type="date" name="date" required defaultValue={date} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">From</span>
          <input type="time" name="startTime" required defaultValue={start} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Until</span>
          <input type="time" name="endTime" required defaultValue={end} className={INPUT} />
        </label>
      </div>
      {recurring && (
        <fieldset className="space-y-1 text-xs">
          <legend className="mb-1 font-medium text-muted">It repeats — change</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="this" defaultChecked /> This event only
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="following" /> This and all following events
          </label>
        </fieldset>
      )}
      <p className="text-xs text-muted">Changed in Google Calendar. Run Reschedule… afterwards if planned work is in the way.</p>
      <Outcome state={state} />
      <Button type="submit" tone="primary" disabled={pending}>
        {pending ? 'Saving…' : 'Change time'}
      </Button>
    </form>
  );
}
