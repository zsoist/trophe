import { expect, test } from '@playwright/test';

test('public landing page exposes the product and primary paths', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('trophē').first()).toBeVisible();
  await expect(page.getByText('Precision Nutrition for Athletes').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /get started/i }).first()).toBeVisible();
});

test('login page renders user-visible auth controls', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('trophē').first()).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByRole('textbox', { name: /create password/i }).fill('NickReady!2026');
  await expect(page.getByText('Password strength: Strong')).toBeVisible();
});

test('protected dashboard redirects anonymous users to login', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login/);
});

test('offline fallback gives a clear recovery action', async ({ page }) => {
  await page.goto('/offline');

  await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
  await expect(page.getByText('Your logged data is safe.')).toBeVisible();
});

test('mobile viewport does not introduce horizontal page overflow on public flows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const routes = ['/', '/es', '/el', '/pricing', '/trust', '/login', '/signup', '/activate', '/onboarding', '/offline'];

  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/');
    await page.evaluate((mode) => localStorage.setItem('trophe_theme_mode', mode), theme);

    for (const path of routes) {
      await page.goto(path);

      const result = await page.evaluate(() => {
        const themeClasses = ['dark', 'light'].filter((name) => document.documentElement.classList.contains(name));
        const interactiveText = [...document.querySelectorAll<HTMLElement>('a, button')]
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && element.innerText.trim();
          })
          .map((element) => ({
            text: element.innerText.trim(),
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
            color: getComputedStyle(element).color,
          }));

        return {
          themeClasses,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          interactiveText,
        };
      });

      expect(result.themeClasses, `${path} should apply exactly one theme`).toEqual([theme]);
      expect(result.overflow, `${path} should not overflow horizontally`).toBeLessThanOrEqual(1);
      expect(result.interactiveText.length, `${path} should expose interactive text`).toBeGreaterThan(0);
      for (const interactive of result.interactiveText) {
        expect(interactive.fontSize, `${path}: "${interactive.text}" should be readable`).toBeGreaterThanOrEqual(12);
        expect(interactive.color, `${path}: "${interactive.text}" should have a visible color`).not.toBe('rgba(0, 0, 0, 0)');
      }

      await expect(page.getByRole('button', { name: 'Toggle color theme' })).toBeVisible();
    }
  }
});

test('public identity and login links meet the minimum target size in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 844 });

  const targets = [
    { path: '/', name: 'Log in' },
    { path: '/login', name: 'trophē' },
  ];

  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/');
    await page.evaluate((mode) => localStorage.setItem('trophe_theme_mode', mode), theme);

    for (const target of targets) {
      await page.goto(target.path);

      const link = page.getByRole('link', { name: target.name, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();

      expect(box, `${target.path}: ${target.name} should have a measurable target`).not.toBeNull();
      // Chromium can report an authored 44px CSS target a few millionths of a
      // pixel short after device-pixel rounding (for example 43.999992px).
      expect.soft(box!.width, `${target.path}: ${target.name} should be at least 44px wide`).toBeGreaterThanOrEqual(43.99);
      expect.soft(box!.height, `${target.path}: ${target.name} should be at least 44px tall`).toBeGreaterThanOrEqual(43.99);
    }
  }
});
