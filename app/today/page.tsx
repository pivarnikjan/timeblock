import { redirect } from 'next/navigation';

/** "Today" became the Calendar's one-day view; old links and bookmarks land there. */
export default async function TodayPage({ searchParams }: PageProps<'/today'>) {
  const { date } = await searchParams;
  redirect(typeof date === 'string' ? `/calendar?view=day&date=${encodeURIComponent(date)}` : '/calendar?view=day');
}
