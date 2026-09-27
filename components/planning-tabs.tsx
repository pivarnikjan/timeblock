'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const TABS = [
  { href: '/week', label: 'Week' },
  { href: '/month', label: 'Month' },
  { href: '/year', label: 'Year' },
] as const;

/**
 * Week · Month · Year inside the Planning tab. Switching keeps the date being
 * looked at, so October's month opens from one of its weeks.
 */
export function PlanningTabs() {
  const pathname = usePathname();
  const date = useSearchParams().get('date');
  return (
    <nav className="flex w-fit overflow-hidden rounded-md border border-border text-sm" aria-label="Planning level">
      {TABS.map((tab, i) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={date ? `${tab.href}?date=${date}` : tab.href}
            aria-current={active ? 'page' : undefined}
            className={`px-4 py-1.5 ${active ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-foreground'} ${
              i > 0 ? 'border-l border-border' : ''
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
