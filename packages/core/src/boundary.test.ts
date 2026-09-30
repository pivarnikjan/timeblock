import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

/**
 * Core runs on the phone too (React Native, no Node, no Next.js), so it may only
 * import itself and the packages both apps install.
 */
const ALLOWED = [/^\.\.?\//, /^luxon$/, /^drizzle-orm(\/|$)/, /^fflate$/];

describe('core package boundary', () => {
  it('imports only relative modules and the shared dependencies', () => {
    const offending = sources(src).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)]
        .map((m) => m[1] ?? m[2])
        .filter((spec) => !ALLOWED.some((re) => re.test(spec)))
        .map((spec) => `${path.relative(src, file)} → ${spec}`),
    );
    expect(offending).toEqual([]);
  });
});
