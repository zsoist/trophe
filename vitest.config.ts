import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'agents/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'agents/**/*.ts'],
      exclude: ['**/*.test.ts', 'lib/types.ts', 'lib/**/*-seed.ts', 'lib/i18n.tsx'],
    },
  },
});
