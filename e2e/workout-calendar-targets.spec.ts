import { expect, test } from '@playwright/test';
import { assertNoPageOverflow } from './helpers/accessibility';
import { blockPaidRequests, loginAs, setTheme } from './helpers/auth';

test.describe('Workout analytics calendar targets', () => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    'Local-auth runner supplies the disposable client account',
  );

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [{ width: 320, height: 568 }, { width: 374, height: 812 }]) {
      test(`${theme}: every day remains a 44px target at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const assertNoPaidRequests = await blockPaidRequests(page);
        await loginAs(page, 'client');
        await setTheme(page, theme);
        await page.goto('/dashboard/workout/stats');

        const calendar = page.getByRole('grid', { name: /workout calendar/i });
        await expect(calendar).toBeVisible();
        const targets = await calendar.locator('button').evaluateAll((buttons) => buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: Math.round(rect.width), height: Math.round(rect.height) };
        }));

        expect(targets).toHaveLength(42);
        expect(Math.min(...targets.map(({ width }) => width))).toBeGreaterThanOrEqual(44);
        expect(Math.min(...targets.map(({ height }) => height))).toBeGreaterThanOrEqual(44);
        await assertNoPageOverflow(page);
        assertNoPaidRequests();
      });
    }
  }
});
