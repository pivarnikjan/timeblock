import { DateTime } from 'luxon';
import type { Settings, Vacation } from '../db/schema';
import type { Env } from '../env';
import { listCalendars, listRangeEvents } from '../google/reads';
import { isMissingScopeError, MISSING_SCOPE_HELP } from '../google/scopes';
import * as blockStore from '../store/blocks';
import { listWindows } from '../store/windows';
import { blockColor, eventColor, windowColors } from './colors';
import { overlaps } from './overlap';

/** Something already scheduled during a vacation, offered for deletion. */
export interface Conflict {
  /** Form value identifying it: an event (calendar + id) or a block. */
  value: string;
  kind: 'event' | 'block';
  title: string;
  /** UTC ISO start, for ordering. */
  startsAt: string;
  when: string;
  /** Calendar name, or "TimeBlock" for blocks. */
  source: string;
  color: string;
  /** Can be deleted here; if not, `why` says why. */
  deletable: boolean;
  why: string | null;
  recurring: boolean;
}

export interface Conflicts {
  items: Conflict[];
  /** Google could not be read, so only TimeBlock's blocks are listed. */
  problem: string | null;
}

export type ConflictTarget = { kind: 'event'; calendarId: string; eventId: string } | { kind: 'block'; id: number };

export function conflictValue(t: ConflictTarget): string {
  return JSON.stringify(t);
}

function when(start: DateTime, end: DateTime, allDay: boolean): string {
  if (allDay) {
    const last = end.minus({ days: 1 });
    return start.hasSame(last, 'day') ? `${start.toFormat('ccc d LLL')} · all day` : `${start.toFormat('ccc d LLL')} – ${last.toFormat('ccc d LLL')}`;
  }
  return start.hasSame(end, 'day')
    ? `${start.toFormat('ccc d LLL · HH:mm')}–${end.toFormat('HH:mm')}`
    : `${start.toFormat('ccc d LLL HH:mm')} – ${end.toFormat('ccc d LLL HH:mm')}`;
}

/**
 * Everything already scheduled during a vacation: Google events on every
 * calendar the account shows (hidden ones included — they are still in the
 * calendar), and TimeBlock's blocks. TimeBlock's own Google copies are listed
 * as blocks, once.
 */
export async function vacationConflicts(env: Env, v: Vacation, settings: Settings): Promise<Conflicts> {
  const zone = settings.timezone;
  const start = DateTime.fromISO(v.startsAt).setZone(zone);
  const end = DateTime.fromISO(v.endsAt).setZone(zone);
  const firstDay = start.toISODate()!;
  const lastDay = end.minus({ milliseconds: 1 }).toISODate()!;
  const afterLast = DateTime.fromISO(lastDay, { zone }).plus({ days: 1 }).toISODate()!;

  const items: Conflict[] = [];
  let problem: string | null = null;

  const status = env.google.status();
  if (status === 'connected') {
    try {
      const calendars = (await listCalendars(env)).filter((c) => c.id !== settings.targetCalendarId);
      const byId = new Map(calendars.map((c) => [c.id, c]));
      const events = await listRangeEvents(env, firstDay, afterLast, zone, calendars);
      for (const e of events) {
        if (e.blockId !== null || e.vacationId !== null || !overlaps(e.start, e.end, v.startsAt, v.endsAt)) continue;
        const cal = byId.get(e.calendarId);
        items.push({
          value: conflictValue({ kind: 'event', calendarId: e.calendarId, eventId: e.id }),
          kind: 'event',
          title: e.title,
          startsAt: e.start,
          when: when(DateTime.fromISO(e.start).setZone(zone), DateTime.fromISO(e.end).setZone(zone), e.allDay),
          source: cal?.summary ?? e.calendarId,
          color: eventColor(e.colorId, cal?.background),
          deletable: cal?.writable ?? false,
          why: cal?.writable ? null : 'read-only calendar',
          recurring: e.recurring,
        });
      }
    } catch (error) {
      problem = isMissingScopeError(error) ? MISSING_SCOPE_HELP : (error as Error).message;
    }
  } else if (status === 'missing-scope') {
    problem = MISSING_SCOPE_HELP;
  }

  const colorOfWindow = windowColors(await listWindows(env.db));
  for (const b of await blockStore.listForRange(env.db, firstDay, lastDay)) {
    if (!overlaps(b.startsAt, b.endsAt, v.startsAt, v.endsAt)) continue;
    const locked = b.state === 'done' || blockStore.isLocked(b);
    items.push({
      value: conflictValue({ kind: 'block', id: b.id }),
      kind: 'block',
      title: b.segments.map((s) => s.task.title).join(' + ') || 'Focus block',
      startsAt: b.startsAt,
      when: when(DateTime.fromISO(b.startsAt).setZone(zone), DateTime.fromISO(b.endsAt).setZone(zone), false),
      source: b.state === 'draft' ? 'TimeBlock draft' : 'TimeBlock',
      color: blockColor(b.windowId !== null ? colorOfWindow.get(b.windowId) : null, b.segments[0]?.task.energy ?? 'deep'),
      deletable: !locked,
      why: locked ? 'has ticked-off work' : null,
      recurring: false,
    });
  }

  items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { items, problem };
}
