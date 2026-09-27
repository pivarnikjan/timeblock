import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import { fingerprint, trustSystemCertificates } from './system-ca';

const trusted = () => new Set(tls.getCACertificates('default').map(fingerprint));

describe('trusting the system certificate store', () => {
  it('adds the operating system roots to the defaults without dropping any', () => {
    const before = tls.getCACertificates('default').map(fingerprint);

    trustSystemCertificates();
    const after = trusted();

    expect(before.every((fp) => after.has(fp))).toBe(true);
    expect(tls.getCACertificates('system').every((pem) => after.has(fingerprint(pem)))).toBe(true);
  });

  it('is safe to run twice', () => {
    trustSystemCertificates();
    const once = trusted().size;

    expect(trustSystemCertificates()).toBe(0);
    expect(trusted().size).toBe(once);
  });
});
