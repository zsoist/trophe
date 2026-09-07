import { defineConfig, devices } from '@playwright/test';

// One explicitly dispatched, ephemeral Auth matrix. Never joins ordinary smoke.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['coach-week.spec.ts', 'coach-durable.spec.ts', 'coach-food.spec.ts', 'coach-engine.spec.ts', 'coach-memory.spec.ts', 'coach-memory-uncertain.spec.ts', 'coach-diet.spec.ts'],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  outputDir: process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/coach-playwright` : 'test-results/coach-auth',
  use: {
    baseURL: 'http://127.0.0.1:3300',
    ...devices['iPhone 14 Pro'],
    viewport: { width: 390, height: 844 },
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3300',
    url: 'http://127.0.0.1:3300',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
