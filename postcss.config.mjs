import path from "node:path";

/**
 * Tailwind, through scripts/tailwind-postcss.cjs: the official
 * `@tailwindcss/postcss` wherever Tailwind's native engine loads, and the same
 * stylesheet built with its WebAssembly engine where Windows blocks the native
 * one. Named by its full path, because the bundler looks plugins up by name.
 */
const config = {
  plugins: {
    [path.join(process.cwd(), "scripts", "tailwind-postcss.cjs")]: {},
  },
};

export default config;
