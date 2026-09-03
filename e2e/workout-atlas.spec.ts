import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { assertNoPageOverflow, assertTheme } from './helpers/accessibility';
import { blockPaidRequests, loginAs, setTheme, type ThemeMode } from './helpers/auth';

type EvidenceViewport = { width: number; height: number };

const homeViewports: readonly EvidenceViewport[] = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];

const routedViewports: readonly EvidenceViewport[] = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
];

function workspace(page: Page) {
  return page.locator('.client-shell__content').getByRole('main');
}

async function waitForPath(page: Page, pathname: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
  await expect(page.locator('.client-shell__content')).toHaveCount(1);
}

async function waitForSettledArtwork(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect.poll(async () => page.locator('[data-loading-skeleton], .animate-pulse, .animate-spin').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }).length), { message: 'release evidence must not contain a visible loading state' }).toBe(0);
  await expect.poll(async () => page.locator('img').evaluateAll((images) => images.filter((image) => {
    const element = image as HTMLImageElement;
    return element.getClientRects().length > 0 && (!element.complete || element.naturalWidth === 0);
  }).length), { message: 'release evidence must not contain undecoded artwork' }).toBe(0);
}

async function captureSurface(
  page: Page,
  testInfo: TestInfo,
  theme: ThemeMode,
  surface: string,
  viewports: readonly EvidenceViewport[] = routedViewports,
) {
  const reviewDirectory = join(process.cwd(), '.impeccable', 'review');
  mkdirSync(reviewDirectory, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    await waitForSettledArtwork(page);
    await assertTheme(page, theme);
    await assertNoPageOverflow(page);
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const screenshot = await page.screenshot({
      animations: 'disabled',
    });
    writeFileSync(testInfo.outputPath(`${theme}-${surface}-${viewport.width}x${viewport.height}.png`), screenshot);
    writeFileSync(join(reviewDirectory, `workout-${surface}-${theme}-${viewport.width}.png`), screenshot);
  }
}

async function openLiveAction(page: Page, name: 'Technique' | 'Report pain' | 'Plate calculator') {
  const main = workspace(page);
  const action = main.getByRole('button', { name, exact: true }).first();
  if (!(await action.isVisible())) {
    await main.getByRole('button', { name: 'More exercise options' }).first().click();
  }
  await expect(action).toBeVisible();
  await action.click();
}

