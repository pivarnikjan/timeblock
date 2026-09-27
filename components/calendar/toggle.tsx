'use client';

import { useState, useTransition, type ReactNode } from 'react';

/**
 * A checkbox that saves itself the moment it is ticked, like Google Calendar's
 * calendar list. `fields` say what to change; the action also receives `on`,
 * the new state ("1" = ticked).
 *
 * The action is called directly rather than through a <form>: React 19 resets
 * a form after its action runs, which would flip the box back to its old state
 * even though the change was saved.
 *
 * The box keeps its own state and only adopts the server's value when that
 * value changes. An optimistic value would fall back to the old server value
 * the moment a save finishes — before the refreshed page arrives — so a quick
 * second click would repeat the first change instead of undoing it.
 */
export function ToggleForm({
  action,
  checked,
  fields,
  label,
  title,
  color,
  className = '',
}: {
  action: (form: FormData) => Promise<void>;
  checked: boolean;
  fields: Record<string, string>;
  label?: ReactNode;
  title?: string;
  /** Colours the checkbox like the calendar or event it controls. */
  color?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(checked);
  const [serverValue, setServerValue] = useState(checked);
  if (checked !== serverValue) {
    // The server's value changed (a save landed, or another tab changed it).
    setServerValue(checked);
    setShown(checked);
  }
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !shown;
    setShown(next);
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    form.set('on', next ? '1' : '0');
    startTransition(async () => {
      await action(form);
    });
  };

  return (
    <div className={className}>
      <label className={`flex cursor-pointer items-center gap-2 ${pending ? 'opacity-70' : ''}`} title={title}>
        <input
          type="checkbox"
          checked={shown}
          onChange={toggle}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer"
          style={color ? { accentColor: color } : undefined}
          aria-label={title}
        />
        {label}
      </label>
    </div>
  );
}
