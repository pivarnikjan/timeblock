#!/usr/bin/env node
/**
 * TimeBlock's MCP server for clients that start a local process and talk to it
 * over stdin/stdout (Claude desktop, Codex, most local-model clients).
 *
 * It is a pipe and nothing more: each JSON-RPC message read from stdin is sent
 * to the running TimeBlock app (http://localhost:4321/api/mcp) and the answer
 * written to stdout. It has no logic and never opens the database — on purpose:
 * a process started by a packaged app sees a private copy of %LOCALAPPDATA%,
 * and would read the wrong one (decision_log.md, ADR-001).
 *
 * Needs TimeBlock running, and its token in the client's configuration:
 *   TIMEBLOCK_API_TOKEN   the token from TimeBlock → Settings → LLM access
 *   TIMEBLOCK_URL         where TimeBlock runs; default http://localhost:4321
 *
 * No dependencies — plain Node 18 or later. Setup: docs/llm-access.md.
 */
import { createInterface } from 'node:readline';

const base = (process.env.TIMEBLOCK_URL || 'http://localhost:4321').replace(/\/+$/, '');
const token = process.env.TIMEBLOCK_API_TOKEN || '';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

/** Ids of the requests in a message (one, or a batch); notifications have none and get no answer. */
function requestIds(line) {
  try {
    const parsed = JSON.parse(line);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((m) => m && m.method !== undefined && m.id !== undefined).map((m) => m.id);
  } catch {
    return [];
  }
}

async function forward(line) {
  const fail = (message) => {
    for (const id of requestIds(line)) send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
  };
  if (!token) return fail('TIMEBLOCK_API_TOKEN is not set. Copy the token from TimeBlock → Settings → LLM access into this server’s configuration.');

  let response;
  try {
    response = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: line,
    });
  } catch {
    return fail(`TimeBlock is not running at ${base}. Start it, then try again.`);
  }

  const text = await response.text();
  if (response.status === 401) return fail('TimeBlock refused the token. Copy the current one from TimeBlock → Settings → LLM access.');
  if (text.trim() === '') return;
  try {
    send(JSON.parse(text));
  } catch {
    fail(`TimeBlock answered ${response.status} with something that is not JSON. Is ${base} really TimeBlock, and up to date?`);
  }
}

// One at a time, in the order received.
let queue = Promise.resolve();
createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (line.trim() !== '') queue = queue.then(() => forward(line));
});
