import { test, expect, type Page } from '@playwright/test';

const clientEmail = process.env.E2E_CLIENT_EMAIL;
const clientPassword = process.env.E2E_CLIENT_PASSWORD;
const coachEmail = process.env.E2E_COACH_EMAIL;
const coachPassword = process.env.E2E_COACH_PASSWORD;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

async function login(page: Page, email: string, password: string, path = '/login') {
  await page.goto(path);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
}

test.describe('authenticated role flows', () => {
  test.skip(!clientEmail || !clientPassword, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD to run client auth flow');

  test('client can reach dashboard and is denied admin pages', async ({ page }) => {
    await login(page, clientEmail!, clientPassword!);
    await expect(page).toHaveURL(/\/(dashboard|onboarding|coach)/);

    await page.goto('/admin/orgs');
    await expect(page).toHaveURL(/\/dashboard|\/login/);
  });
});

test.describe('coach role flows', () => {
  test.skip(!coachEmail || !coachPassword, 'Set E2E_COACH_EMAIL/E2E_COACH_PASSWORD to run coach auth flow');

  test('coach can reach coach dashboard and is denied admin pages', async ({ page }) => {
    await login(page, coachEmail!, coachPassword!);
    await expect(page).toHaveURL(/\/coach|\/dashboard/);

    await page.goto('/admin/orgs');
    await expect(page).toHaveURL(/\/dashboard|\/login/);
  });

  test('coach login preserves a safe requested destination', async ({ page }) => {
    await login(page, coachEmail!, coachPassword!, '/login?redirectTo=%2Fdashboard%2Flog');
    await expect(page).toHaveURL(/\/dashboard\/log/);
  });
});

test.describe('admin role flows', () => {
  test.skip(!adminEmail || !adminPassword, 'Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run admin auth flow');

  test('admin can view organization dashboard', async ({ page }) => {
    await login(page, adminEmail!, adminPassword!);
    await page.goto('/admin/orgs');

    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();
  });
});
