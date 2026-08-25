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

async function waitForWorkoutRouteAtTop(page: Page, message: string) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  await expect.poll(() => page.evaluate(() => window.scrollY), { message }).toBe(0);
}

async function waitForWorkoutBuildAtTop(page: Page) {
  await waitForRouteSettled(page, '/dashboard/workout/build');
  const heading = page.getByRole('heading', { name: 'Build Workout' });
  const back = page.getByRole('link', { name: 'Back to Workout Home' });
  const home = page.getByRole('link', { name: 'Workout Home', exact: true });
  await expect(heading).toBeVisible();
  await expect(back).toBeVisible();
  await expect(home).toBeVisible();
  await expect(heading).toBeInViewport();
  await expect(back).toBeInViewport();
  await expect(home).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'explicit workout navigation must land at the top' }).toBe(0);
}

async function waitForWorkoutHomeSettled(page: Page) {
  await waitForRouteSettled(page, '/dashboard/workout');
  await expect(page.getByRole('button', { name: 'Preview Push' })).toBeEnabled();
  await expect.poll(async () => page.locator('.workout-mode-card img').evaluateAll((images) => images.length === 2 && images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), {
    message: 'premium workout mode artwork must be decoded before capture',
  }).toBe(true);
}

async function captureWorkout(page: Page, testInfo: TestInfo, name: string, options: { atTop?: boolean } = {}) {
  await expect.poll(async () => page.locator('[data-loading-skeleton]').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }).length), { message: 'workout screenshot must not capture a loading skeleton' }).toBe(0);
  await expect.poll(async () => page.locator('img').evaluateAll((images) => images.filter((image) => {
    const element = image as HTMLImageElement;
    return element.getClientRects().length > 0 && (!element.complete || element.naturalWidth === 0);
  }).length), { message: 'visible workout artwork must be decoded before capture' }).toBe(0);
  if (options.atTop) {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    await waitForWorkoutRouteAtTop(page, `${name} release evidence must capture the route from the top`);
  }
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
    test(`${theme}: complete release evidence journey`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const assertNoPaidRequests = await blockPaidRequests(page);
      await loginAs(page, 'client');
      await setTheme(page, theme);
      await page.goto('/dashboard/workout');
      await waitForWorkoutHomeSettled(page);
      await assertWorkoutSurface(page, theme);
      await captureWorkout(page, testInfo, `${theme}-evidence-01-home.png`, { atTop: true });

      await page.getByRole('button', { name: 'Preview Push' }).click();
      await expect(page.getByRole('region', { name: 'Preview', exact: true })).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-02-preview.png`);
      await page.getByRole('button', { name: 'Use this template' }).click();
      await waitForWorkoutBuildAtTop(page);
      await expect(currentWorkspace(page).getByText('Draft · Not started')).toBeVisible();
      await expect(page.getByLabel('Workout status: Draft')).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-03-build.png`, { atTop: true });

      await currentWorkspace(page).getByRole('button', { name: 'Add exercise' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/exercises');
      await waitForWorkoutRouteAtTop(page, 'exercise browser must open at the top');
      const search = page.getByRole('searchbox', { name: 'Search exercises...' });
      await expect(search).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-04-browser.png`, { atTop: true });
      await search.fill('Bench Press');
      const exerciseInfo = page.getByRole('button', { name: /^Exercise info:/ }).first();
      await expect(exerciseInfo).toBeVisible();
      const detailName = (await exerciseInfo.getAttribute('aria-label'))?.replace(/^Exercise info:\s*/, '');
      expect(detailName).toBeTruthy();
      await exerciseInfo.click();
      await expect(page).toHaveURL(/\/dashboard\/workout\/exercises\/[^/]+$/);
      await expect(page.getByRole('heading', { name: detailName!, exact: true })).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-05-detail.png`, { atTop: true });
      await page.getByRole('link', { name: 'Back to exercises' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/exercises');
      await page.getByRole('button', { name: 'Close exercise picker' }).click();
      await waitForWorkoutBuildAtTop(page);

      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await waitForWorkoutHomeSettled(page);
      await expect(page.getByLabel('Workout status: Draft')).toHaveCount(0);
      await page.goBack();
      await waitForRouteSettled(page, '/dashboard/workout/build');
      await expect(page.getByLabel('Workout status: Draft')).toBeVisible();
      await expect(currentWorkspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue('Push');
      await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/review');
      await waitForWorkoutRouteAtTop(page, 'review must open at the top');
      await captureWorkout(page, testInfo, `${theme}-evidence-06-review.png`, { atTop: true });
      await currentWorkspace(page).getByRole('button', { name: 'Start live workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await waitForWorkoutRouteAtTop(page, 'live workout must open at the top');
      const weight = currentWorkspace(page).getByRole('spinbutton', { name: 'Weight in kg' }).first();
      const reps = currentWorkspace(page).getByRole('spinbutton', { name: 'Reps' }).first();
      await expect(weight).toBeEnabled();
      await captureWorkout(page, testInfo, `${theme}-evidence-07-live.png`, { atTop: true });

      await weight.fill('60');
      await reps.fill('8');
      await currentWorkspace(page).getByRole('button', { name: 'More exercise options' }).first().click();
      await currentWorkspace(page).getByRole('button', { name: 'Report pain' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Report pain' })).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-09-pain.png`);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await currentWorkspace(page).getByRole('button', { name: 'Plate calculator' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Plate calculator' })).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-10-plate.png`);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await currentWorkspace(page).getByRole('button', { name: 'Complete set' }).first().click();
      await expect(currentWorkspace(page).getByRole('button', { name: 'Undo set' }).first()).toBeVisible();

      await currentWorkspace(page).getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByText('Paused')).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      await captureWorkout(page, testInfo, `${theme}-evidence-08-paused.png`, { atTop: true });
      await currentWorkspace(page).getByRole('button', { name: 'Finish Workout' }).click();
      await expect(page.getByRole('dialog', { name: 'Finish workout?' })).toBeVisible();
      await assertWorkoutSurface(page, theme);
      await captureWorkout(page, testInfo, `${theme}-evidence-11-finish.png`);
      await page.getByRole('button', { name: 'Save and finish' }).click();
      await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
      await expect(page.getByLabel('Workout status: Completed')).toBeVisible();
      await assertWorkoutSurface(page, theme);
      await captureWorkout(page, testInfo, `${theme}-evidence-12-completed.png`, { atTop: true });
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
          const useTemplate = page.getByRole('button', { name: 'Use this template' });
          await useTemplate.scrollIntoViewIfNeeded();
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
          await useTemplate.click();
          await waitForWorkoutBuildAtTop(page);
          await expect(currentWorkspace(page).getByText('Draft · Not started')).toBeVisible();
          await assertWorkoutSurface(page, theme);
          await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-build.png`);
        }
        assertNoPaidRequests();
      });
    }
  }
});
