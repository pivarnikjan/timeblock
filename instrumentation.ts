/**
 * Runs once when the Next.js server starts, however it is started — `npm run
 * dev`, `npm run start`, start-timeblock.ps1, or the logon task.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { trustSystemCertificates } = await import('./lib/tls/system-ca');
    const added = trustSystemCertificates();
    if (added > 0) console.log(`[tls] trusting ${added} certificate(s) from the system store`);
  }
}
