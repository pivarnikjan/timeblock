import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { grantsCalendar, oauthClient } from '@/lib/google/client';
import { clearCredentials, readCredentials, writeCredentials } from '@/lib/google/credentials';

export const dynamic = 'force-dynamic';

/** Google's error code from a failed token call, e.g. "invalid_grant". */
function googleErrorCode(error: unknown): string {
  const e = error as { response?: { data?: { error?: unknown } }; code?: unknown };
  const code = e?.response?.data?.error ?? e?.code;
  return typeof code === 'string' && /^[a-z_]+$/i.test(code) ? code : 'unexpected';
}

/**
 * Loopback landing point for the consent screen. Exchanges the one-time code
 * for a refresh token and stores it outside the repo.
 *
 * Every failure ends on Settings with a reason rather than a bare 500 — this
 * page is the one place in the flow where the user cannot see what went wrong.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = (query: string) => NextResponse.redirect(new URL(`/settings?${query}`, request.url));

  const error = url.searchParams.get('error');
  if (error) return settings(`error=${encodeURIComponent(error)}`);

  const code = url.searchParams.get('code');
  if (!code) return settings('error=missing-code');

  const startedAt = Date.now();
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Happens when the grant already exists and Google skips re-consent.
      return settings('error=no-refresh-token');
    }

    // Sign-in succeeds even when the calendar checkbox on Google's consent screen
    // is left unticked. A grant without calendar access is useless to TimeBlock,
    // so it is not kept — and any older grant is dropped with it, so Settings
    // offers a clean Connect instead of pretending to be connected.
    if (!grantsCalendar(tokens.scope)) {
      clearCredentials();
      return settings('error=missing-calendar-scope');
    }

    client.setCredentials(tokens);

    let account: string | undefined;
    try {
      const info = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
      account = info.data.email ?? undefined;
    } catch {
      // Nice-to-have only; the grant is valid regardless.
    }

    writeCredentials({
      refreshToken: tokens.refresh_token,
      account,
      scopes: (tokens.scope ?? '').split(/\s+/).filter(Boolean),
      savedAt: new Date().toISOString(),
    });

    return settings('connected=1');
  } catch (err) {
    const reason = googleErrorCode(err);
    // Logged without the code or any token — only what is needed to diagnose.
    console.error(`[google/callback] token exchange failed: ${reason} - ${(err as Error)?.message ?? err}`);

    // A code can only be exchanged once. If the browser loaded this page twice
    // (a reload, or a prefetch), the second exchange fails with invalid_grant
    // although the first one just saved a good grant — that is a success.
    const saved = readCredentials();
    if (reason === 'invalid_grant' && saved && grantsCalendar(saved.scopes) && Date.parse(saved.savedAt) >= startedAt - 120_000) {
      return settings('connected=1');
    }
    return settings(`error=token-exchange&reason=${encodeURIComponent(reason)}`);
  }
}
