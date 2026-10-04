'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/calendar', label: 'Calendar', match: ['/calendar', '/today'] },
  { href: '/planning', label: 'Planning', match: ['/planning', '/week', '/month', '/year'] },
  { href: '/tasks', label: 'Tasks', match: ['/tasks'] },
  { href: '/dashboard', label: 'Dashboard', match: ['/dashboard'] },
  { href: '/settings', label: 'Settings', match: ['/settings'] },
] as const;

/** The top navigation, with the section you are in highlighted. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
        const active = item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-background hover:text-foreground ${
              active ? 'bg-background font-medium text-foreground' : 'text-muted'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
