import { expect, test } from '@playwright/test';

test.describe('public landing languages', () => {
  test('serves canonical Spanish and Greek pages through normal links', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Track smarter/i })).toBeVisible();
    await expect(page.locator('[data-landing-lang]')).toHaveAttribute('lang', 'en');

    await page.getByRole('link', { name: 'es', exact: true }).click();
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole('heading', { name: /Rastrea inteligente/i })).toBeVisible();
    await expect(page.locator('[data-landing-lang]')).toHaveAttribute('lang', 'es');

    await page.getByRole('link', { name: 'el', exact: true }).click();
    await expect(page).toHaveURL(/\/el$/);
    await expect(page.getByRole('heading', { name: /Παρακολούθηση έξυπνα/i })).toBeVisible();
    await expect(page.locator('[data-landing-lang]')).toHaveAttribute('lang', 'el');

    await page.getByRole('link', { name: 'en', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /Track smarter/i })).toBeVisible();
  });

  test('keeps the selected theme across localized public navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);

    await page.getByRole('link', { name: 'es', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await expect(page.getByRole('button', { name: 'Toggle color theme' })).toBeVisible();

    await page.getByRole('link', { name: 'el', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await expect(page.getByRole('button', { name: 'Toggle color theme' })).toBeVisible();
  });
});
