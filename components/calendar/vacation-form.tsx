'use client';

import { useActionState } from 'react';
import { saveVacationAction, type VacationFormState } from '@/app/actions/vacation';
import { Button } from '@/components/ui';
import type { WindowLegend } from '@/lib/calendar/bands';
import { ANYTIME } from '@/lib/vacation';

const INPUT = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent';

export interface VacationValues {
  /** Set when editing an existing vacation. */
  id?: number;
  /** datetime-local values. */
  from: string;
  until: string;
  /** Windows it closes (null = Anytime); undefined = all, for a new vacation. */
  windowIds?: (number | null)[];
  note: string | null;
  /** Also kept as an event in Google Calendar. */
  inGoogle?: boolean;
  /** Set when turning a Google event into a vacation: that occurrence's key. */
  sourceEvent?: string;
}

/**
 * The vacation form, for Set vacation and for editing one in the side panel:
 * from, until, the windows it closes, and a note.
 */
export function VacationForm({
  windows,
  initial,
  submitLabel,
  onSaved,
  onCancel,
  googleConnected,
}: {
  windows: WindowLegend[];
  initial: VacationValues;
  /** Without a connection the Google box is shown but cannot be ticked. */
  googleConnected: boolean;
  submitLabel: string;
  /** Called with the vacation's id and its first local date. */
  onSaved?: (id: number, date: string) => void;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState<VacationFormState, FormData>(async (prev, form) => {
    const result = await saveVacationAction(prev, form);
    if (result.kind === 'saved') onSaved?.(result.id, result.date);
    return result;
  }, { kind: 'idle' });

  const closes = (id: number | null) => initial.windowIds === undefined || initial.windowIds.includes(id);

  return (
    <form action={action} className="space-y-3 text-sm">
      {initial.id !== undefined && <input type="hidden" name="id" value={initial.id} />}
      {initial.sourceEvent && <input type="hidden" name="sourceEvent" value={initial.sourceEvent} />}
      <div className="grid gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">From</span>
          <input type="datetime-local" name="from" required defaultValue={initial.from} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Until</span>
          <input type="datetime-local" name="to" required defaultValue={initial.until} className={INPUT} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-muted">Unavailable for</legend>
        <div className="space-y-1">
          {windows.map((w) => (
            <label key={w.id} className="flex items-center gap-2">
              <input type="checkbox" name="window" value={w.id} defaultChecked={closes(w.id)} style={{ accentColor: w.color }} />
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: w.color }} aria-hidden />
              <span className="flex-1">{w.name}</span>
              <span className="text-xs tabular-nums text-muted">
                {w.start}–{w.end}
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="window" value={ANYTIME} defaultChecked={closes(null)} />
            <span className="flex-1">Work with no window (Anytime)</span>
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Note (optional)</span>
        <input name="note" placeholder="e.g. Crete" defaultValue={initial.note ?? ''} className={INPUT} />
      </label>

      <label className={`flex items-start gap-2 ${googleConnected ? '' : 'opacity-60'}`}>
        <input type="checkbox" name="google" defaultChecked={initial.inGoogle ?? false} disabled={!googleConnected} className="mt-0.5" />
        <span>
          Also show in Google Calendar
          <span className="block text-xs text-muted">
            {googleConnected
              ? 'As an event in the “TimeBlock — Focus” calendar, kept in step when you edit or delete the vacation.'
              : 'Connect Google Calendar in Settings to use this.'}
          </span>
        </span>
      </label>

      <p className="text-xs text-muted">
        Nothing is planned in the ticked windows while you are away. An end of 23:59 covers the whole last day. Run{' '}
        <strong>Reschedule…</strong> afterwards to move work already planned there.
      </p>
      {state.kind === 'error' && <p className="text-xs text-red-500">{state.message}</p>}
      {state.kind === 'saved' && state.warning && <p className="text-xs text-amber-600">{state.warning}</p>}
      {state.kind === 'saved' && !state.warning && initial.id !== undefined && <p className="text-xs text-emerald-600">Saved.</p>}

      <div className="flex gap-2">
        <Button tone="primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button tone="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
