import { expect, test, type Page } from '@playwright/test';
import { assertNoPageOverflow } from './helpers/accessibility';
import { blockPaidRequests, loginAs, setTheme } from './helpers/auth';

const viewports = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
] as const;

async function expectResponsiveComposition(page: Page, selector: string, desktop: boolean) {
  const columns = await page.locator(selector).evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  if (desktop) expect(columns).not.toBe('none');
  else expect(columns).toBe('none');
}

async function expectCommittedCanvas(page: Page, selector: string, theme: 'light' | 'dark') {
  const colors = await page.locator(selector).evaluate((element) => ({
    canvas: getComputedStyle(element).backgroundColor,
    token: getComputedStyle(document.documentElement).getPropertyValue('--workout-canvas').trim(),
  }));
  expect(colors.canvas).toBe(theme === 'light' ? 'rgb(245, 242, 234)' : 'rgb(7, 8, 6)');
  expect(colors.token.toLowerCase()).toBe(theme === 'light' ? '#f5f2ea' : '#070806');
}

test.describe('Workout evidence layouts', () => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    'Local-auth runner supplies the disposable client account',
  );

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: History and Training progress adapt from phones to desktop evidence compositions`, async ({ page }) => {
      test.setTimeout(60_000);
      const assertNoPaidRequests = await blockPaidRequests(page);
      await loginAs(page, 'client');
      await setTheme(page, theme);

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);

        await page.goto('/dashboard/workout/history');
        const historyCanvas = page.getByTestId('workout-history-canvas');
        await expect(historyCanvas).toBeVisible();
        await expectCommittedCanvas(page, '[data-testid="workout-history-canvas"]', theme);
        const recentProgress = page.getByRole('complementary', { name: 'Recent progress' });
        if (viewport.width === 1280) await expect(recentProgress).toBeVisible();
        else await expect(recentProgress).toBeHidden();
        await expectResponsiveComposition(page, '[data-testid="workout-history-layout"]', viewport.width === 1280);
        await assertNoPageOverflow(page);

        await page.goto('/dashboard/workout/stats');
        const progressCanvas = page.getByTestId('training-progress-canvas');
        await expect(progressCanvas).toBeVisible();
        await expect(page.getByTestId('training-progress-title')).toHaveText('Training progress');
        await expect(page.getByRole('heading', { name: 'Training progress', exact: true })).toHaveCount(1);
        await expectCommittedCanvas(page, '[data-testid="training-progress-canvas"]', theme);
        await expectResponsiveComposition(page, '[data-testid="training-progress-layout"]', viewport.width === 1280);
        await assertNoPageOverflow(page);
      }

      assertNoPaidRequests();
    });
  }
});
