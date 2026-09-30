const HOUR_UNITS = new Set(['h', 'hr', 'hrs', 'hour', 'hours', 'hod', 'hodina', 'hodiny', 'hodín']);
const MINUTE_UNITS = new Set(['m', 'min', 'mins', 'minute', 'minutes', 'minúta', 'minúty', 'minút']);

/**
 * Reads a duration the way people write it, returning whole minutes.
 *
 * Accepts `85`, `85m`, `56 minutes`, `5 min`, `1h 25m`, `1h25`, `1:25`,
 * `1 hour 25 minutes`, `1.5h`, and Slovak `1 hod 25 min`. Returns null for
 * anything it cannot read confidently, so the importer can point at the row.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(',', '.');
  if (text === '') return null;

  if (/^\d+$/.test(text)) return Number(text) > 0 ? Number(text) : null;

  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const tokens = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([a-zúí]+)?/g)];
  if (tokens.length === 0) return null;

  // Everything that is not a number/unit pair (or "and") makes the value unreadable.
  const leftover = text.replace(/(\d+(?:\.\d+)?)\s*([a-zúí]+)?/g, '').replace(/\band\b/g, '').trim();
  if (leftover !== '') return null;

  let total = 0;
  let sawHours = false;
  for (const [, amount, unit] of tokens) {
    const value = Number(amount);
    if (unit === undefined) {
      // A bare number after hours is minutes: "1h 25".
      if (!sawHours) return null;
      total += value;
    } else if (HOUR_UNITS.has(unit)) {
      total += value * 60;
      sawHours = true;
    } else if (MINUTE_UNITS.has(unit)) {
      total += value;
    } else {
      return null;
    }
  }

  const minutes = Math.round(total);
  return minutes > 0 ? minutes : null;
}
