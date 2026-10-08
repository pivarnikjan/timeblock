import type { Env } from '@timeblock/core/env';
import { CalendarApiError } from '@timeblock/core/google/calendar-api';
import { changeCommands } from './changes';
import { CommandError, type Command } from './command';
import { readCommands } from './reads';
import { validate } from './schema';

/**
 * Every command TimeBlock offers to programs (decision_log.md, ADR-001). The
 * HTTP API (`/api/v1/<name>`), its OpenAPI document and the MCP tool list are
 * made from this list — add a command here and all three have it.
 */
export const commands: Command[] = [...readCommands, ...changeCommands];

export const findCommand = (name: string): Command | undefined => commands.find((c) => c.name === name);

/** Runs a command on input from outside: checked against its schema first. */
export async function runCommand(env: Env, name: string, input: unknown): Promise<Record<string, unknown>> {
  const command = findCommand(name);
  if (!command) throw new CommandError(404, `There is no command "${name}". Known: ${commands.map((c) => c.name).join(', ')}.`);
  const problems = validate(command.input, input ?? {});
  if (problems.length > 0) throw new CommandError(400, `The input for ${name} does not fit.`, problems);
  return command.run(env, input ?? {});
}

/** A failure as the API reports it: a status, a sentence, and the separate problems if there are several. */
export function failure(error: unknown): { status: number; body: { error: string; problems?: string[] } } {
  if (error instanceof CommandError) {
    return { status: error.status, body: { error: error.message, ...(error.problems.length > 0 ? { problems: error.problems } : {}) } };
  }
  if (error instanceof CalendarApiError) return { status: 502, body: { error: `Google Calendar refused: ${error.message}` } };
  return { status: 500, body: { error: (error as Error)?.message ?? 'Something went wrong.' } };
}
