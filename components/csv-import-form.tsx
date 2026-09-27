'use client';

import { useActionState } from 'react';
import { importCsvAction, type ImportState } from '@/app/actions/import';
import { Button } from '@/components/ui';

const TEMPLATE_URL = '/templates/timeblock-tasks-template.csv';

const INITIAL: ImportState = {
  stage: 'idle',
  fileName: null,
  csv: '',
  rows: [],
  summary: null,
  errors: [],
  warnings: [],
  unknownColumns: [],
};

const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export function CsvImportForm() {
  const [state, action, pending] = useActionState(importCsvAction, INITIAL);
  const canImport = state.stage === 'preview' && state.errors.length === 0 && state.rows.length > 0;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="csv" value={state.stage === 'preview' ? state.csv : ''} />
        <input type="hidden" name="fileName" value={state.fileName ?? ''} />

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <a href={TEMPLATE_URL} download className="text-sm text-accent underline underline-offset-2">
            Download template
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="preview" disabled={pending}>
            {pending ? 'Reading…' : 'Preview'}
          </Button>
          <Button type="submit" name="intent" value="import" tone="primary" disabled={pending || !canImport}>
            Import
          </Button>
          {state.fileName && <span className="text-xs text-muted">{state.fileName}</span>}
        </div>
      </form>

      {state.stage === 'imported' && state.summary && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">
          Imported. <Summary summary={state.summary} />
        </p>
      )}

      {state.stage === 'preview' && state.summary && state.errors.length === 0 && (
        <p className="rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          Ready to import. <Summary summary={state.summary} />
        </p>
      )}

      {state.errors.length > 0 && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          <p className="font-medium">
            {state.errors.length} problem{state.errors.length === 1 ? '' : 's'} — nothing will be imported until
            they are fixed:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.errors.map((e, i) => (
              <li key={i}>
                {e.line > 0 && <span className="font-mono">line {e.line}: </span>}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            {state.warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">line {w.line}: </span>
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.unknownColumns.length > 0 && (
        <p className="text-xs text-muted">Ignored columns: {state.unknownColumns.join(', ')}</p>
      )}

      {state.rows.length > 0 && (
        <div className="max-h-96 overflow-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Serves</th>
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 text-right font-medium">Time</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.line} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-muted">{row.line}</td>
                  <td className="px-3 py-1.5 text-muted">{row.chain.join(' › ') || '—'}</td>
                  <td className="px-3 py-1.5">{row.task ?? <span className="text-muted">(goal only)</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.minutes !== null ? formatMinutes(row.minutes) : ''}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{row.action === 'goal' ? '' : row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Summary({ summary }: { summary: NonNullable<ImportState['summary']> }) {
  const part = (label: string, counts: { created: number; updated: number }) =>
    counts.created + counts.updated === 0
      ? null
      : `${label}: ${counts.created} new${counts.updated > 0 ? `, ${counts.updated} matched` : ''}`;

  return (
    <span>
      {[
        part('goals', summary.goals),
        part('month outcomes', summary.outcomes),
        part('weeks', summary.weeks),
        part('tasks', summary.tasks),
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}
