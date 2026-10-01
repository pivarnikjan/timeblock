import { DateTime } from 'luxon';

/**
 * Splitting a recurring series in two, the way Google Calendar's "This and
 * following events" does: the series ends just before one occurrence, and a
 * new series carries on from it. Works on the series' `recurrence` lines
 * (RFC 5545: `RRULE:…`, `EXDATE…:…`, `RDATE…:…`).
 */

export interface SplitRecurrence {
  /** The original series' rules, ending just before the split. */
  before: string[];
  /** The new series' rules, from the split on; null when no occurrence is left from there. */
  after: string[] | null;
}

/** A recurrence date value (`20261012T073000Z`, `20261012T073000` with a TZID, or `20261012`) as an instant. */
function parseRecurrenceDate(value: string, zone: string): DateTime {
  if (/^\d{8}$/.test(value)) return DateTime.fromFormat(value, 'yyyyMMdd', { zone });
  if (value.endsWith('Z')) return DateTime.fromFormat(value, "yyyyMMdd'T'HHmmss'Z'", { zone: 'utc' });
  return DateTime.fromFormat(value, "yyyyMMdd'T'HHmmss", { zone });
}

/** `NAME;PARAM=…:VALUE` → its name and params, and its value. */
function splitLine(line: string): { head: string; value: string } {
  const i = line.indexOf(':');
  return i < 0 ? { head: line, value: '' } : { head: line.slice(0, i), value: line.slice(i + 1) };
}

const ruleParts = (value: string) => new Map(value.split(';').filter(Boolean).map((p) => p.split('=') as [string, string]));
const joinRule = (parts: Map<string, string>) => [...parts].map(([k, v]) => `${k}=${v}`).join(';');

/**
 * @param lines the series' `recurrence`
 * @param at the original start of the first occurrence of the new series
 * @param allDay the series is all-day (dates, not times)
 * @param zone the series' time zone (for EXDATEs without one)
 * @param occurrencesBefore how many occurrences come before `at` — only used when the rule has a COUNT
 */
export function splitRecurrence(lines: readonly string[], at: DateTime, allDay: boolean, zone: string, occurrencesBefore: number): SplitRecurrence {
  const before: string[] = [];
  const after: string[] = [];
  let anyLeft = true;

  for (const line of lines) {
    const { head, value } = splitLine(line);
    const name = head.split(';')[0].toUpperCase();

    if (name === 'RRULE') {
      const parts = ruleParts(value);
      // The original series: up to the occurrence before `at`, as an UNTIL (no COUNT beside it).
      const old = new Map(parts);
      old.delete('COUNT');
      old.set('UNTIL', allDay ? at.setZone(zone).minus({ days: 1 }).toFormat('yyyyMMdd') : at.toUTC().minus({ seconds: 1 }).toFormat("yyyyMMdd'T'HHmmss'Z'"));
      before.push(`${head}:${joinRule(old)}`);
      // The new series: the same rule; a COUNT keeps only what was left of it.
      const next = new Map(parts);
      if (parts.has('COUNT')) {
        const left = Number(parts.get('COUNT')) - occurrencesBefore;
        if (left <= 0) anyLeft = false;
        next.set('COUNT', String(Math.max(left, 0)));
      }
      after.push(`${head}:${joinRule(next)}`);
    } else if (name === 'EXDATE' || name === 'RDATE') {
      // Each keeps the dates on its side of the split.
      const tzid = /;TZID=([^;:]+)/i.exec(head)?.[1] ?? zone;
      const dates = value.split(',').filter(Boolean);
      const early = dates.filter((d) => parseRecurrenceDate(d, tzid) < at);
      const late = dates.filter((d) => parseRecurrenceDate(d, tzid) >= at);
      if (early.length > 0) before.push(`${head}:${early.join(',')}`);
      if (late.length > 0) after.push(`${head}:${late.join(',')}`);
    } else {
      before.push(line);
      after.push(line);
    }
  }
  return { before, after: anyLeft ? after : null };
}
