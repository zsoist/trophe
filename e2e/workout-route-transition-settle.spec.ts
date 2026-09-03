import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.describe('Workout route transition lifecycle', () => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    'Local-auth runner supplies the disposable client account',
  );

  test('keeps only Exercise Browser when Add exercise is chosen during a Home to Build entrance', async ({ context, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const assertNoPaidRequests = await blockPaidRequests(page);
    await loginAs(page, 'client');
    await page.goto('/dashboard/workout');

    const workspace = page.locator('.client-shell__content');
    await workspace.getByRole('heading', { name: 'Recommended workout' }).waitFor();
    await workspace.getByRole('button', { name: 'Review plan' }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout\/review$/);
    await workspace.getByRole('button', { name: 'Edit workout' }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout\/build$/);

    await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout$/);
    await page.waitForTimeout(300);
    // Slow the real browser animations so the second navigation reliably lands
    // during the 220 ms Build entrance, then restore normal speed before settle.
    const animation = await context.newCDPSession(page);
    await animation.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
    await workspace.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page).toHaveURL(/\/dashboard\/workout\/build$/);
    await workspace.getByRole('button', { name: 'Add exercise' }).last().click({ force: true });
    await expect(page).toHaveURL(/\/dashboard\/workout\/exercises$/);
    await animation.send('Animation.setPlaybackRate', { playbackRate: 1 });
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('workout-route-transition')).toHaveCount(1);
    await expect(page.locator('[aria-label="Add Exercise"]')).toHaveCount(1);
    await assertNoPaidRequests();
  });
});
