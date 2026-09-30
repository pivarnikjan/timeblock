import type { GoogleCalendarListEntry, GoogleEvent } from './events';

/**
 * Google Calendar's REST API, the part TimeBlock uses, over plain fetch — so
 * the desktop and the phone share it (like `googleDrive` for sync).
 */

export interface EventListPage {
  items: GoogleEvent[];
  nextPageToken: string | null;
}

export interface EventListQuery {
  timeMin: string;
  timeMax: string;
  orderBy?: 'startTime';
  pageToken?: string;
}

/** An event body as written: TimeBlock's own events, or a patch of some of their fields. */
export type EventWrite = Partial<Omit<GoogleEvent, 'id'>>;

export interface CalendarApi {
  /** The account's calendar list (`showHidden`: calendars unticked in Google too). */
  listCalendars(options?: { showHidden?: boolean }): Promise<GoogleCalendarListEntry[]>;
  /** Throws a 404 `CalendarApiError` when the calendar no longer exists. */
  getCalendar(calendarId: string): Promise<{ id: string }>;
  insertCalendar(body: { summary: string; timeZone: string }): Promise<{ id: string }>;
  /** One page of expanded events (recurring events as single occurrences). */
  listEvents(calendarId: string, query: EventListQuery): Promise<EventListPage>;
  insertEvent(calendarId: string, body: EventWrite): Promise<GoogleEvent>;
  patchEvent(calendarId: string, eventId: string, body: EventWrite): Promise<GoogleEvent>;
  updateEvent(calendarId: string, eventId: string, body: EventWrite): Promise<GoogleEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/**
 * Google refused. `status` (also as `code`, the shape googleapis errors have)
 * is the HTTP status, `message` Google's own explanation.
 */
export class CalendarApiError extends Error {
  readonly code: number;
  constructor(
    readonly status: number,
    message: string,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = 'CalendarApiError';
    this.code = status;
  }
}

/** The event or calendar is gone (deleted by hand in Google): nothing left to undo. */
export function isGone(error: unknown): boolean {
  const e = error as { code?: number; status?: number } | null;
  const code = e?.code ?? e?.status;
  return code === 404 || code === 410;
}

const API = 'https://www.googleapis.com/calendar/v3';

/** A query string without URLSearchParams, whose React Native version is incomplete. */
const query = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

const calendarPath = (calendarId: string) => `${API}/calendars/${encodeURIComponent(calendarId)}`;
const eventPath = (calendarId: string, eventId: string) => `${calendarPath(calendarId)}/events/${encodeURIComponent(eventId)}`;

/**
 * @param accessToken a current OAuth access token with the calendar scope. Called
 *   with `true` once after Google answers 401, for a renewed one.
 * @param fetchImpl the platform's fetch
 */
export function googleCalendar(accessToken: (renew?: boolean) => Promise<string>, fetchImpl: typeof fetch = fetch): CalendarApi {
  async function send(url: string, method: string, body?: unknown, renew = false): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken(renew)}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401 && !renew) return send(url, method, body, true);
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    let message = `Google Calendar answered ${res.status}`;
    let reason: string | null = null;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } };
      message = parsed.error?.message ?? message;
      reason = parsed.error?.errors?.[0]?.reason ?? null;
    } catch {
      // Not JSON; keep the status line.
    }
    throw new CalendarApiError(res.status, message, reason);
  }

  const json = async <T>(url: string, method = 'GET', body?: unknown): Promise<T> => (await (await send(url, method, body)).json()) as T;

  return {
    async listCalendars(options = {}) {
      const items: GoogleCalendarListEntry[] = [];
      let pageToken: string | undefined;
      do {
        const page = await json<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>(
          `${API}/users/me/calendarList?${query({ maxResults: '250', showHidden: String(options.showHidden ?? false), pageToken })}`,
        );
        items.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return items;
    },
    async getCalendar(calendarId) {
      const cal = await json<{ id?: string }>(calendarPath(calendarId));
      return { id: cal.id ?? calendarId };
    },
    async insertCalendar(body) {
      const cal = await json<{ id?: string }>(`${API}/calendars`, 'POST', body);
      if (!cal.id) throw new Error('Google did not return an id for the new calendar');
      return { id: cal.id };
    },
    async listEvents(calendarId, q) {
      const page = await json<{ items?: GoogleEvent[]; nextPageToken?: string }>(
        `${calendarPath(calendarId)}/events?${query({
          timeMin: q.timeMin,
          timeMax: q.timeMax,
          singleEvents: 'true',
          orderBy: q.orderBy,
          maxResults: '2500',
          pageToken: q.pageToken,
        })}`,
      );
      return { items: page.items ?? [], nextPageToken: page.nextPageToken ?? null };
    },
    insertEvent: (calendarId, body) => json<GoogleEvent>(`${calendarPath(calendarId)}/events`, 'POST', body),
    patchEvent: (calendarId, eventId, body) => json<GoogleEvent>(eventPath(calendarId, eventId), 'PATCH', body),
    updateEvent: (calendarId, eventId, body) => json<GoogleEvent>(eventPath(calendarId, eventId), 'PUT', body),
    async deleteEvent(calendarId, eventId) {
      await send(eventPath(calendarId, eventId), 'DELETE');
    },
  };
}
