import { turnAway } from '@/lib/api/http';
import { openApiDocument } from '@/lib/commands/openapi';
import { commands } from '@/lib/commands/registry';

export const dynamic = 'force-dynamic';

/** The API described for programs: every command, its input and its refusals. */
export async function GET(request: Request) {
  return turnAway(request) ?? Response.json(openApiDocument(commands, new URL(request.url).origin));
}
