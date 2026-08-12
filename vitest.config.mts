import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],

    /*
     * One file at a time, in one process.
     *
     * Every test here mutates the same seat counters, so two files running in
     * parallel would fight over the same rows and the results would depend on
     * scheduling. The concurrency under test lives *inside* each test - dozens
     * of simultaneous connections contending for one class row - not between
     * test files.
     */
    fileParallelism: false,
    isolate: false,

    testTimeout: 40_000,
    hookTimeout: 60_000,
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),

      /*
       * `server-only` exists to make Next.js fail the build if server code is
       * imported into a client bundle. Outside Next there is no bundler to
       * make that distinction, and its entry point throws on import. Stubbing
       * it lets the tests import the real service; the guarantee it provides
       * is still enforced where it matters, in `next build`.
       */
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
