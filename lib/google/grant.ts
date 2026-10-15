/**
 * How long Google keeps honouring TimeBlock's sign-in, and how to tell why it
 * stopped. The usual reason: while a Google Cloud app's publishing status is
 * *Testing*, Google ends every sign-in 7 days after it was given — on the
 * desktop and the phone alike. Publishing the app (Google Auth platform →
 * Audience → Publish app) ends that limit; see docs/google-calendar-setup.md.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Google's limit for apps in Testing. */
export const TESTING_LIMIT_DAYS = 7;

/** Where the publishing status is changed. */
export const AUDIENCE_URL = 'https://console.cloud.google.com/auth/audience';

/** Google refused the stored refresh token: it expired or was revoked. Only a new sign-in helps. */
export function isInvalidGrant(error: unknown): boolean {
  const e = error as { response?: { data?: { error?: unknown } }; message?: unknown };
  return e?.response?.data?.error === 'invalid_grant' || (typeof e?.message === 'string' && /\binvalid_grant\b/.test(e.message));
}

/** Days from `from` to `to`, both ISO. */
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS;

/**
 * Whether a grant that ended looks like it hit the Testing limit. It is only
 * noticed when TimeBlock next asks Google, which may be later than the moment
 * it ended (the computer was off) — so anything from 7 days on counts.
 */
export function endedLikeTesting(grant: { savedAt: string; expiredAt: string }): boolean {
  return days(grant.savedAt, grant.expiredAt) >= TESTING_LIMIT_DAYS - 0.1;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Why a grant ended and what to do, for Settings and the Calendar. */
export function expiredExplanation(grant: { savedAt: string; expiredAt: string }): string {
  if (endedLikeTesting(grant)) {
    return `Google ended TimeBlock's sign-in after ${TESTING_LIMIT_DAYS} days (it was given on ${when(grant.savedAt)}). Google does that to every sign-in while the Google Cloud app is in Testing. To stop it for good: publish the app (Google Auth platform → Audience → Publish app), then Reconnect.`;
  }
  return `Google stopped accepting TimeBlock's sign-in (given on ${when(grant.savedAt)}) — access was removed in your Google account, or the password changed. Reconnect to sign in again.`;
}

/**
 * When the current grant will probably end, if there is reason to think it
 * will: Google said so when handing it out, or the grant before it ended at
 * the Testing limit (so the app may still be in Testing). Null once it has
 * outlived the limit — the app was published.
 */
export function upcomingExpiry(stored: { savedAt: string; expiresAt?: string; previous?: { savedAt: string; expiredAt: string } }, now = Date.now()): { at: string; known: boolean } | null {
  if (stored.expiresAt) return Date.parse(stored.expiresAt) > now ? { at: stored.expiresAt, known: true } : null;
  if (!stored.previous || !endedLikeTesting(stored.previous)) return null;
  const at = Date.parse(stored.savedAt) + TESTING_LIMIT_DAYS * DAY_MS;
  // Half a day of grace: past that, it outlived the limit.
  return at + DAY_MS / 2 > now ? { at: new Date(at).toISOString(), known: false } : null;
}

/** The warning for a grant that will probably end soon, or null. */
export function expiryWarning(stored: Parameters<typeof upcomingExpiry>[0], now = Date.now()): string | null {
  const ending = upcomingExpiry(stored, now);
  if (!ending) return null;
  if (ending.known) {
    return `Google will end this sign-in on ${when(ending.at)} — the Google Cloud app is in Testing. Publish it (Google Auth platform → Audience → Publish app), then Reconnect, to stop the weekly expiry.`;
  }
  return `Your last sign-in ended after ${TESTING_LIMIT_DAYS} days, as Google does while the Google Cloud app is in Testing. If you have not published the app since, this one ends around ${when(ending.at)}: publish it (Google Auth platform → Audience → Publish app), then Reconnect.`;
}
