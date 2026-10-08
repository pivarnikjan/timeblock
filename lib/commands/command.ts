import type { Env } from '@timeblock/core/env';
import type { JsonSchema } from './schema';

/**
 * One thing a program — an LLM client, a script — can ask TimeBlock to do.
 * Described once here; the HTTP API, its OpenAPI document and the MCP tool
 * list are all made from this description (decision_log.md, ADR-001).
 */
export interface Command {
  /** `snake_case`; the HTTP path (`/api/v1/<name>`) and the MCP tool name. */
  name: string;
  /** For the model choosing a tool: what it does and when to use it. */
  description: string;
  input: JsonSchema;
  /** Changes nothing — in TimeBlock or in Google. */
  readOnly: boolean;
  /** May delete or overwrite; clients ask before running it. */
  destructive: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(env: Env, input: any): Promise<Record<string, unknown>>;
}

/** A refusal with its HTTP status: 400 bad input, 404 unknown, 409 out of date or not possible now, 422 nothing prepared. */
export class CommandError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** One sentence per problem, when there are several. */
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

/** Google Calendar must be connected for anything touching events. */
export function needGoogle(env: Env): void {
  const status = env.google.status();
  if (status === 'connected') return;
  throw new CommandError(
    409,
    status === 'missing-scope'
      ? 'Google is signed in without calendar access — reconnect in TimeBlock’s Settings and tick the calendar box.'
      : 'Google Calendar is not connected — connect it in TimeBlock’s Settings.',
  );
}
