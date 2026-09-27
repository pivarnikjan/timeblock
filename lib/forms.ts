/** Narrow FormData reads so server actions can stay one-liners. */

export function str(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required field: ${key}`);
  }
  return value.trim();
}

export function optStr(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}

export function num(form: FormData, key: string): number {
  const parsed = Number(str(form, key));
  if (!Number.isFinite(parsed)) throw new Error(`Field ${key} is not a number`);
  return parsed;
}

export function optNum(form: FormData, key: string): number | null {
  const raw = optStr(form, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads a value constrained to a known union, falling back to `fallback`. */
export function enumOf<T extends string>(
  form: FormData,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = optStr(form, key);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}
