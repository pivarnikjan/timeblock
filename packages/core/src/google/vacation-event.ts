import { DateTime } from 'luxon';
import type { GoogleEventBody } from './events';

/** Marks the Google events that mirror a TimeBlock vacation. */
export const VACATION_ID_KEY = 'tbVacationId';

/** Google's Tomato — the red the vacation is drawn in. */
const TOMATO = '11';

/**
 * The Google event for a vacation. Whole days (midnight to midnight) become an
 * all-day event, anything else a timed one. It carries a private vacation id,
 * so planning never mistakes it for a meeting and only TimeBlock's own copy is
 * ever updated or removed.
 */
export function vacationEventBody(
  v: { id: number; startsAt: string; endsAt: string; note: string | null },
  zone: string,
  windowNames: string[],
): GoogleEventBody {
  const start = DateTime.fromISO(v.startsAt).setZone(zone);
  const end = DateTime.fromISO(v.endsAt).setZone(zone);
  const wholeDays = start.equals(start.startOf('day')) && end.equals(end.startOf('day'));

  return {
    summary: `🏖 Vacation${v.note ? ` · ${v.note}` : ''}`,
    description: [
      'Set in TimeBlock.',
      windowNames.length > 0 ? `Unavailable for: ${windowNames.join(', ')}. Nothing is planned in these windows while you are away.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: wholeDays ? { date: start.toISODate()! } : { dateTime: v.startsAt, timeZone: zone },
    end: wholeDays ? { date: end.toISODate()! } : { dateTime: v.endsAt, timeZone: zone },
    transparency: 'opaque',
    colorId: TOMATO,
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { [VACATION_ID_KEY]: String(v.id) } },
  };
}
