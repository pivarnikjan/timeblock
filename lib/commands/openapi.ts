import type { Command } from './command';

export const API_VERSION = '1.0.0';

const ERROR = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'what went wrong, in a sentence' },
    problems: { type: 'array', items: { type: 'string' }, description: 'each problem, when there are several' },
  },
  required: ['error'],
};

const refused = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });

/**
 * The HTTP API as an OpenAPI 3.1 document, made from the commands — what
 * frameworks and clients that import OpenAPI read. Every command is a POST
 * with a JSON body, read or write alike.
 */
export function openApiDocument(commands: Command[], serverUrl: string): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'TimeBlock',
      version: API_VERSION,
      description:
        'Calendar events and tasks in TimeBlock, a local planning assistant. Changes are made in two steps: preview_changes says what would happen and returns a changeSetId; apply_changes carries it out. Dates are YYYY-MM-DD and times HH:mm, local to the timezone get_context reports.',
    },
    servers: [{ url: serverUrl }],
    security: [{ token: [] }],
    paths: Object.fromEntries(
      commands.map((c) => [
        `/api/v1/${c.name}`,
        {
          post: {
            operationId: c.name,
            summary: c.description.split('. ')[0].replace(/\.$/, ''),
            description: c.description,
            'x-read-only': c.readOnly,
            'x-destructive': c.destructive,
            requestBody: { required: true, content: { 'application/json': { schema: c.input } } },
            responses: {
              '200': { description: 'The result.', content: { 'application/json': { schema: { type: 'object' } } } },
              '400': refused('The input does not fit the schema.'),
              '401': refused('The token is missing or wrong.'),
              '403': refused('The request did not come from this computer.'),
              '409': refused('Not possible now: Google is not connected, or the data changed after the preview.'),
              '422': refused('Nothing was prepared: one or more changes have a problem.'),
            },
          },
        },
      ]),
    ),
    components: {
      securitySchemes: { token: { type: 'http', scheme: 'bearer', description: 'The token from TimeBlock → Settings → LLM access.' } },
      schemas: { Error: ERROR },
    },
  };
}
