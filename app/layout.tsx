import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TimeBlock",
  description: "Plan the year down to the hour, then put it in the calendar.",
};

const NAV = [
  { href: "/calendar", label: "Calendar" },
  { href: "/week", label: "Week" },
  { href: "/month", label: "Month" },
  { href: "/year", label: "Year" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
            <Link href="/calendar" className="mr-4 font-semibold tracking-tight">
              Time<span className="text-accent">Block</span>
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
