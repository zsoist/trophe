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
});
