import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Everything the user owns — the database and the Google refresh token — lives
 * outside the repo so a stray `git add -A` can never publish it.
 * Override with TIMEBLOCK_DATA_DIR (used by tests).
 */
export function dataDir(): string {
  const configured = process.env.TIMEBLOCK_DATA_DIR;
  const base =
    configured ??
    path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), '.local', 'share'), 'timeblock');
  mkdirSync(base, { recursive: true });
  return base;
}

export function dbPath(): string {
  return path.join(dataDir(), 'timeblock.db');
}

export function credentialsPath(): string {
  return path.join(dataDir(), 'credentials.json');
}

/** The token programs present to the local API (see lib/api/token.ts). */
export function apiTokenPath(): string {
  return path.join(dataDir(), 'api-token');
}
