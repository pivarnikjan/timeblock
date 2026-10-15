import { describe, expect, it } from 'vitest';
import { endedLikeTesting, expiredExplanation, expiryWarning, isInvalidGrant, upcomingExpiry } from './grant';

const at = (iso: string) => new Date(iso).toISOString();
const plusDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();

describe('a sign-in Google stopped accepting', () => {
  it('is recognised from what google-auth-library throws', () => {
    expect(isInvalidGrant({ response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } })).toBe(true);
    expect(isInvalidGrant(new Error('invalid_grant'))).toBe(true);
    expect(isInvalidGrant(new Error('invalid_client'))).toBe(false);
    expect(isInvalidGrant(new Error('socket hang up'))).toBe(false);
  });

  it('reads as the Testing limit when it lasted 7 days — or was only noticed later', () => {
    const savedAt = at('2026-10-07T21:05:04Z');
    expect(endedLikeTesting({ savedAt, expiredAt: plusDays(savedAt, 7.01) })).toBe(true);
    expect(endedLikeTesting({ savedAt, expiredAt: plusDays(savedAt, 12) })).toBe(true);
    expect(endedLikeTesting({ savedAt, expiredAt: plusDays(savedAt, 2) })).toBe(false);
    expect(expiredExplanation({ savedAt, expiredAt: plusDays(savedAt, 7.4) })).toMatch(/after 7 days[\s\S]*Testing[\s\S]*Publish app/);
    expect(expiredExplanation({ savedAt, expiredAt: plusDays(savedAt, 2) })).toMatch(/access was removed/);
  });
});

describe('warning before the next sign-in ends', () => {
  const previous = { savedAt: at('2026-10-07T21:05:04Z'), expiredAt: at('2026-10-15T08:00:00Z') };
  const savedAt = at('2026-10-15T09:00:00Z');

  it('warns while the app may still be in Testing, and stops once a sign-in outlives the limit', () => {
    expect(upcomingExpiry({ savedAt, previous }, Date.parse(plusDays(savedAt, 1)))).toEqual({ at: plusDays(savedAt, 7), known: false });
    expect(expiryWarning({ savedAt, previous }, Date.parse(plusDays(savedAt, 6)))).toMatch(/last sign-in ended after 7 days/);
    expect(upcomingExpiry({ savedAt, previous }, Date.parse(plusDays(savedAt, 8)))).toBeNull();
  });

  it('says nothing when there is no sign of the limit', () => {
    expect(upcomingExpiry({ savedAt })).toBeNull();
    expect(upcomingExpiry({ savedAt, previous: { savedAt: previous.savedAt, expiredAt: plusDays(previous.savedAt, 1) } })).toBeNull();
  });

  it('uses the end Google gave, when it gave one', () => {
    const expiresAt = plusDays(savedAt, 7);
    expect(upcomingExpiry({ savedAt, expiresAt }, Date.parse(plusDays(savedAt, 3)))).toEqual({ at: expiresAt, known: true });
    expect(expiryWarning({ savedAt, expiresAt }, Date.parse(plusDays(savedAt, 3)))).toMatch(/Google will end this sign-in/);
    expect(upcomingExpiry({ savedAt, expiresAt }, Date.parse(plusDays(savedAt, 8)))).toBeNull();
  });
});
