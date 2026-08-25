import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { assertMinimumTargets, assertNamedInteractiveControls, assertNoPageOverflow, assertTheme } from './helpers/accessibility';
import { blockPaidRequests, loginAs, setTheme, type ThemeMode } from './helpers/auth';

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

async function assertWorkoutSurface(page: Page, theme: ThemeMode) {
  await assertTheme(page, theme);
  await assertNamedInteractiveControls(page);
  await assertMinimumTargets(page, 44);
  await assertNoPageOverflow(page);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await expect(nav).toHaveCSS('bottom', '0px');
}

function currentWorkspace(page: Page): Locator {
  return page.locator('.client-shell__content').getByRole('main');
}

async function waitForRouteSettled(page: Page, pathname: string) {
  await expect(page).toHaveURL(new RegExp(`${pathname.replaceAll('/', '\\/')}$`));
  await expect(page.locator('.client-shell__content')).toHaveCount(1);
}

async function waitForWorkoutHomeSettled(page: Page) {
  await waitForRouteSettled(page, '/dashboard/workout');
  await expect(page.getByRole('button', { name: 'Preview Push' })).toBeEnabled();
  await expect.poll(async () => page.locator('.workout-mode-card img').evaluateAll((images) => images.length === 2 && images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), {
    message: 'premium workout mode artwork must be decoded before capture',
  }).toBe(true);
}

async function captureWorkout(page: Page, testInfo: TestInfo, name: string) {
  await expect.poll(async () => page.locator('[data-loading-skeleton]').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }).length), { message: 'workout screenshot must not capture a loading skeleton' }).toBe(0);
  // The local Next.js dev indicator is not part of the production application.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: testInfo.outputPath(name) });
}

test.describe('Workout Workspace V2', () => {
  test.skip(!process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD, 'Local-auth runner supplies the disposable client account');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('trophe_pwa_install_dismissed', String(Date.now()));
    });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: draft to pause and guarded finish`, async ({ page }, testInfo) => {
      const assertNoPaidRequests = await blockPaidRequests(page);
      await loginAs(page, 'client');
      await setTheme(page, theme);
      await page.goto('/dashboard/workout');
      await waitForWorkoutHomeSettled(page);
      await page.getByRole('button', { name: 'Preview Push' }).click();
      await page.getByRole('button', { name: 'Use this template' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/build');
      await expect(currentWorkspace(page).getByText('Draft · Not started')).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/review');
      await currentWorkspace(page).getByRole('button', { name: 'Start live workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await currentWorkspace(page).getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByText('Paused')).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Finish Workout' }).click();
      await expect(page.getByRole('dialog', { name: 'Finish workout?' })).toBeVisible();
      await assertWorkoutSurface(page, theme);
      await captureWorkout(page, testInfo, `${theme}-guarded-finish.png`);
      assertNoPaidRequests();
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of viewports) {
      test(`${theme} ${viewport.width}x${viewport.height}: home is centered and does not scroll sideways`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        const assertNoPaidRequests = await blockPaidRequests(page);
        await loginAs(page, 'client');
        await setTheme(page, theme);
        await page.goto('/dashboard/workout');
        await waitForWorkoutHomeSettled(page);
        await assertWorkoutSurface(page, theme);
        await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}.png`);
        if (viewport.width === 320) {
          await page.getByRole('button', { name: 'Preview Push' }).click();
          await page.getByRole('button', { name: 'Use this template' }).click();
          await waitForRouteSettled(page, '/dashboard/workout/build');
          await expect(currentWorkspace(page).getByText('Draft · Not started')).toBeVisible();
          await assertWorkoutSurface(page, theme);
          await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-build.png`);
        }
        assertNoPaidRequests();
      });
    }
  }
});
