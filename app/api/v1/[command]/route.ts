import { revalidatePath } from 'next/cache';
import { jsonBody, turnAway } from '@/lib/api/http';
import { failure, findCommand, runCommand } from '@/lib/commands/registry';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * The local API: `POST /api/v1/<command>` with the command's input as JSON
 * (decision_log.md, ADR-001; docs/llm-access.md). Which commands exist and what
 * they take: `GET /api/v1/openapi.json`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ command: string }> }) {
  const refused = turnAway(request);
  if (refused) return refused;

  const { command: name } = await params;
  let input: unknown;
  try {
    input = await jsonBody(request);
  } catch {
    return Response.json({ error: 'The request body is not JSON.' }, { status: 400 });
  }

  const writes = findCommand(name)?.readOnly === false;
  try {
    return Response.json(await runCommand(env(), name, input));
  } catch (error) {
    const { status, body } = failure(error);
    if (status >= 500) console.error(`[api/v1/${name}] ${body.error}`);
    return Response.json(body, { status });
  } finally {
    // The screens show what was just changed.
    if (writes) revalidatePath('/', 'layout');
  }
}
