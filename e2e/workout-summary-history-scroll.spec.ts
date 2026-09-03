import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.describe('Workout summary route scroll', () => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    'Local-auth runner supplies the disposable client account',
  );

  test('opens History at the document top after saving a live workout', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem('trophe_pwa_install_dismissed', String(Date.now()));
      window.localStorage.setItem('trophe_lang', 'en');
    });
    const assertNoPaidRequests = await blockPaidRequests(page);

    await loginAs(page, 'client');
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('trophe:workout-workspace:')) window.localStorage.removeItem(key);
      }
    });
    await page.goto('/dashboard/workout');

    const workspace = page.locator('.client-shell__content').getByRole('main');
    await expect(workspace.getByRole('heading', { name: 'Recommended workout' })).toBeVisible();
    await workspace.getByRole('button', { name: 'Review plan' }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout\/review$/);
    await workspace.getByRole('button', { name: 'Start workout' }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout\/live$/);

    await workspace.getByRole('spinbutton', { name: 'Weight in kg' }).first().fill('40');
    await workspace.getByRole('spinbutton', { name: 'Reps' }).first().fill('8');
    await workspace.getByRole('button', { name: 'Complete set' }).first().click();
    await workspace.getByRole('button', { name: 'Pause workout' }).click();
    await expect(page.getByText('Paused')).toBeVisible();
    await workspace.getByRole('button', { name: 'Finish Workout' }).click();
    const finish = page.getByRole('dialog', { name: 'Finish workout?' });
    await expect(finish).toBeVisible();
    await finish.getByRole('button', { name: 'Save and finish' }).click();
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
    await expect(page.getByLabel('Workout status: Completed')).toBeVisible();
    await page.goto('/dashboard/workout/build');
    await expect(page).toHaveURL(/\/dashboard\/workout\/live$/);
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout\/history$/);
    await expect(page.getByTestId('workout-route-transition')).toHaveCount(1);

    await expect.poll(() => page.evaluate(() => ({
      documentTop: document.scrollingElement?.scrollTop ?? -1,
      windowTop: window.scrollY,
      visualPageTop: window.visualViewport?.pageTop ?? 0,
      visualOffsetTop: window.visualViewport?.offsetTop ?? 0,
    })), { timeout: 5_000, message: 'History must settle at the top without test-authored scrolling' }).toEqual({
      documentTop: 0,
      windowTop: 0,
      visualPageTop: 0,
      visualOffsetTop: 0,
    });

    const toolbar = page.getByRole('heading', { name: 'History', exact: true }).locator('..');
    await expect(toolbar).toBeInViewport();
    await expect.poll(() => toolbar.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
    assertNoPaidRequests();
  });
});
