import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_CLIENT_EMAIL;
const password = process.env.E2E_CLIENT_PASSWORD;

async function openFoodInput(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/dashboard/log');
  await page.getByText('Tap to log this meal').first().click();
  await expect(page.getByPlaceholder(/What did you eat/)).toBeVisible();
}

test.describe('food parser error states', () => {
  test.skip(!email || !password, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD');

  test('429 renders a friendly retry state', async ({ page }) => {
    await page.route('**/api/food/parse', (route) => route.fulfill({
      status: 429,
      headers: { 'content-type': 'application/json', 'Retry-After': '30' },
      body: JSON.stringify({ code: 'rate_limited', message: 'provider detail must stay hidden' }),
    }));
    await openFoodInput(page);
    await page.getByPlaceholder(/What did you eat/).fill('two eggs');
    await page.getByPlaceholder(/What did you eat/).press('Enter');

    await expect(page.getByText('Too many requests right now — give it a moment and try again.')).toBeVisible();
    await expect(page.getByText(/Retry \(30s\)/)).toBeVisible();
    await expect(page.getByText('provider detail must stay hidden')).toHaveCount(0);
  });

  test('timeout code renders retryable user copy', async ({ page }) => {
    await page.route('**/api/food/parse', (route) => route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'timeout', message: 'internal timeout stack' }),
    }));
    await openFoodInput(page);
    await page.getByPlaceholder(/What did you eat/).fill('chicken and rice');
    await page.getByPlaceholder(/What did you eat/).press('Enter');

    await expect(page.getByText('This took longer than expected — please try again.')).toBeVisible();
    await expect(page.getByText('internal timeout stack')).toHaveCount(0);
  });

  test('malformed success payload becomes a safe empty state', async ({ page }) => {
    await page.route('**/api/food/parse', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [null, { food_name: null }] }),
    }));
    await openFoodInput(page);
    await page.getByPlaceholder(/What did you eat/).fill('mystery meal');
    await page.getByPlaceholder(/What did you eat/).press('Enter');

    await expect(page.getByText('No food items detected')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

test.describe('authenticated loading states', () => {
  test.skip(!email || !password, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD');

  test('slow data keeps a stable dashboard skeleton until content is ready', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(email!);
    await page.getByPlaceholder('Password').fill(password!);
    await page.locator('form').getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto('/dashboard/profile');

    await page.route('**/rest/v1/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.skeleton').first()).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  });
});
