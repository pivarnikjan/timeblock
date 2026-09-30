import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the path aliases from tsconfig.json.
    alias: {
      '@timeblock/core': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'packages/core/src/**/*.test.ts'],
  },
});
