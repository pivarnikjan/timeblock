import { replaceApiTokenAction } from '@/app/actions/api-access';
import { Button, Card } from '@/components/ui';

const CODE = 'rounded bg-background px-1';
const BLOCK = 'mt-1 overflow-x-auto rounded-md border border-border bg-background p-3 text-xs';

/**
 * Settings → LLM access: where an LLM client (or a script) connects, the token
 * it must present, and the configuration to paste into the client.
 */
export function LlmAccessCard({ token, baseUrl, bridgePath, replaced }: { token: string; baseUrl: string; bridgePath: string; replaced: boolean }) {
  const stdio = JSON.stringify(
    { mcpServers: { timeblock: { command: 'node', args: [bridgePath], env: { TIMEBLOCK_API_TOKEN: token } } } },
    null,
    2,
  );

  return (
    <Card>
      <h2 id="llm-access" className="text-sm font-medium">
        LLM access
      </h2>
      <p className="mt-1 text-xs text-muted">
        Let an LLM client — Claude, Codex, a local model — create and change calendar events and tasks from a prompt.
        It can only reach TimeBlock on this computer, only with the token below, and every change is shown to you
        before it is made. Step-by-step setup for Claude and Codex: <code className={CODE}>docs/llm-access-setup.md</code>.
      </p>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-xs text-muted">MCP endpoint</dt>
        <dd>
          <code className={CODE}>{baseUrl}/api/mcp</code>
        </dd>
        <dt className="text-xs text-muted">HTTP API</dt>
        <dd>
          <code className={CODE}>{baseUrl}/api/v1/…</code> <span className="text-xs text-muted">— described by</span>{' '}
          <code className={CODE}>{baseUrl}/api/v1/openapi.json</code>
        </dd>
      </dl>

      {replaced && (
        <p className="mt-3 text-xs text-emerald-600">
          The token was replaced. Clients set up with the old one are refused until you give them the new one.
        </p>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Show the token and the client configuration</summary>
        <p className="mt-2 text-xs text-muted">
          The token is a password to your calendar and tasks: paste it only into a client&apos;s configuration on this
          computer.
        </p>
        <pre className={BLOCK}>{token}</pre>
        <p className="mt-3 text-xs text-muted">
          Clients that start a local server (Claude desktop: Settings → Developer → Edit Config):
        </p>
        <pre className={BLOCK}>{stdio}</pre>
        <p className="mt-3 text-xs text-muted">
          Clients that connect to a URL: the MCP endpoint above, with the header{' '}
          <code className={CODE}>Authorization: Bearer &lt;token&gt;</code>.
        </p>
      </details>

      <form action={replaceApiTokenAction} className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button type="submit">Replace token</Button>
        <span className="text-xs text-muted">Use this if the token may have been seen by someone else.</span>
      </form>
    </Card>
  );
}
