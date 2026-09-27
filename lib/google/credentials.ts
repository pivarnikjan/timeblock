import 'server-only';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { credentialsPath } from '@/lib/db/paths';

/**
 * The long-lived half of the OAuth grant. Kept in %LOCALAPPDATA% rather than the
 * database so it never rides along in a backup or a copied project folder.
 */
export interface StoredCredentials {
  refreshToken: string;
  /** Which Google account the grant belongs to, for display only. */
  account?: string;
  /** Scopes Google actually granted — not necessarily all that were asked for. */
  scopes?: string[];
  savedAt: string;
}

export interface OAuthApp {
  clientId: string;
  clientSecret: string;
}

/** The OAuth client the user registered in Google Cloud, from .env.local. */
export function oauthApp(): OAuthApp | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function redirectUri(): string {
  const base = process.env.TIMEBLOCK_BASE_URL?.trim() || 'http://localhost:4321';
  return `${base}/api/google/callback`;
}

export function readCredentials(): StoredCredentials | null {
  try {
    return JSON.parse(readFileSync(credentialsPath(), 'utf8')) as StoredCredentials;
  } catch {
    return null;
  }
}

export function writeCredentials(credentials: StoredCredentials): void {
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(credentials, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes; the file inherits the user-only ACL of %LOCALAPPDATA%.
  }
}

export function clearCredentials(): void {
  rmSync(credentialsPath(), { force: true });
}
