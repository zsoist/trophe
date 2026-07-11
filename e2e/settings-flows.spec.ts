import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_CLIENT_EMAIL;
const password = process.env.E2E_CLIENT_PASSWORD;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('client settings flows', () => {
  test.skip(!email || !password, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD');

  test('profile language, metric labels, weight unit, and logout remain usable', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('trophe_weight_unit', 'kg'));
    await login(page);

    await page.goto('/dashboard/profile');
    await expect(page.getByText('Height (cm)', { exact: true })).toBeVisible();
    await expect(page.getByText('Weight (kg)', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /ES Español/ }).click();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Guardar Perfil/ })).toBeVisible();

    await page.getByRole('button', { name: /EN English/ }).click();
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();

    await page.goto('/dashboard/workout');
    const unitToggle = page.getByRole('button', { name: 'kg / lb' });
    await expect(unitToggle).toHaveText('kg');
    await unitToggle.click();
    await expect(unitToggle).toHaveText('lb');
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('trophe_weight_unit'))).toBe('lb');
    await unitToggle.click();
    await expect(unitToggle).toHaveText('kg');

    await page.goto('/dashboard/profile');
    const dismissInstallPrompt = page.getByRole('button', { name: 'Dismiss install prompt' });
    if (await dismissInstallPrompt.isVisible()) await dismissInstallPrompt.click();
    await page.getByRole('button', { name: 'Log Out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
