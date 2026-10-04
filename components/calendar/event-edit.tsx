'use client';

import { useActionState, useState } from 'react';
import { setEventCategoryAction, type EventEditState } from '@/app/actions/calendar';
import { Button } from '@/components/ui';
import { EVENT_COLORS } from '@timeblock/core/calendar/colors';

const INPUT = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent';

/** Google's event colours: a category's colour shows in Google as the nearest of these anyway. */
const SWATCHES = Object.values(EVENT_COLORS);

function Outcome({ state }: { state: EventEditState }) {
  if (state.kind === 'error') return <p className="text-xs text-red-500">{state.message}</p>;
  if (state.kind === 'saved' && state.warning) return <p className="text-xs text-amber-600">{state.warning}</p>;
  if (state.kind === 'saved') return <p className="text-xs text-emerald-600">Saved.</p>;
  return null;
}

/**
 * An event's category: one chosen by hand (on the series, so every repeat
 * follows), none on purpose, whatever the title words say — or a new one,
 * made right here. The colour follows on the calendar and in Google.
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
  const saved = source === 'chosen' ? (current ? String(current.id) : 'none') : 'rules';
  const [choice, setChoice] = useState(saved);
  // Once a choice is saved (or a new category made), the picker shows what is saved.
  const [shown, setShown] = useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setChoice(saved);
  }
  const creating = choice === 'new';
  const taken = new Set(categories.map((c) => c.color.toUpperCase()));
  const [color, setColor] = useState(() => (SWATCHES.find((s) => !taken.has(s.hex.toUpperCase())) ?? SWATCHES[0]).hex);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="key" value={eventKey} />
      <input type="hidden" name="title" value={title} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Category</span>
        <div className="flex gap-2">
          <select name="choice" value={choice} onChange={(e) => setChoice(e.target.value)} className={INPUT}>
            <option value="rules">By title words{source === 'rule' && current ? ` (${current.name})` : ' (none matches)'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">No category</option>
            <option value="new">+ New category…</option>
          </select>
          {!creating && (
            <Button type="submit" disabled={pending || choice === saved}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </label>

      {!current && !creating && (
        <button type="button" className="text-xs text-accent underline underline-offset-2" onClick={() => setChoice('new')}>
          + Create a category for “{title}”
        </button>
      )}

      {creating && (
        <div className="space-y-2 rounded-md border border-border bg-background/50 p-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Name</span>
            <input name="name" required autoFocus placeholder="e.g. Traveling" className={INPUT} />
          </label>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">Colour</legend>
            <input type="hidden" name="color" value={color} />
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  title={s.name}
                  aria-label={s.name}
                  aria-pressed={color === s.hex}
                  onClick={() => setColor(s.hex)}
                  className={`h-6 w-6 rounded-full border border-black/10 ${color === s.hex ? 'ring-2 ring-foreground ring-offset-2 ring-offset-surface' : ''}`}
                  style={{ backgroundColor: s.hex }}
                />
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Title words (one per line)</span>
            <textarea name="keywords" rows={2} defaultValue={title} className={INPUT} />
            <span className="mt-0.5 block text-xs text-muted">Other events whose titles hold these words join it too. Clear it for this event only.</span>
          </label>
          <div className="flex gap-2">
            <Button type="submit" tone="primary" disabled={pending}>
              {pending ? 'Creating…' : 'Create & assign'}
            </Button>
            <Button type="button" tone="ghost" onClick={() => setChoice(saved)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        Its colour follows the category, here and in Google Calendar{recurring ? ' — for every repeat' : ''}. Categories are managed in Settings.
      </p>
      <Outcome state={state} />
    </form>
  );
}
