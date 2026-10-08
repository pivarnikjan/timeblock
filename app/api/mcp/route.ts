import { revalidatePath } from 'next/cache';
import { jsonBody, turnAway } from '@/lib/api/http';
import { handleMcp } from '@/lib/commands/mcp';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * The MCP endpoint (Streamable HTTP, answered as plain JSON): what LLM clients
 * connect to, directly or through `scripts/timeblock-mcp.mjs`. The same
 * commands as `/api/v1`, behind the same token (docs/llm-access.md).
 */
export async function POST(request: Request) {
  const refused = turnAway(request);
  if (refused) return refused;

  let body: unknown;
  try {
    body = await jsonBody(request);
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The request body is not JSON.' } }, { status: 400 });
  }

  const { reply, wrote } = await handleMcp(env(), body);
  if (wrote) revalidatePath('/', 'layout');
  // Notifications are taken note of; there is nothing to say back.
  return reply === null ? new Response(null, { status: 202 }) : Response.json(reply);
}

/** No stream is offered: the server never speaks first. */
const postOnly = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });

export const GET = postOnly;
export const DELETE = postOnly;
