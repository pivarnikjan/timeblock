import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { apiTokenPath } from '@/lib/db/paths';

/**
 * The secret a program presents to use the local API — kept beside the Google
 * grant, outside the repo. Made the first time it is needed; Settings → LLM
 * access shows it and can replace it.
 */
function writeToken(): string {
  const token = `tb_${randomBytes(32).toString('base64url')}`;
  const path = apiTokenPath();
  writeFileSync(path, token, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes; the file inherits the user-only ACL of %LOCALAPPDATA%.
  }
  return token;
}

export function apiToken(): string {
  try {
    const token = readFileSync(apiTokenPath(), 'utf8').trim();
    if (token.length >= 20) return token;
  } catch {
    // Not made yet.
  }
  return writeToken();
}

/** A new token; every client holding the old one is locked out until given this one. */
export function replaceApiToken(): string {
  return writeToken();
}
