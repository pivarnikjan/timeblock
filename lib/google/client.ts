import 'server-only';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { oauthApp, readCredentials, redirectUri, writeCredentials } from './credentials';
import { grantsCalendar, SCOPES } from './scopes';

export { CALENDAR_SCOPE, SCOPES, grantsCalendar, isMissingScopeError, MISSING_SCOPE_HELP } from './scopes';

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
  if (!stored) throw new NotConnectedError();

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

export function calendarApi() {
  return google.calendar({ version: 'v3', auth: authorizedClient() });
}

export type ConnectionState =
  | { status: 'not-configured' }
  | { status: 'not-connected' }
  /** Signed in, but the calendar checkbox was left unticked on the consent screen. */
  | { status: 'missing-scope'; account?: string; savedAt: string }
  | { status: 'connected'; account?: string; savedAt: string };

export function connectionState(): ConnectionState {
  if (!oauthApp()) return { status: 'not-configured' };
  const stored = readCredentials();
  if (!stored) return { status: 'not-connected' };
  // Grants saved before scopes were recorded report "connected"; a missing
  // scope then surfaces on the first calendar read instead.
  if (stored.scopes && !grantsCalendar(stored.scopes)) {
    return { status: 'missing-scope', account: stored.account, savedAt: stored.savedAt };
  }
  return { status: 'connected', account: stored.account, savedAt: stored.savedAt };
}
