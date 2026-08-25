import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const email = process.env.E2E_CLIENT_EMAIL;
const password = process.env.E2E_CLIENT_PASSWORD;
const screenshotDir = '.gstack/qa-reports/screenshots';
mkdirSync(screenshotDir, { recursive: true });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function dismissInstallPrompt(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss install prompt' });
  if (await dismiss.isVisible()) await dismiss.click();
}

async function installFakeRecorder(page: Page, permission: 'granted' | 'denied' = 'granted') {
  await page.addInitScript(({ denied }) => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
          return { getTracks: () => [{ stop() {} }] };
        },
      },
    });

    class FakeMediaRecorder {
      static isTypeSupported(type: string) { return type.startsWith('audio/webm'); }
      state: 'inactive' | 'recording' = 'inactive';
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((event: { error?: unknown }) => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? 'audio/webm';
      }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob([new Uint8Array(512)], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: FakeMediaRecorder, configurable: true });
  }, { denied: permission === 'denied' });
}

async function openFoodInput(page: Page) {
  await login(page);
  await page.goto('/dashboard/log');
  await dismissInstallPrompt(page);
  await page.getByText('Tap to log this meal').first().click();
  await expect(page.getByPlaceholder(/What did you eat/)).toBeVisible();
}

test.describe('production microphone flows', () => {
  test.skip(!email || !password, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD');

  test('food native speech sends the literal generic transcript to review', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      class FakeSpeechRecognition {
        lang = '';
        interimResults = false;
        maxAlternatives = 0;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        start() { (window as typeof window & { __speech?: FakeSpeechRecognition }).__speech = this; }
        stop() { this.onend?.(); }
        abort() {}
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: FakeSpeechRecognition, configurable: true });
    });
    await page.route('**/api/food/parse', async (route) => {
      const request = route.request();
      expect((await request.postDataJSON()).text).toBe('latte');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            raw_text: 'latte', food_name: 'latte', name_localized: 'latte', quantity: 1, unit: 'cup', grams: 240,
            calories: 120, protein_g: 6, carbs_g: 10, fat_g: 5, fiber_g: 0, sugar_g: 9,
            confidence: 0.8, source: 'ai_estimate', portion_explicit: true,
          }],
          needs_clarification: false, warnings: [],
        }),
      });
    });
    await openFoodInput(page);

    await page.getByRole('button', { name: 'Start voice input' }).click();
    await page.evaluate(() => {
      const recognition = (window as typeof window & {
        __speech?: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null };
      }).__speech;
      recognition?.onresult?.({ results: [{ 0: { transcript: 'latte' }, isFinal: true }] });
      recognition?.onend?.();
    });

    await expect(page.getByText('latte', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Starbucks/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Log All (1)' })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/food-native-${testInfo.project.name}.png`, fullPage: true });
  });

  test('food permission denial gives a recoverable localized state', async ({ page }, testInfo) => {
    await installFakeRecorder(page, 'denied');
    await openFoodInput(page);

    await page.getByRole('button', { name: 'Start voice input' }).click();
    await expect(page.getByText('Microphone access needed')).toBeVisible();
    await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/food-permission-${testInfo.project.name}.png`, fullPage: true });
  });

  test('intake recorded fallback appends a transcript to the active answer', async ({ page }, testInfo) => {
    await installFakeRecorder(page);
    await page.route('**/api/ai/transcribe', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'I want more energy', languages: ['en'] }),
    }));
    await login(page);
    await page.goto('/dashboard/intake');
    await dismissInstallPrompt(page);
    await page.getByRole('button', { name: /begin|review my answers/i }).click();

    const textarea = page.getByPlaceholder('Take your time — plain words are perfect.');
    await textarea.fill('My goal is consistency.');
    await page.getByRole('button', { name: 'Answer this question by voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop voice answer' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop voice answer' }).click();

    await expect(textarea).toHaveValue('My goal is consistency. I want more energy');
    await page.screenshot({ path: `${screenshotDir}/intake-fallback-${testInfo.project.name}.png`, fullPage: true });
  });

  test('chat records locally, stops, and exposes discard before any send', async ({ page }, testInfo) => {
    await installFakeRecorder(page);
    await login(page);
    await page.goto('/dashboard/messages');
    if (testInfo.project.name === 'mobile-chromium') {
      await expect(page.getByRole('region', { name: 'Install Trophē' })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Record voice note' }).click();
    await expect(page.getByRole('button', { name: 'Stop and attach' })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop and attach' }).click();

    await expect(page.getByText('Voice note ready to send')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove attachment' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await page.screenshot({ path: `${screenshotDir}/chat-voice-${testInfo.project.name}.png`, fullPage: true });
  });
});
