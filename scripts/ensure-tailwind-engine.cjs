/**
 * Runs before `npm run dev` and `npm run build`. Where Tailwind's native
 * scanner loads, it does nothing. Where Windows blocks it (see
 * tailwind-engine.cjs), it makes sure the WebAssembly scanner is installed in
 * scripts/tailwind-wasm, in the version the project's Tailwind expects.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { WASM_DIR, WASM_PACKAGE, scannerVersion, nativeLoads, wasmVersion } = require('./tailwind-engine.cjs');

if (nativeLoads()) process.exit(0);

const wanted = scannerVersion();
if (wasmVersion() === wanted) {
  console.log(`[tailwind] native engine is blocked on this machine; using the WebAssembly engine ${wanted}.`);
  process.exit(0);
}

console.log(`[tailwind] native engine is blocked on this machine; installing the WebAssembly engine ${wanted}...`);
fs.mkdirSync(WASM_DIR, { recursive: true });
const manifest = path.join(WASM_DIR, 'package.json');
if (!fs.existsSync(manifest)) fs.writeFileSync(manifest, `${JSON.stringify({ private: true, description: "Tailwind's WebAssembly scanner — see ../tailwind-engine.cjs" }, null, 2)}\n`);
try {
  // The version goes into a command line: only what a version looks like.
  if (!/^\d+\.\d+\.\d+[\w.-]*$/.test(wanted)) throw new Error(`unexpected version "${wanted}"`);
  // --force: the package declares itself "wasm32 only", which npm otherwise refuses on any real CPU.
  execSync(`npm install --no-save --force --no-audit --no-fund ${WASM_PACKAGE}@${wanted}`, { cwd: WASM_DIR, stdio: 'inherit' });
} catch (error) {
  console.error(`[tailwind] could not install ${WASM_PACKAGE}@${wanted}: ${error.message}`);
  process.exit(1);
}
if (wasmVersion() !== wanted) {
  console.error(`[tailwind] ${WASM_PACKAGE}@${wanted} did not end up in ${WASM_DIR}.`);
  process.exit(1);
}
console.log('[tailwind] WebAssembly engine ready.');
