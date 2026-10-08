import 'server-only';
import { refusal } from './guard';
import { apiToken } from './token';

/** The response turning a request away from the local API, or null when it may pass (see guard.ts). */
export function turnAway(request: Request): Response | null {
  const refused = refusal(request.headers, apiToken());
  if (!refused) return null;
  return Response.json({ error: refused.error }, { status: refused.status, headers: refused.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined });
}

/** A request's JSON body; an empty body is `{}`. Throws on text that is not JSON. */
export async function jsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text.trim() === '' ? {} : JSON.parse(text);
}
