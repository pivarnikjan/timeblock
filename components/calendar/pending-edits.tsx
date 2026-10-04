'use client';

import { DateTime } from 'luxon';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { saveCalendarEditsAction, type CalendarEdit } from '@/app/actions/calendar';
import { Button } from '@/components/ui';
import type { EditTarget } from './edit-target';

export type EditScope = 'this' | 'following';

/** A time changed on the calendar but not saved yet: shown where it would go, until saved or undone. */
export interface PendingEdit {
  target: EditTarget;
  /** The new start and end, ISO in the calendar's timezone. */
  start: string;
  end: string;
  /** A repeating event: this occurrence only, or this and every following one. */
  scope: EditScope;
  /** Why the last save of it failed. */
  error: string | null;
}

interface PendingEdits {
  edits: Map<string, PendingEdit>;
  /** Records a new time for an item; back at its saved time, the change is dropped. */
  stage: (target: EditTarget, start: string, end: string) => void;
  setScope: (id: string, scope: EditScope) => void;
  discard: (id: string) => void;
  discardAll: () => void;
  /** Saves the given changes (all of them when omitted); failed ones stay, with the reason. */
  save: (ids?: string[]) => Promise<void>;
  saving: boolean;
}

const Context = createContext<PendingEdits | null>(null);

export function usePendingEdits(): PendingEdits {
  const value = useContext(Context);
  if (!value) throw new Error('usePendingEdits needs a PendingEditsProvider.');
  return value;
}

const sameInstant = (a: string, b: string) => DateTime.fromISO(a).toMillis() === DateTime.fromISO(b).toMillis();

function toEdit({ target: t, start, end, scope }: PendingEdit): CalendarEdit {
  return t.kind === 'block'
    ? { id: t.id, kind: 'block', blockId: t.blockId!, start, end }
    : { id: t.id, kind: 'event', calendarId: t.calendarId!, eventId: t.eventId!, seriesId: t.seriesId!, start, end, scope };
}

/**
 * Holds the calendar's unsaved time changes, shared by the grid (drag to move,
 * drag the bottom edge to resize) and the event panel's time editor. Nothing
 * reaches Google until a change is saved.
 */
export function PendingEditsProvider({ children }: { children: ReactNode }) {
  const [edits, setEdits] = useState<Map<string, PendingEdit>>(() => new Map());
  const [saving, startSaving] = useTransition();

  const update = useCallback((change: (next: Map<string, PendingEdit>) => void) => {
    setEdits((current) => {
      const next = new Map(current);
      change(next);
      return next;
    });
  }, []);

  const stage = useCallback(
    (target: EditTarget, start: string, end: string) =>
      update((next) => {
        if (sameInstant(start, target.start) && sameInstant(end, target.end)) next.delete(target.id);
        else next.set(target.id, { target, start, end, scope: next.get(target.id)?.scope ?? 'this', error: null });
      }),
    [update],
  );

  const setScope = useCallback(
    (id: string, scope: EditScope) =>
      update((next) => {
        const edit = next.get(id);
        if (edit) next.set(id, { ...edit, scope });
      }),
    [update],
  );

  const discard = useCallback((id: string) => update((next) => void next.delete(id)), [update]);
  const discardAll = useCallback(() => setEdits(new Map()), []);

  const save = useCallback(
    (ids?: string[]) =>
      new Promise<void>((resolve) => {
        const chosen = [...edits.values()].filter((e) => !ids || ids.includes(e.target.id));
        if (chosen.length === 0) return resolve();
        startSaving(async () => {
          let failed: { id: string; error: string }[];
          try {
            failed = await saveCalendarEditsAction(chosen.map(toEdit));
          } catch (error) {
            failed = chosen.map((e) => ({ id: e.target.id, error: (error as Error).message }));
          }
          const errors = new Map(failed.map((f) => [f.id, f.error]));
          update((next) => {
            for (const e of chosen) {
              const error = errors.get(e.target.id);
              // Changed again while saving: keep the newer change.
              if (next.get(e.target.id) !== e) continue;
              if (error === undefined) next.delete(e.target.id);
              else next.set(e.target.id, { ...e, error });
            }
          });
          resolve();
        });
      }),
    [edits, update],
  );

  // Leaving the page would lose unsaved changes: ask first.
  useEffect(() => {
    if (edits.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [edits.size]);

  const value = useMemo(() => ({ edits, stage, setScope, discard, discardAll, save, saving }), [edits, stage, setScope, discard, discardAll, save, saving]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** "Mon 28 Sep · 10:00 – 11:00", in the calendar's timezone. */
export function formatSpan(start: string, end: string, zone: string): string {
  const s = DateTime.fromISO(start, { zone });
  const e = DateTime.fromISO(end, { zone });
  return `${s.toFormat('ccc d LLL')} · ${s.toFormat('HH:mm')} – ${e.toFormat('HH:mm')}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Asks a repeating event's question: this occurrence, or this and following. */
export function ScopeChoice({ edit, compact = false }: { edit: PendingEdit; compact?: boolean }) {
  const { setScope } = usePendingEdits();
  const name = `scope-${edit.target.id}${compact ? '-bar' : ''}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {!compact && <span className="font-medium text-muted">It repeats — change</span>}
      <label className="flex items-center gap-1">
        <input type="radio" name={name} checked={edit.scope === 'this'} onChange={() => setScope(edit.target.id, 'this')} /> this one
      </label>
      <label className="flex items-center gap-1">
        <input type="radio" name={name} checked={edit.scope === 'following'} onChange={() => setScope(edit.target.id, 'following')} /> this and following
      </label>
    </span>
  );
}

/**
 * The calendar's unsaved changes, above the grid: each one from its old time to
 * its new, and one button that sends them all — or Undo.
 */
export function PendingBar() {
  const { edits, discard, discardAll, save, saving } = usePendingEdits();
  if (edits.size === 0) return null;
  const list = [...edits.values()];
  const toGoogle = list.some((e) => e.target.toGoogle);
  return (
    <section
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-h-[40vh] max-w-3xl space-y-2 overflow-y-auto rounded-lg border border-accent/60 bg-surface px-4 py-3 text-sm shadow-xl"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-1">{plural(list.length, 'unsaved change')}</strong>
        <Button type="button" tone="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : toGoogle ? `Save to Google Calendar` : 'Save'}
        </Button>
        <Button type="button" tone="ghost" onClick={discardAll} disabled={saving}>
          Undo all
        </Button>
      </div>
      <ul className="space-y-1.5">
        {list.map((e) => (
          <li key={e.target.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-medium">{e.target.title}</span>
            <span className="text-muted line-through">{formatSpan(e.target.start, e.target.end, e.target.zone)}</span>
            <span aria-hidden>→</span>
            <span className="font-medium tabular-nums">{formatSpan(e.start, e.end, e.target.zone)}</span>
            {!e.target.toGoogle && <span className="text-muted">(draft — stays in TimeBlock)</span>}
            {e.target.recurring && <ScopeChoice edit={e} compact />}
            <button type="button" className="text-accent underline underline-offset-2" onClick={() => discard(e.target.id)} disabled={saving}>
              Undo
            </button>
            {e.error && <span className="basis-full text-red-500">Could not save: {e.error}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
