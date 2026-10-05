/**
 * Which Tailwind engine this machine can run.
 *
 * Tailwind's class scanner is a native module (`tailwindcss-oxide.*.node`).
 * It is unsigned, and Windows Smart App Control blocks it on some machines —
 * the build then stops with "An Application Control policy has blocked this
 * file". Tailwind also publishes the same scanner as WebAssembly, which is not
 * a program file and loads anywhere; it is kept in scripts/tailwind-wasm, out
 * of the project's own dependencies, because npm refuses to install a
 * "wasm32 only" package among them without --force.
 */
const fs = require('node:fs');
const path = require('node:path');

/** Where the WebAssembly scanner is installed when it is needed. */
const WASM_DIR = path.join(__dirname, 'tailwind-wasm');
const WASM_PACKAGE = '@tailwindcss/oxide-wasm32-wasi';

/** The version of Tailwind's scanner the project has — the WebAssembly one must match it. */
function scannerVersion() {
  return JSON.parse(fs.readFileSync(require.resolve('@tailwindcss/oxide/package.json'), 'utf8')).version;
}

/** True when the native scanner can be loaded (always assumed off Windows, where nothing blocks it). */
function nativeLoads() {
  if (process.platform !== 'win32') return true;
  try {
    require(`@tailwindcss/oxide-win32-${process.arch}-msvc`);
    return true;
  } catch {
    return false;
  }
}

/** The installed WebAssembly scanner's version, or null when it is not installed. */
function wasmVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(WASM_DIR, 'node_modules', WASM_PACKAGE, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/** Loads the WebAssembly scanner from scripts/tailwind-wasm. */
function loadWasm() {
  return require(path.join(WASM_DIR, 'node_modules', WASM_PACKAGE));
}

module.exports = { WASM_DIR, WASM_PACKAGE, scannerVersion, nativeLoads, wasmVersion, loadWasm };
