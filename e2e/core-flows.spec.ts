import { expect, test } from '@playwright/test';

test('public landing page exposes the product and primary paths', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('τροφή').first()).toBeVisible();
  await expect(page.getByText('Precision Nutrition Coaching')).toBeVisible();
  await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
});

test('login page renders user-visible auth controls', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'τροφή' })).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByPlaceholder('••••••••')).toBeVisible();
});

test('protected dashboard redirects anonymous users to login', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login/);
});

test('mobile viewport does not introduce horizontal page overflow on public flows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ['/', '/login']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
