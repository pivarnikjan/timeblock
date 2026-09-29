/** Read and write access to the user's calendars. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/**
 * TimeBlock's own hidden folder in Google Drive, where each device keeps its
 * sync file. It cannot see or touch any other file in Drive.
 */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const SCOPES = [CALENDAR_SCOPE, DRIVE_APPDATA_SCOPE, 'https://www.googleapis.com/auth/userinfo.email'];

/**
 * Google's consent screen lists calendar access as its own checkbox. Sign-in
 * succeeds even when it is left unticked, so the granted scopes must be checked
 * rather than assumed.
 */
export function grantsCalendar(scopes: string[] | string | null | undefined): boolean {
  const list = Array.isArray(scopes) ? scopes : (scopes ?? '').split(/\s+/);
  return list.includes(CALENDAR_SCOPE);
}

/** Whether the grant lets this device sync through Drive's app data folder (also a checkbox of its own). */
export function grantsDrive(scopes: string[] | string | null | undefined): boolean {
  const list = Array.isArray(scopes) ? scopes : (scopes ?? '').split(/\s+/);
  return list.includes(DRIVE_APPDATA_SCOPE);
}

/** Google's 403 for a token whose grant lacks the scope an API call needs. */
export function isMissingScopeError(error: unknown): boolean {
  const e = error as { code?: number; status?: number; message?: string };
  return (e?.code === 403 || e?.status === 403) && /insufficient authentication scopes/i.test(e?.message ?? '');
}

export const MISSING_SCOPE_HELP =
  'Google Calendar access was not granted. In Settings click Reconnect, and on Google’s consent screen tick the box for “See, edit, share, and permanently delete all the calendars you can access using Google Calendar” before clicking Continue.';
