#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const vitestEntrypoint = path.resolve('node_modules/vitest/vitest.mjs');
const result = spawnSync(
  process.execPath,
  [
    vitestEntrypoint,
    'run',
    'tests/agents/offline-provider-contracts.test.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WRITE_OFFLINE_PROVIDER_REPORT: '1',
      AI_PAID_TOOL_APPROVAL: '',
      ANTHROPIC_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      GEMINI_API_KEY: '',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
      OPENAI_API_KEY: '',
      VOYAGE_API_KEY: '',
    },
  },
);

if (result.error) {
  process.stderr.write('offline provider-contract test runner failed to start\n');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
