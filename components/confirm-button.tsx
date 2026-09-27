'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';

/**
 * A submit button that asks first. For actions that cannot be undone from
 * TimeBlock, such as deleting an event from Google Calendar.
 */
export function ConfirmButton({
  confirm,
  children,
  ...rest
}: ComponentProps<typeof Button> & { confirm: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...rest}
      type="submit"
      disabled={pending || rest.disabled}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? 'Working…' : children}
    </Button>
  );
}
