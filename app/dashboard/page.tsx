import Link from 'next/link';
import { DateTime } from 'luxon';
import { Breadcrumb } from '@/components/progress';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { withEnv } from '@/lib/env';
import { getSettings } from '@/lib/repo/settings';
import { formatMinutes } from '@timeblock/core/hierarchy';
import { INSIGHT_PERIODS, parsePeriod, rescheduledTasks, type InsightPeriod } from '@timeblock/core/insights';

export const dynamic = 'force-dynamic';

const PERIOD_LABEL: Record<InsightPeriod, string> = { '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  done: { text: 'Done', className: 'border-emerald-500/50 text-emerald-600' },
  active: { text: 'Open', className: 'border-border text-muted' },
  backlog: { text: 'Open', className: 'border-border text-muted' },
  dropped: { text: 'Dropped', className: 'border-border text-muted line-through' },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Where planned work keeps slipping: the tasks rescheduled most often — by
 * "Didn't get to it" on a block, or left unticked in the morning review.
 */
export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const period = parsePeriod((await searchParams).period);
  const [rows, settings] = await Promise.all([withEnv(rescheduledTasks)(period), getSettings()]);
  const zone = settings.timezone;
  const most = rows[0]?.count ?? 0;
  const slips = rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Which work gets done on the first try, and which keeps slipping." />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Most rescheduled tasks</h2>
            <p className="text-xs text-muted">
              A reschedule is work not done in its scheduled time: <strong>Didn’t get to it</strong> on a block, or left
              unticked in the morning review.
            </p>
          </div>
          <nav className="flex rounded-md border border-border p-0.5 text-xs" aria-label="Period">
            {(Object.keys(INSIGHT_PERIODS) as InsightPeriod[]).map((p) => (
              <Link
                key={p}
                href={`/dashboard?period=${p}`}
                aria-current={p === period ? 'page' : undefined}
                className={`rounded px-2.5 py-1 ${p === period ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
              >
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </nav>
        </div>

        {rows.length === 0 ? (
          <EmptyState>
            Nothing rescheduled {period === 'all' ? 'yet' : `in the ${PERIOD_LABEL[period].toLowerCase()}`} — everything planned was done
            on the first try.
          </EmptyState>
        ) : (
          <>
            <p className="text-sm text-muted">
              {plural(slips, 'reschedule')} across {plural(rows.length, 'task')}
              {rows.length === 25 ? ' (the 25 most rescheduled shown)' : ''}.
            </p>
            <ol className="divide-y divide-border">
              {rows.map((r, i) => {
                const status = STATUS_LABEL[r.status] ?? STATUS_LABEL.active;
                return (
                  <li key={r.taskId} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="text-right text-xs tabular-nums text-muted">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{r.title}</span>
                        <span className={`rounded-full border px-1.5 py-px text-[10px] ${status.className}`}>{status.text}</span>
                      </div>
                      {r.goal.length > 0 ? <Breadcrumb trail={r.goal} /> : <span className="text-xs text-muted">No goal</span>}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60" aria-hidden>
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${(r.count / most) * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold tabular-nums leading-none">↻ {r.count}</div>
                      <div className="mt-1 text-[11px] text-muted">
                        {formatMinutes(r.minutes)} slipped · last {DateTime.fromISO(r.last, { zone: 'utc' }).setZone(zone).toFormat('d LLL')}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Card>
    </div>
  );
}
