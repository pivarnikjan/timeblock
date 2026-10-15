import 'server-only';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { oauthApp, readCredentials, redirectUri, writeCredentials } from './credentials';
import { expiredExplanation, isInvalidGrant } from './grant';
import { grantsCalendar, SCOPES } from '@timeblock/core/google/scopes';

export { CALENDAR_SCOPE, SCOPES, grantsCalendar, isMissingScopeError, MISSING_SCOPE_HELP } from '@timeblock/core/google/scopes';

export class NotConfiguredError extends Error {
  constructor() {
    super('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in .env.local');
    this.name = 'NotConfiguredError';
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super('No Google account connected yet');
    this.name = 'NotConnectedError';
  }
}

export function oauthClient(): OAuth2Client {
  const app = oauthApp();
  if (!app) throw new NotConfiguredError();
  return new google.auth.OAuth2(app.clientId, app.clientSecret, redirectUri());
}

/** The consent URL. `prompt=consent` is what makes Google hand back a refresh token. */
export function consentUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    include_granted_scopes: true,
  });
}

/** An OAuth client already loaded with the stored refresh token. */
export function authorizedClient(): OAuth2Client {
  const stored = readCredentials();
  if (!stored || stored.expiredAt) throw new NotConnectedError();

  const client = oauthClient();
  client.setCredentials({ refresh_token: stored.refreshToken });

  // Google occasionally rotates the refresh token; persist it when it happens,
  // otherwise the next cold start would silently fall back to "not connected".
  client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      writeCredentials({ ...stored, refreshToken: tokens.refresh_token, savedAt: new Date().toISOString() });
    }
  });

  return client;
}

/**
 * An access token from the stored grant. When Google refuses the grant
 * (`invalid_grant`: it expired or was revoked) that is remembered, so every
 * screen says "sign-in expired — Reconnect" rather than each read failing on
 * its own, and the error says why.
 */
export async function accessToken(client: OAuth2Client): Promise<string> {
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('Google did not hand out an access token — reconnect in Settings.');
    return token;
  } catch (error) {
    if (!isInvalidGrant(error)) throw error;
    const ended = markGrantExpired();
    throw new Error(ended ? expiredExplanation(ended) : 'Google no longer accepts the saved sign-in (invalid_grant). Reconnect in Settings.');
  }
}

/** Records that Google stopped accepting the stored grant; returns it, or null when there is none. */
function markGrantExpired(): { savedAt: string; expiredAt: string } | null {
  const stored = readCredentials();
  if (!stored) return null;
  if (!stored.expiredAt) {
    stored.expiredAt = new Date().toISOString();
    writeCredentials(stored);
    console.error(`[google] the sign-in from ${stored.savedAt} is no longer accepted (invalid_grant)`);
  }
  return { savedAt: stored.savedAt, expiredAt: stored.expiredAt };
}

export type ConnectionState =
  | { status: 'not-configured' }
  | { status: 'not-connected' }
  /** Signed in, but the calendar checkbox was left unticked on the consent screen. */
  | { status: 'missing-scope'; account?: string; savedAt: string }
  /** Google stopped accepting the sign-in (it expired, or access was removed): Reconnect. */
  | { status: 'expired'; account?: string; savedAt: string; expiredAt: string }
  | { status: 'connected'; account?: string; savedAt: string };

export function connectionState(): ConnectionState {
  if (!oauthApp()) return { status: 'not-configured' };
  const stored = readCredentials();
  if (!stored) return { status: 'not-connected' };
  if (stored.expiredAt) return { status: 'expired', account: stored.account, savedAt: stored.savedAt, expiredAt: stored.expiredAt };
  // Grants saved before scopes were recorded report "connected"; a missing
  // scope then surfaces on the first calendar read instead.
  if (stored.scopes && !grantsCalendar(stored.scopes)) {
    return { status: 'missing-scope', account: stored.account, savedAt: stored.savedAt };
  }
  return { status: 'connected', account: stored.account, savedAt: stored.savedAt };
}
