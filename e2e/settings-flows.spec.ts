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

  test('English-beta profile, metric labels, weight unit, and logout remain usable', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('trophe_weight_unit', 'kg'));
    await login(page);

    await page.goto('/dashboard/profile');
    await expect(page.getByText('Height (cm)', { exact: true })).toBeVisible();
    await expect(page.getByText('Weight (kg)', { exact: true })).toBeVisible();

    await expect(page.getByText('English beta', { exact: true })).toBeVisible();
    await expect(page.getByText('More languages will return after the English experience is stable.')).toBeVisible();
    await expect(page.getByText(/Español|Idioma|Guardar Perfil/)).toHaveCount(0);

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

  test('theme persists across core routes and mobile controls remain reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    await page.goto('/dashboard');
    const themeToggle = page.getByRole('button', { name: 'Toggle color theme' });
    await expect(themeToggle).toBeVisible();
    const themeToggleBox = await themeToggle.boundingBox();
    // Chromium reports the CSS 44px target as 43.99998474121094 on some DPRs.
    expect(themeToggleBox?.width).toBeGreaterThanOrEqual(43.99);
    expect(themeToggleBox?.height).toBeGreaterThanOrEqual(43.99);
    await themeToggle.click();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);

    for (const route of ['/dashboard', '/dashboard/log', '/dashboard/progress', '/dashboard/profile']) {
      await page.goto(route);
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);
      await expect(page.locator('nav a').first()).toBeVisible();
      const sharedThemeToggle = page.getByRole('button', { name: 'Toggle color theme' });
      await expect(sharedThemeToggle).toBeVisible();
      const bottomNav = page.locator('nav').first();
      const lightNavStyle = await bottomNav.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.backgroundColor}|${style.borderColor}|${style.color}`;
      });
      await sharedThemeToggle.click();
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(false);
      const darkNavStyle = await bottomNav.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.backgroundColor}|${style.borderColor}|${style.color}`;
      });
      expect(darkNavStyle).not.toBe(lightNavStyle);
      await sharedThemeToggle.click();
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);
    }

    await page.goto('/dashboard/profile');
    const profileTabs = page.locator('button').filter({ hasText: /Account|Body|Appearance|Language|Privacy/ });
    await expect(profileTabs.last()).toBeVisible();
    const viewportWidth = page.viewportSize()!.width;
    for (let index = 0; index < await profileTabs.count(); index += 1) {
      const tabsBox = await profileTabs.nth(index).boundingBox();
      expect(tabsBox?.x).toBeGreaterThanOrEqual(0);
      expect((tabsBox?.x ?? 0) + (tabsBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth);
    }

    await page.goto('/dashboard');
    const waterButtons = page.getByRole('button', { name: /Log water cup \d+/ });
    await expect(waterButtons.first()).toBeVisible();
    const count = await waterButtons.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await waterButtons.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
