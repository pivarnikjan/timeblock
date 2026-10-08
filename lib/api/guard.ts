import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Who may call the local API. Listening on localhost does not make it private:
 * any web page open in the browser can send requests to http://localhost:4321.
 * So a request must (1) be addressed to this computer by a loopback name — a
 * page that points its own domain at 127.0.0.1 (DNS rebinding) is not —,
 * (2) not come from a web page of another site, and (3) carry the token.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostname(value: string, isUrl: boolean): string | null {
  try {
    return new URL(isUrl ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const sameSecret = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export interface Refusal {
  status: 401 | 403;
  error: string;
}

/** Why a request with these headers is refused; null when it may pass. */
export function refusal(headers: Headers, token: string): Refusal | null {
  const host = hostname(headers.get('host') ?? '', false);
  if (!host || !LOOPBACK.has(host)) return { status: 403, error: 'TimeBlock’s API answers on this computer only (localhost).' };

  const origin = headers.get('origin');
  if (origin !== null) {
    const from = hostname(origin, true);
    if (!from || !LOOPBACK.has(from)) return { status: 403, error: 'Requests from web pages of other sites are refused.' };
  }

  const given = /^Bearer\s+(.+)$/i.exec(headers.get('authorization') ?? '')?.[1]?.trim();
  if (!given || !sameSecret(given, token)) {
    return { status: 401, error: 'Missing or wrong token. Send "Authorization: Bearer <token>" with the token from TimeBlock → Settings → LLM access.' };
  }
  return null;
}
