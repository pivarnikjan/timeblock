import { DateTime } from 'luxon';
import { categoryColorUpdate, categoryOf } from '../calendar/categories';
import { nearestEventColorId } from '../calendar/colors';
import { eventKey } from '../calendar/filters';
import { REVIEW_DAYS } from '../calendar/load';
import type { Env } from '../env';
import { listCategories } from '../store/categories';
import { listMarks } from '../store/event-marks';
import { getSettings } from '../store/settings';
import { nowIn } from '../time/periods';
import { BLOCK_COLOR_KEY } from './events';
import { listCalendars, listRangeEvents } from './reads';

export interface CategoryColorResult {
  /** Series and single events given their category's colour. */
  recoloured: number;
  /** Left alone: someone chose their colour in Google after TimeBlock coloured them. */
  chosenByHand: number;
  /** No longer in a category: the colour TimeBlock had given them was taken off. */
  cleared: number;
  /** Could not be changed (Google refused, e.g. an event someone else organises). */
  failed: number;
}

/**
 * Gives Google events their category's colour — the nearest of Google's own,
 * stamped like a block's (`tbColorId`), so a colour chosen in Google later is
 * recognised and kept. An event that left its category loses the colour
 * TimeBlock gave it (if nobody changed it since).
 *
 * Covers the next three months of every calendar the account can edit (not
 * TimeBlock's own). A repeating event is coloured once, on its series, so every
 * repeat follows — including those further out. `only` limits it to some
 * series keys (`calendarId|seriesId`), after one event's category changed.
 */
export async function syncCategoryColors(env: Env, only?: ReadonlySet<string>): Promise<CategoryColorResult> {
  const result: CategoryColorResult = { recoloured: 0, chosenByHand: 0, cleared: 0, failed: 0 };
  if (env.google.status() !== 'connected') return result;

  const [settings, categories, marks] = await Promise.all([getSettings(env.db), listCategories(env.db), listMarks(env.db)]);
  const zone = settings.timezone;
  const from = nowIn(zone).toISODate()!;
  const until = DateTime.fromISO(from, { zone }).plus({ days: REVIEW_DAYS }).toISODate()!;
  const calendars = (await listCalendars(env)).filter((c) => c.writable && c.id !== settings.targetCalendarId);
  const events = await listRangeEvents(env, from, until, zone, calendars);

  const api = env.google.calendar();
  const done = new Set<string>();
  for (const e of events) {
    const key = eventKey(e);
    if (done.has(key) || (only && !only.has(key)) || e.blockId !== null || e.vacationId !== null) continue;
    done.add(key);

    const { category } = categoryOf(e.title, marks.get(key), categories);
    let set: string | null;
    if (category) {
      const update = categoryColorUpdate(e, nearestEventColorId(category.color));
      if (update === 'chosen-by-hand') result.chosenByHand += 1;
      if (typeof update === 'string') continue;
      set = update.set;
    } else {
      // Out of every category: take back the colour TimeBlock gave, unless someone changed it since.
      if (e.plannedColorId === null || e.colorId !== e.plannedColorId) continue;
      set = null;
    }

    try {
      // The series (or the single event) itself; its other private stamps are kept.
      // Null removes a value in a PATCH — the colour (back to the calendar's) and the stamp alike.
      const target = await api.getEvent(e.calendarId, e.seriesId);
      const stamps: Record<string, string | null> = { ...(target.extendedProperties?.private ?? {}), [BLOCK_COLOR_KEY]: set };
      await api.patchEvent(e.calendarId, e.seriesId, { colorId: set, extendedProperties: { private: stamps as Record<string, string> } });
      if (set === null) result.cleared += 1;
      else result.recoloured += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
