import { describe, expect, it } from 'vitest';
import { CalendarApiError, googleCalendar, isGone } from './calendar-api';
import { isMissingScopeError } from './scopes';

interface Call {
  url: string;
  method: string;
  auth: string;
  body: unknown;
}

/** A fetch that records each request and answers from `respond`. */
function recorder(respond: (call: Call, n: number) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call = { url, method: init.method ?? 'GET', auth: headers.Authorization, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const { status, body } = respond(call, calls.length);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('googleCalendar (fetch client)', () => {
  it('lists events with the query Google expects, following pages', async () => {
    const { calls, fetchImpl } = recorder((_c, n) => ({
      status: 200,
      body: n === 1 ? { items: [{ id: 'a' }], nextPageToken: 'p2' } : { items: [{ id: 'b' }] },
    }));
    const api = googleCalendar(async () => 'tok', fetchImpl);

    const first = await api.listEvents('me@x.com', { timeMin: '2026-10-01T00:00:00Z', timeMax: '2026-10-02T00:00:00Z', orderBy: 'startTime' });
    const second = await api.listEvents('me@x.com', { timeMin: '2026-10-01T00:00:00Z', timeMax: '2026-10-02T00:00:00Z', pageToken: first.nextPageToken! });

    expect(first).toEqual({ items: [{ id: 'a' }], nextPageToken: 'p2' });
    expect(second).toEqual({ items: [{ id: 'b' }], nextPageToken: null });
    expect(calls[0].url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/me%40x.com/events?timeMin=2026-10-01T00%3A00%3A00Z&timeMax=2026-10-02T00%3A00%3A00Z&singleEvents=true&orderBy=startTime&maxResults=2500',
    );
    expect(calls[1].url).toContain('pageToken=p2');
    expect(calls[0].auth).toBe('Bearer tok');
  });

  it('sends writes as JSON with the right method', async () => {
    const { calls, fetchImpl } = recorder(() => ({ status: 200, body: { id: 'e1' } }));
    const api = googleCalendar(async () => 'tok', fetchImpl);

    await api.insertEvent('c', { summary: 'Focus' });
    await api.patchEvent('c', 'e1', { colorId: '2' });
    await api.updateEvent('c', 'e1', { summary: 'Vacation' });

    expect(calls.map((c) => [c.method, c.url.replace('https://www.googleapis.com/calendar/v3', '')])).toEqual([
      ['POST', '/calendars/c/events'],
      ['PATCH', '/calendars/c/events/e1'],
      ['PUT', '/calendars/c/events/e1'],
    ]);
    expect(calls[0].body).toEqual({ summary: 'Focus' });
  });

  it('retries once with a renewed token after a 401', async () => {
    const { calls, fetchImpl } = recorder((_c, n) => (n === 1 ? { status: 401 } : { status: 204 }));
    const renewals: boolean[] = [];
    const api = googleCalendar(async (renew) => {
      renewals.push(renew === true);
      return renew ? 'fresh' : 'stale';
    }, fetchImpl);

    await api.deleteEvent('c', 'e1');

    expect(renewals).toEqual([false, true]);
    expect(calls.map((c) => c.auth)).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it("reports Google's refusal in a shape the existing checks understand", async () => {
    const scope = recorder(() => ({ status: 403, body: { error: { message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }] } } }));
    const gone = recorder(() => ({ status: 410, body: { error: { message: 'Resource has been deleted' } } }));

    const refused = await googleCalendar(async () => 't', scope.fetchImpl).getCalendar('c').catch((e) => e);
    const deleted = await googleCalendar(async () => 't', gone.fetchImpl).deleteEvent('c', 'e').catch((e) => e);

    expect(refused).toBeInstanceOf(CalendarApiError);
    expect(refused).toMatchObject({ status: 403, code: 403, reason: 'insufficientPermissions' });
    expect(isMissingScopeError(refused)).toBe(true);
    expect(isGone(deleted)).toBe(true);
    expect(isGone(refused)).toBe(false);
  });
});
