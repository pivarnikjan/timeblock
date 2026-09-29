import { describe, expect, it } from 'vitest';
import { CALENDAR_SCOPE, grantsCalendar, isMissingScopeError } from './scopes';

describe('granted scopes', () => {
  it('rejects a sign-in where the calendar box was left unticked', () => {
    // Exactly what Google returned for the grant that triggered the bug.
    expect(grantsCalendar('email https://www.googleapis.com/auth/userinfo.email openid')).toBe(false);
  });

  it('accepts a grant that includes calendar access, as a string or a list', () => {
    expect(grantsCalendar(`openid ${CALENDAR_SCOPE} email`)).toBe(true);
    expect(grantsCalendar(['email', CALENDAR_SCOPE])).toBe(true);
    expect(grantsCalendar(undefined)).toBe(false);
  });

  it("recognises Google's insufficient-scope error, and nothing else", () => {
    expect(isMissingScopeError({ code: 403, message: 'Request had insufficient authentication scopes.' })).toBe(true);
    expect(isMissingScopeError({ code: 403, message: 'The caller does not have permission' })).toBe(false);
    expect(isMissingScopeError({ code: 401, message: 'Request had insufficient authentication scopes.' })).toBe(false);
  });
});
