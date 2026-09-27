'use client';

import { useActionState, useState } from 'react';
import { deleteDuringVacationAction, type CleanupState } from '@/app/actions/vacation';
import { Button } from '@/components/ui';
import type { Conflict } from '@/lib/calendar/vacation-conflicts';

/**
 * "Scheduled during this vacation": every event and block in its span, each
 * with a checkbox. Nothing is ticked to start with; the ticked ones are
 * deleted together — from Google Calendar too — after a confirmation.
 */
export function VacationCleanup({ items, problem }: { items: Conflict[]; problem: string | null }) {
  const deletable = items.filter((i) => i.deletable);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<CleanupState, FormData>(deleteDuringVacationAction, { kind: 'idle' });

  // Deleted items drop out of the list once the page refreshes; forget them.
  const live = new Set(items.map((i) => i.value));
  const chosen = [...picked].filter((v) => live.has(v));

  const toggle = (value: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const googleCount = chosen.filter((v) => items.find((i) => i.value === v)?.kind === 'event').length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 text-xs font-medium text-muted">Scheduled during this vacation ({items.length})</h3>
        {deletable.length > 0 && (
          <span className="space-x-2 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => setPicked(new Set(deletable.map((i) => i.value)))}>
              all
            </button>
            <button type="button" className="text-accent hover:underline" onClick={() => setPicked(new Set())}>
              none
            </button>
          </span>
        )}
      </div>

      {problem && <p className="text-xs text-amber-600">Google Calendar could not be read, so only TimeBlock blocks are listed: {problem}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-muted">Nothing is scheduled during it.</p>
      ) : (
        <form
          action={action}
          onSubmit={(e) => {
            const what = `${chosen.length} item${chosen.length === 1 ? '' : 's'}`;
            const google = googleCount > 0 ? ` ${googleCount} of them will be deleted from Google Calendar.` : '';
            if (!window.confirm(`Delete ${what}?${google} This cannot be undone here.`)) e.preventDefault();
          }}
          className="space-y-2"
        >
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.value}>
                <label
                  className={`flex items-start gap-2 rounded px-1 py-0.5 ${item.deletable ? 'cursor-pointer hover:bg-background' : 'opacity-60'}`}
                  title={item.why ?? undefined}
                >
                  <input
                    type="checkbox"
                    name="item"
                    value={item.value}
                    checked={chosen.includes(item.value)}
                    onChange={() => toggle(item.value)}
                    disabled={!item.deletable}
                    className="mt-0.5"
                  />
                  <input type="hidden" name={`title:${item.value}`} value={item.title} />
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.title}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {item.when} · {item.source}
                      {item.recurring && ' · this repeat only'}
                      {item.why && ` · ${item.why}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {state.kind === 'done' && (
            <p className={`text-xs ${state.failed.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              Deleted {state.deleted}.
              {state.failed.map((f) => ` Could not delete “${f.title}”: ${f.message}.`).join('')}
            </p>
          )}

          <Button tone="danger" type="submit" disabled={pending || chosen.length === 0} className="!px-0">
            {pending ? 'Deleting…' : chosen.length > 0 ? `Delete ${chosen.length} selected` : 'Tick what to delete'}
          </Button>
        </form>
      )}
    </div>
  );
}
