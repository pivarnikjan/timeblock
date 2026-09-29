'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { str } from '@/lib/forms';
import { renameDevice, replaceFromDrive, syncNow } from '@/lib/sync/service';

/**
 * Settings → Phone sync. "sync" runs a round now; "anyway" does so for a
 * device away too long, accepting that deletions made elsewhere since may come
 * back; "replace" throws this device's data away for the copy in Drive.
 * Reports back on the Settings page (a failure is shown from the stored error).
 */
export async function syncNowAction(form: FormData): Promise<void> {
  const intent = form.get('intent');
  let query = 'synced=failed';
  try {
    const report = intent === 'replace' ? await replaceFromDrive() : await syncNow({ allowStale: intent === 'anyway' });
    const changes = report.merged.reduce((n, m) => n + m.changes.inserted + m.changes.updated + m.changes.deleted, 0);
    query = `synced=1&changes=${changes}&uploaded=${report.uploaded ? 1 : 0}`;
    if (report.warnings.length > 0) query += `&warning=${encodeURIComponent(report.warnings.join(' '))}`;
  } catch {
    // The reason is recorded with the device and shown in the card.
  }
  revalidatePath('/', 'layout');
  redirect(`/settings?${query}#phone-sync`);
}

export async function renameDeviceAction(form: FormData): Promise<void> {
  renameDevice(str(form, 'name'));
  revalidatePath('/settings');
}
