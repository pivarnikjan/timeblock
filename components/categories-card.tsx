'use client';

import { useActionState } from 'react';
import {
  applyCategoryColorsAction,
  deleteCategoryAction,
  saveCategoryAction,
  type CategoryFormState,
  type RepaintState,
} from '@/app/actions/categories';
import { ConfirmButton } from '@/components/confirm-button';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';

export interface CategoryRowData {
  id: number;
  name: string;
  color: string;
  keywords: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One category: name, colour, title words — saved together; its events follow in Google. */
function CategoryForm({ category, onCreate }: { category?: CategoryRowData; onCreate?: boolean }) {
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(saveCategoryAction, { kind: 'idle' });
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[auto_1fr_2fr_auto]">
      {category && <input type="hidden" name="id" value={category.id} />}
      <Field label="Colour">
        <input
          // A new form starts afresh after each add.
          key={onCreate && state.kind === 'saved' ? state.at : 'color'}
          type="color"
          name="color"
          defaultValue={category?.color ?? '#616161'}
          className="h-[34px] w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
        />
      </Field>
      <Field label={onCreate ? 'New category' : 'Name'}>
        <Input
          key={onCreate && state.kind === 'saved' ? `n${state.at}` : 'name'}
          name="name"
          required
          defaultValue={category?.name ?? ''}
          placeholder="e.g. Traveling"
        />
      </Field>
      <Field label="Title words (one per line)">
        <Textarea
          key={onCreate && state.kind === 'saved' ? `k${state.at}` : 'keywords'}
          name="keywords"
          rows={2}
          defaultValue={category?.keywords ?? ''}
          placeholder={'e.g. škôlky\nletisko'}
        />
      </Field>
      <Button type="submit" tone={onCreate ? 'default' : 'primary'} disabled={pending}>
        {pending ? 'Saving…' : onCreate ? 'Add' : 'Save'}
      </Button>
      {state.kind === 'error' && <p className="text-xs text-red-500 sm:col-span-4">{state.message}</p>}
      {state.kind === 'saved' && state.warning && <p className="text-xs text-amber-600 sm:col-span-4">{state.warning}</p>}
    </form>
  );
}

/**
 * Settings → Categories: kinds of events that are not TimeBlock work, each
 * with the colour its events take — on the calendar here and on the phone, and
 * in Google Calendar (the nearest of Google's colours). An event gets one by
 * its title containing one of the words, or by choosing it in its panel.
 */
export function CategoriesCard({ categories, googleConnected }: { categories: CategoryRowData[]; googleConnected: boolean }) {
  const [repaint, apply, applying] = useActionState<RepaintState, FormData>(applyCategoryColorsAction, { kind: 'idle' });
  return (
    <Card>
      <h2 id="categories" className="text-sm font-medium">
        Categories
      </h2>
      <p className="mt-1 text-xs text-muted">
        For events that are not TimeBlock work — a meeting at a client, travelling. An event whose title contains one of a category&apos;s
        words gets its colour (case and accents don&apos;t matter; the first category in this list wins); in an event&apos;s panel you can pick
        one by hand instead, or none. A repeating event follows for every repeat. In Google Calendar the event takes the nearest of
        Google&apos;s colours — unless you change its colour there afterwards, which then stays.
      </p>
      <div className="mt-4 space-y-4">
        {categories.map((c) => (
          <div key={c.id} className="space-y-1">
            <CategoryForm category={c} />
            <form action={deleteCategoryAction}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton tone="ghost" className="!px-0 text-xs" confirm={`Delete the category “${c.name}”? Its events go back to the title words of the others, and lose its colour in Google.`}>
                Delete {c.name}
              </ConfirmButton>
            </form>
          </div>
        ))}
        <div className="border-t border-border pt-4">
          <CategoryForm onCreate />
        </div>
      </div>
      {googleConnected && categories.length > 0 && (
        <form action={apply} className="mt-4 space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted">
            Saving a category recolours its events in Google straight away. Events added in Google since are coloured here at once, and in
            Google within the hour — or now:
          </p>
          <Button type="submit" disabled={applying}>
            {applying ? 'Recolouring…' : 'Apply category colours in Google Calendar'}
          </Button>
          {repaint.kind === 'error' && <p className="text-xs text-red-500">Google Calendar could not be updated: {repaint.message}</p>}
          {repaint.kind === 'done' && (
            <p className="text-xs text-emerald-600">
              {repaint.recoloured === 0 && repaint.cleared === 0
                ? 'Every categorised event in Google already has its colour.'
                : `${plural(repaint.recoloured, 'event')} recoloured${repaint.cleared > 0 ? `, ${repaint.cleared} back to their own colour` : ''}.`}
              {repaint.chosenByHand > 0 && ` ${plural(repaint.chosenByHand, 'event')} kept the colour chosen in Google.`}
              {repaint.failed > 0 && ` ${plural(repaint.failed, 'event')} could not be changed (organised by someone else?).`}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
