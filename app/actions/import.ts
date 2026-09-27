'use server';

import { revalidatePath } from 'next/cache';
import { db, sqlite } from '@/lib/db/client';
import { breadcrumb, indexHorizons } from '@/lib/hierarchy';
import { applyImport } from '@/lib/import/apply';
import { parseImport, planImport, type ImportIssue, type ImportPlan } from '@/lib/import/tasks-csv';
import { listAllHorizons } from '@/lib/repo/horizons';
import { listAllTasks, nextSortOrder } from '@/lib/repo/tasks';
import { listWindows } from '@/lib/repo/windows';

export interface PreviewRow {
  line: number;
  chain: string[];
  task: string | null;
  minutes: number | null;
  action: 'new' | 'update' | 'goal';
}

export interface ImportState {
  stage: 'idle' | 'preview' | 'imported';
  fileName: string | null;
  /** The file's text, carried from preview to import so it is not re-uploaded. */
  csv: string;
  rows: PreviewRow[];
  summary: ImportPlan['summary'] | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  unknownColumns: string[];
}

/**
 * One action for both steps. "preview" validates and shows what would change;
 * "import" repeats the same resolution and writes it. Nothing is written while
 * any row has an error.
 */
export async function importCsvAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const file = form.get('file');
  const fromFile = file instanceof File && file.size > 0;
  const csv = fromFile ? await file.text() : String(form.get('csv') ?? '');
  const fileName = fromFile ? file.name : String(form.get('fileName') ?? '') || null;

  if (csv.trim() === '') {
    return {
      stage: 'idle',
      fileName: null,
      csv: '',
      rows: [],
      summary: null,
      errors: [{ line: 0, message: 'Choose a CSV file first.' }],
      warnings: [],
      unknownColumns: [],
    };
  }

  const [windows, horizons, tasks, sortStart] = await Promise.all([
    listWindows(),
    listAllHorizons(),
    listAllTasks(),
    nextSortOrder(),
  ]);
  const parsed = parseImport(csv, windows);
  const plan = planImport(parsed.rows, horizons, tasks, sortStart);

  const createdTasks = new Set(plan.ops.filter((op) => op.kind === 'create-task').map((op) => op.line));
  const rows: PreviewRow[] = parsed.rows.map((row) => ({
    line: row.line,
    chain: row.chain.map((h) => h.title),
    task: row.task?.title ?? null,
    minutes: row.task?.estimateMin ?? null,
    action: row.task ? (createdTasks.has(row.line) ? 'new' : 'update') : 'goal',
  }));

  const base: ImportState = {
    stage: 'preview',
    fileName,
    csv,
    rows,
    summary: plan.summary,
    errors: parsed.errors,
    warnings: parsed.warnings,
    unknownColumns: parsed.unknownColumns,
  };

  if (form.get('intent') !== 'import' || parsed.errors.length > 0) return base;

  await applyImport(db(), sqlite(), plan);
  revalidatePath('/', 'layout');

  // Re-read so the confirmation shows breadcrumbs as they are now stored.
  const byId = indexHorizons(await listAllHorizons());
  const stored = await listAllTasks();
  const imported = rows.map((row) => {
    const task = stored.find((t) => t.title === row.task);
    return task ? { ...row, chain: breadcrumb(task.horizonId, byId) } : row;
  });

  return { ...base, stage: 'imported', csv: '', rows: imported };
}
