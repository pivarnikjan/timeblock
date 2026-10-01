import type { CalendarApi, EventWrite } from './calendar-api';
import { CalendarApiError } from './calendar-api';
import type { GoogleCalendarListEntry, GoogleEvent } from './events';

/**
 * An in-memory Google Calendar for tests and the phone's demo mode: calendars
 * and events live in maps, ids are counters, and what was written can be
 * inspected. Behaves like the API where TimeBlock relies on it — 404 for a
 * missing calendar or event, only the calendar list's `selected` ones shown.
 */
export class FakeCalendar implements CalendarApi {
  readonly calendars = new Map<string, GoogleCalendarListEntry>();
  readonly events = new Map<string, Map<string, GoogleEvent>>();
  private next = 1;

  constructor(calendars: GoogleCalendarListEntry[] = [{ id: 'primary', summary: 'Me', primary: true, selected: true, accessRole: 'owner' }]) {
    for (const c of calendars) this.addCalendar(c);
  }

  addCalendar(entry: GoogleCalendarListEntry): string {
    const id = entry.id ?? `cal${this.next++}`;
    this.calendars.set(id, { ...entry, id });
    this.events.set(id, new Map());
    return id;
  }

  /** Puts an event straight into a calendar, as if made in Google. */
  addEvent(calendarId: string, event: GoogleEvent): string {
    const id = event.id ?? `ev${this.next++}`;
    this.eventsOf(calendarId).set(id, { ...event, id });
    return id;
  }

  private eventsOf(calendarId: string): Map<string, GoogleEvent> {
    const events = this.events.get(calendarId);
    if (!events) throw new CalendarApiError(404, 'Not Found');
    return events;
  }

  private eventOf(calendarId: string, eventId: string): GoogleEvent {
    const event = this.eventsOf(calendarId).get(eventId);
    if (!event) throw new CalendarApiError(404, 'Not Found');
    return event;
  }

  async listCalendars(options: { showHidden?: boolean } = {}) {
    return [...this.calendars.values()].filter((c) => options.showHidden || c.selected !== false);
  }

  async getCalendar(calendarId: string) {
    if (!this.calendars.has(calendarId)) throw new CalendarApiError(404, 'Not Found');
    return { id: calendarId };
  }

  async insertCalendar(body: { summary: string; timeZone: string }) {
    return { id: this.addCalendar({ summary: body.summary, selected: true, accessRole: 'owner' }) };
  }

  async listEvents(calendarId: string, query: { timeMin: string; timeMax: string }) {
    const from = Date.parse(query.timeMin);
    const to = Date.parse(query.timeMax);
    const items = [...this.eventsOf(calendarId).values()].filter((e) => {
      const start = Date.parse(e.start?.dateTime ?? e.start?.date ?? '');
      const end = Date.parse(e.end?.dateTime ?? e.end?.date ?? '');
      return start < to && end > from;
    });
    return { items, nextPageToken: null };
  }

  async getEvent(calendarId: string, eventId: string) {
    return { ...this.eventOf(calendarId, eventId) } as GoogleEvent & Record<string, unknown>;
  }

  /** A series' occurrences as stored here: events whose `recurringEventId` is the series, before `timeMax`. */
  async listInstances(calendarId: string, seriesId: string, query: { timeMax?: string }) {
    const before = query.timeMax ? Date.parse(query.timeMax) : Infinity;
    const items = [...this.eventsOf(calendarId).values()].filter(
      (e) => e.recurringEventId === seriesId && Date.parse(e.start?.dateTime ?? e.start?.date ?? '') < before,
    );
    return { items, nextPageToken: null };
  }

  async insertEvent(calendarId: string, body: EventWrite) {
    const id = this.addEvent(calendarId, { ...body });
    return this.eventOf(calendarId, id);
  }

  /** Like Google's PATCH: fields replace, null clears; the private properties merge key by key, null removing one. */
  async patchEvent(calendarId: string, eventId: string, body: EventWrite) {
    const current = this.eventOf(calendarId, eventId);
    const merged: GoogleEvent = { ...current, ...body, id: eventId };
    if (body.extendedProperties?.private) {
      const stamps: Record<string, string> = { ...(current.extendedProperties?.private ?? {}) };
      for (const [k, v] of Object.entries(body.extendedProperties.private)) {
        if (v === null) delete stamps[k];
        else stamps[k] = v;
      }
      merged.extendedProperties = { private: stamps };
    }
    this.eventsOf(calendarId).set(eventId, merged);
    // A series' colour and private properties show on its occurrences, as in Google.
    if (current.recurrence) {
      for (const [id, occurrence] of this.eventsOf(calendarId)) {
        if (occurrence.recurringEventId !== eventId) continue;
        this.eventsOf(calendarId).set(id, { ...occurrence, colorId: merged.colorId, extendedProperties: merged.extendedProperties });
      }
    }
    return merged;
  }

  async updateEvent(calendarId: string, eventId: string, body: EventWrite) {
    this.eventOf(calendarId, eventId);
    const replaced = { ...body, id: eventId };
    this.eventsOf(calendarId).set(eventId, replaced);
    return replaced;
  }

  async deleteEvent(calendarId: string, eventId: string) {
    this.eventOf(calendarId, eventId);
    this.eventsOf(calendarId).delete(eventId);
  }
}
