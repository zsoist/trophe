import { defineConfig } from '@playwright/test';
import base from './playwright.coach.config';

export default defineConfig({ ...base, testMatch: ['coach-progress.spec.ts'] });