test.describe('premium workout atlas authenticated release journey', () => {
  test.skip(!process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD, 'Local-auth runner supplies the disposable client account');
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'One Chromium context sets every required phone and desktop viewport explicitly');
    await page.addInitScript(() => {
      window.localStorage.setItem('trophe_pwa_install_dismissed', String(Date.now()));
      window.localStorage.setItem('trophe_lang', 'en');
    });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: atlas plan, explicit live session, overlays, summary, history, and analytics`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const assertNoPaidRequests = await blockPaidRequests(page);

      await loginAs(page, 'client');
      await setTheme(page, theme);
      await page.goto('/dashboard/workout?evidence=atlas');
      await waitForPath(page, '/dashboard/workout');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByTestId('workout-primary-action')).toHaveText(/Review plan|Build workout/);
      await expect(page.getByRole('heading', { name: "Today's target" })).toBeVisible();
      await captureSurface(page, testInfo, theme, 'home', homeViewports);

      // Discovery starts as planning even when the fresh account has a seeded
      // recommendation. It never starts a session or overwrites that offer.
      await page.setViewportSize(routedViewports[0]);
      await page.getByRole('link', { name: 'Find an exercise' }).click();
      await waitForPath(page, '/dashboard/workout/exercises');
      await page.goto('/dashboard/workout/exercises?source=atlas');
      await waitForPath(page, '/dashboard/workout/exercises');
      await page.getByRole('button', { name: 'Create strength draft' }).click();
      await expect(page.getByRole('heading', { name: 'What are you training?' })).toBeVisible();
      await captureSurface(page, testInfo, theme, 'discovery');

      const search = page.getByRole('searchbox', { name: 'Search exercises...' });
      // The local release catalogue guarantees this exact, barbell-gated V3
      // movement. Avoid fuzzy "Bench Press" matching, which can truthfully
      // return only the Smith-machine movement on older seeded catalogues.
      await search.fill('Floor Press');
      const exactInfo = page.getByRole('button', { name: 'Exercise info: Floor Press', exact: true });
      await expect(exactInfo).toBeVisible();
      await exactInfo.click();
      await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/dashboard\/workout\/exercises\/[^/]+$/);
      const detailPath = new URL(page.url()).pathname;

      // Query changes must not reclassify or eject the exact-detail route.
      await page.goto(`${detailPath}?return=build&source=atlas`);
      await waitForPath(page, detailPath);
      await expect(page.getByRole('heading', { name: 'Floor Press', exact: true })).toBeVisible();
      await expect(page.getByTestId('exercise-motion-video')).toBeVisible();
      await page.getByRole('button', { name: 'Work phase' }).click();
      await expect(page.getByRole('button', { name: 'Work phase' })).toHaveAttribute('aria-pressed', 'true');
      const routedPause = page.getByRole('button', { name: 'Pause demonstration' });
      if (await routedPause.isVisible()) await routedPause.click();
      await captureSurface(page, testInfo, theme, 'exact-detail-phase');

      await page.getByRole('button', { name: 'Add Floor Press', exact: true }).click();
      await waitForPath(page, '/dashboard/workout/build');
      await expect(workspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue('Strength');
      await expect(workspace(page).getByText('Draft · Not started')).toBeVisible();
      await captureSurface(page, testInfo, theme, 'build');

      await workspace(page).getByRole('button', { name: 'Review workout' }).click();
      await waitForPath(page, '/dashboard/workout/review');
      await expect(workspace(page).getByRole('button', { name: 'Start workout' })).toBeEnabled();
      await captureSurface(page, testInfo, theme, 'review');

      // A query-only navigation must preserve Review and the prepared draft.
      await page.goto('/dashboard/workout/review?evidence=query-stable');
      await waitForPath(page, '/dashboard/workout/review');
      await expect(workspace(page).getByRole('button', { name: 'Start workout' })).toBeEnabled();
      await workspace(page).getByRole('button', { name: 'Start workout' }).click();
      await waitForPath(page, '/dashboard/workout/live');
      await expect(workspace(page).getByText('Exercise 1 of 1')).toBeVisible();
      const weight = workspace(page).getByRole('spinbutton', { name: 'Weight in kg' }).first();
      const reps = workspace(page).getByRole('spinbutton', { name: 'Reps' }).first();
      await expect(weight).toBeEnabled();
      await captureSurface(page, testInfo, theme, 'live');

      await openLiveAction(page, 'Technique');
      const technique = page.getByRole('dialog');
      await expect(technique.getByRole('heading', { name: 'Floor Press', exact: true })).toBeVisible();
      await expect(technique.getByTestId('exercise-motion-video')).toBeVisible();
      await technique.getByRole('button', { name: 'Work phase' }).click();
      const techniquePause = technique.getByRole('button', { name: 'Pause demonstration' });
      if (await techniquePause.isVisible()) await techniquePause.click();
      await captureSurface(page, testInfo, theme, 'overlay-technique-work-phase');
      await technique.getByRole('button', { name: 'Close exercise details' }).click();
      await expect(technique).toHaveCount(0);

      await weight.fill('60');
      await reps.fill('8');
      await openLiveAction(page, 'Plate calculator');
      const plate = page.getByRole('dialog', { name: 'Plate calculator' });
      await expect(plate).toBeVisible();
      await expect(plate.getByLabel('Total weight (kg)')).toHaveValue('60');
      await captureSurface(page, testInfo, theme, 'overlay-plate-calculator');
      await plate.getByRole('button', { name: 'Cancel' }).first().click();
      await expect(plate).toHaveCount(0);

      await openLiveAction(page, 'Report pain');
      const pain = page.getByRole('dialog', { name: 'Report pain' });
      await expect(pain).toBeVisible();
      await expect(pain.getByRole('radio', { name: '1 Mild', exact: true })).toBeChecked();
      await captureSurface(page, testInfo, theme, 'overlay-pain-flag');
      await pain.getByRole('button', { name: 'Cancel' }).click();
      await expect(pain).toHaveCount(0);

      await workspace(page).getByRole('button', { name: 'Complete set' }).first().click();
      await expect(workspace(page).getByRole('button', { name: 'Undo set' })).toHaveCount(1);
      await workspace(page).getByRole('button', { name: 'Finish Workout' }).click();
      const finish = page.getByRole('dialog', { name: 'Finish workout?' });
      await expect(finish).toBeVisible();
      await expect(finish.getByText('1 completed sets')).toBeVisible();
      await captureSurface(page, testInfo, theme, 'overlay-finish-confirmation');
      await finish.getByRole('button', { name: 'Save and finish' }).click();
      await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
      await captureSurface(page, testInfo, theme, 'summary');

      await page.getByRole('link', { name: 'History', exact: true }).click();
      await waitForPath(page, '/dashboard/workout/history');
      await expect(page.getByRole('heading', { name: 'History', exact: true })).toHaveCount(1);
      await expect(page.locator('[data-history-card]').first()).toBeVisible();
      await captureSurface(page, testInfo, theme, 'history');

      await page.goto('/dashboard/workout/stats?range=month');
      await waitForPath(page, '/dashboard/workout/stats');
      await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
      await captureSurface(page, testInfo, theme, 'analytics');

      assertNoPaidRequests();
    });
  }
});
