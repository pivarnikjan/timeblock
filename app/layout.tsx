import type { Metadata } from "next";
import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "TimeBlock",
  description: "Plan the year down to the hour, then put it in the calendar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
            <Link href="/calendar" className="mr-4 font-semibold tracking-tight">
              Time<span className="text-accent">Block</span>
            </Link>
            <MainNav />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
