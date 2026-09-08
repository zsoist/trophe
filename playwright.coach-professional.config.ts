import { defineConfig } from '@playwright/test';
import base from './playwright.coach.config';

/** Explicit Auth/DB gate for the professional v2 scope; never joins smoke. */
export default defineConfig({
  ...base,
  testMatch: ['coach-professional.spec.ts'],
  outputDir: process.env.RUNNER_TEMP
    ? `${process.env.RUNNER_TEMP}/coach-professional-playwright`
    : 'test-results/coach-professional-auth',
});
