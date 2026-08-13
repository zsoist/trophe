import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

const clientEmail = process.env.E2E_CLIENT_EMAIL;
const clientPassword = process.env.E2E_CLIENT_PASSWORD;
const coachEmail = process.env.E2E_COACH_EMAIL;
const coachPassword = process.env.E2E_COACH_PASSWORD;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe('authenticated role flows', () => {
  test.skip(!clientEmail || !clientPassword, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD to run client auth flow');

  test('client can reach dashboard and is denied admin pages', async ({ page }) => {
    await loginAs(page, 'client');
    await expect(page).toHaveURL(/\/(dashboard|onboarding|coach)/);

    await page.goto('/admin/orgs');
    await expect(page).toHaveURL(/\/dashboard|\/login/);
  });
});

test.describe('coach role flows', () => {
  test.skip(!coachEmail || !coachPassword, 'Set E2E_COACH_EMAIL/E2E_COACH_PASSWORD to run coach auth flow');

  test('coach can reach coach dashboard and is denied admin pages', async ({ page }) => {
    await loginAs(page, 'coach');
    await expect(page).toHaveURL(/\/coach|\/dashboard/);

    await page.goto('/admin/orgs');
    await expect(page).toHaveURL(/\/dashboard|\/login/);
  });

  test('coach login preserves a safe requested destination', async ({ page }) => {
    await loginAs(page, 'coach', '/login?redirectTo=%2Fdashboard%2Flog');
    await expect(page).toHaveURL(/\/dashboard\/log/);
  });
});

test.describe('admin role flows', () => {
  test.skip(!adminEmail || !adminPassword, 'Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run admin auth flow');

  test('admin can view organization dashboard', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/orgs');

    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();
  });
});
