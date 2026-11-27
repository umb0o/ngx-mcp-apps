import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // The end-to-end test runs real Angular builds
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
