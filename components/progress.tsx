import { DateTime } from 'luxon';
import { formatMinutes, type Progress } from '@/lib/hierarchy';
import type { HorizonOutlook } from '@/lib/planner';

/**
 * A goal's progress: the bar is the equal-weight roll-up; the label underneath
 * is the plain count of what sits in its subtree.
 */
export function ProgressBar({ progress, compact = false }: { progress: Progress | undefined; compact?: boolean }) {
  const ratio = progress?.ratio ?? null;
  const pct = ratio === null ? 0 : Math.round(ratio * 100);

  return (
    <div className={compact ? 'min-w-24' : 'min-w-40'}>
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-9 text-right text-xs tabular-nums text-muted">
          {ratio === null ? '—' : `${pct}%`}
        </span>
      </div>
      {!compact && progress && (
        <p className="mt-0.5 text-[11px] text-muted">
          {progress.totalTasks === 0
            ? 'nothing planned yet'
            : `${progress.doneTasks}/${progress.totalTasks} tasks · ${formatMinutes(progress.doneMin)} of ${formatMinutes(progress.totalMin)}`}
        </p>
      )}
    </div>
  );
}

export function Breadcrumb({ trail, className = '' }: { trail: string[]; className?: string }) {
  if (trail.length === 0) return <span className={`text-xs text-amber-600 ${className}`}>not connected</span>;
  return (
    <span className={`text-xs text-muted ${className}`}>
      {trail.map((crumb, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1 opacity-60">›</span>}
          {crumb}
        </span>
      ))}
    </span>
  );
}

const day = (iso: string) => DateTime.fromISO(iso).toFormat('ccc d LLL');

/** What the forecast says about a goal, as a small badge. */
export function OutlookBadge({ outlook }: { outlook: HorizonOutlook | undefined }) {
  if (!outlook || outlook.status === 'empty') return null;

  const partial = outlook.status === 'on-track' && outlook.unplanned > 0;
  const styles: Record<HorizonOutlook['status'], string> = {
    done: 'border-emerald-500/40 text-emerald-600',
    finished: 'border-emerald-500/40 text-emerald-600',
    'on-track': 'border-border text-muted',
    'at-risk': 'border-red-500/40 bg-red-500/5 text-red-500',
    unscheduled: 'border-amber-500/40 text-amber-600',
    upcoming: 'border-border text-muted',
    empty: '',
  };

  const text =
    outlook.status === 'done'
      ? 'done'
      : outlook.status === 'finished'
        ? 'all planned work finished'
        : outlook.status === 'upcoming'
          ? `starts ${day(outlook.starts)}`
          : outlook.status === 'on-track'
          ? `${outlook.runsTo ? `on track so far · runs to ${day(outlook.runsTo)}` : `on track · done by ${day(outlook.finish)}`}${
              outlook.unplanned > 0 ? ` · ${outlook.unplanned} below with nothing planned yet` : ''
            }`
          : outlook.status === 'unscheduled'
            ? `${outlook.openTasks} task${outlook.openTasks === 1 ? '' : 's'} waiting to be put into a week`
            : `at risk · ${outlook.reason}`;

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${partial ? 'border-amber-500/40 text-amber-600' : styles[outlook.status]}`} title="Forecast assumes no meetings after today">
      {text}
    </span>
  );
}
