'use client';

import { DateTime } from 'luxon';
import { useState } from 'react';
import { Button } from '@/components/ui';
import type { EditTarget } from './edit-target';
import { formatSpan, ScopeChoice, usePendingEdits } from './pending-edits';

const INPUT = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent';
const SMALL = 'rounded-md border border-border px-2 py-1 text-xs tabular-nums hover:bg-background disabled:opacity-50';

/** Lengths offered as one click. */
const LENGTHS = [15, 30, 45, 60, 90, 120];
const lengthLabel = (m: number) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}½h`);

/**
 * The time at the top of the event panel, and where it is changed: click it to
 * pick another day, start or length — or nudge it by a quarter of an hour.
 * Every change shows on the calendar straight away, dashed, and is sent to
 * Google only with "Save to Google Calendar" (here, or in the bar above the
 * calendar, together with changes dragged on the grid).
 */
export function TimeEditor({ target }: { target: EditTarget }) {
  const { edits, stage, discard, save, saving } = usePendingEdits();
  const pending = edits.get(target.id) ?? null;
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const zone = target.zone;
  const start = DateTime.fromISO(pending?.start ?? target.start, { zone });
  const end = DateTime.fromISO(pending?.end ?? target.end, { zone });
  const length = Math.round(end.diff(start, 'minutes').minutes);
  const editing = open || pending !== null;

  const put = (s: DateTime, e: DateTime) => {
    if (e <= s) return setProblem('The end must come after the start.');
    if (target.kind === 'block' && !s.hasSame(e.minus({ milliseconds: 1 }), 'day')) return setProblem('A block cannot run past midnight.');
    setProblem(null);
    stage(target, s.toISO()!, e.toISO()!);
  };
  const at = (day: string, time: string) => DateTime.fromISO(`${day}T${time}`, { zone });

  const onDay = (day: string) => {
    const s = at(day, start.toFormat('HH:mm'));
    if (s.isValid) put(s, s.plus({ minutes: length }));
  };
  const onStart = (time: string) => {
    const s = at(start.toISODate()!, time);
    if (s.isValid) put(s, s.plus({ minutes: length }));
  };
  const onEnd = (time: string) => {
    let e = at(start.toISODate()!, time);
    if (!e.isValid) return;
    // An event may end after midnight: an end before the start means the next day.
    if (e <= start && target.kind === 'event') e = e.plus({ days: 1 });
    put(start, e);
  };
  const shift = (minutes: number) => put(start.plus({ minutes }), end.plus({ minutes }));

  const when = formatSpan(start.toISO()!, end.toISO()!, zone);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded px-1 py-0.5 text-left text-muted hover:bg-background hover:text-foreground"
        title="Change the time"
      >
        <span className="tabular-nums">{when}</span>
        <span className="ml-auto text-xs text-accent opacity-70 group-hover:opacity-100">✎ Change</span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-accent/40 bg-accent/5 p-3">
      <div className="space-y-0.5">
        <p className="font-medium tabular-nums">{when}</p>
        {pending ? (
          <p className="text-xs text-muted">
            <span className="line-through">{formatSpan(target.start, target.end, zone)}</span> · <span className="text-accent">unsaved</span>
          </p>
        ) : (
          <p className="text-xs text-muted">Pick a new time, or drag it on the calendar.</p>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-1.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Day</span>
          <input type="date" value={start.toISODate()!} onChange={(e) => e.target.value && onDay(e.target.value)} className={INPUT} />
        </label>
        <button type="button" className={`${SMALL} h-[34px]`} onClick={() => shift(-24 * 60)} title="A day earlier" aria-label="A day earlier">
          ‹
        </button>
        <button type="button" className={`${SMALL} h-[34px]`} onClick={() => shift(24 * 60)} title="A day later" aria-label="A day later">
          ›
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">From</span>
          <input type="time" step={300} value={start.toFormat('HH:mm')} onChange={(e) => e.target.value && onStart(e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Until</span>
          <input type="time" step={300} value={end.toFormat('HH:mm')} onChange={(e) => e.target.value && onEnd(e.target.value)} className={INPUT} />
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-14 text-xs text-muted">Length</span>
          {LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              className={`${SMALL} ${length === m ? 'border-accent bg-accent text-white hover:bg-accent' : ''}`}
              onClick={() => put(start, start.plus({ minutes: m }))}
            >
              {lengthLabel(m)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-14 text-xs text-muted">Move</span>
          <button type="button" className={SMALL} onClick={() => shift(-15)}>
            −15 min
          </button>
          <button type="button" className={SMALL} onClick={() => shift(15)}>
            +15 min
          </button>
        </div>
      </div>

      {pending && target.recurring && <ScopeChoice edit={pending} />}
      {target.kind === 'block' && (
        <p className="text-xs text-muted">A block made shorter loses minutes from its last task; longer gives that task more time. It is pinned (📌) where you put it.</p>
      )}
      {problem && <p className="text-xs text-red-500">{problem}</p>}
      {pending?.error && <p className="text-xs text-red-500">Could not save: {pending.error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" tone="primary" disabled={!pending || saving} onClick={() => void save([target.id]).then(() => setOpen(false))}>
          {saving && pending ? 'Saving…' : target.toGoogle ? 'Save to Google Calendar' : 'Save'}
        </Button>
        <Button
          type="button"
          tone="ghost"
          disabled={saving}
          onClick={() => {
            discard(target.id);
            setProblem(null);
            setOpen(false);
          }}
        >
          {pending ? 'Undo' : 'Cancel'}
        </Button>
      </div>
      {!target.toGoogle && <p className="text-xs text-muted">A draft — it reaches Google when the plan is committed.</p>}
    </div>
  );
}
