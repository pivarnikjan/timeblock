import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';

/** Identity of a PEM certificate; the PEM text itself varies in whitespace. */
export function fingerprint(pem: string): string {
  return new X509Certificate(pem).fingerprint256;
}

/**
 * Makes Node trust the operating system's certificate store in addition to its
 * own bundled one — which is what browsers already do.
 *
 * Why: antivirus "HTTPS scanning" (here Avast Web/Mail Shield) and corporate
 * proxies re-sign every TLS connection with their own root certificate, which
 * they install into the Windows store. Browsers trust it; Node, by default,
 * only trusts its bundled list, so every call to Google failed with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. Verification stays fully on — only the set
 * of trusted roots grows to match the machine's.
 *
 * Returns how many system certificates were newly trusted (0 if unsupported
 * or already trusted).
 */
export function trustSystemCertificates(): number {
  if (typeof tls.setDefaultCACertificates !== 'function' || typeof tls.getCACertificates !== 'function') {
    return 0;
  }
  const current = tls.getCACertificates('default');
  const known = new Set(current.map(fingerprint));
  const missing = tls.getCACertificates('system').filter((pem) => !known.has(fingerprint(pem)));
  if (missing.length > 0) tls.setDefaultCACertificates([...current, ...missing]);
  return missing.length;
}
