import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, 'node_modules/next/dist/compiled/server-only/empty.js'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, '.'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'agents/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'agents/**/*.ts'],
      exclude: ['**/*.test.ts', 'lib/types.ts', 'lib/**/*-seed.ts', 'lib/i18n.tsx'],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 15,
        statements: 20,
      },
    },
  },
});
