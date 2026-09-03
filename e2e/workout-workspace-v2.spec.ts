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
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 430) {
    const labels = nav.locator('[data-bot-nav-label]');
    await expect(labels.first()).toBeHidden();
    const icons = await nav.locator('[data-bot-nav-icon]').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width };
    }));
    expect(icons).toHaveLength(5);
    for (let index = 0; index < icons.length - 1; index += 1) {
      expect(icons[index].width).toBeGreaterThan(0);
      expect(icons[index + 1].left - icons[index].right).toBeGreaterThanOrEqual(16);
    }
  } else if (viewport) {
    await expect(nav.locator('[data-bot-nav-label]').first()).toBeVisible();
  }
}

function currentWorkspace(page: Page): Locator {
  return page.locator('.client-shell__content').getByRole('main');
}

async function waitForRouteSettled(page: Page, pathname: string) {
  await expect(page).toHaveURL(new RegExp(`${pathname.replaceAll('/', '\\/')}$`));
  await expect(page.locator('.client-shell__content')).toHaveCount(1);
  await expect(page.getByTestId('workout-route-transition')).toHaveCount(1);
}

async function waitForWorkoutRouteAtTop(page: Page, message: string) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  await expect.poll(() => page.evaluate(() => ({
    documentTop: document.scrollingElement?.scrollTop ?? -1,
    windowTop: window.scrollY,
    visualPageTop: window.visualViewport?.pageTop ?? 0,
    visualOffsetTop: window.visualViewport?.offsetTop ?? 0,
  })), { message }).toEqual({ documentTop: 0, windowTop: 0, visualPageTop: 0, visualOffsetTop: 0 });
}

async function assertCanonicalWorkoutChrome(page: Page, workspaceTitle: string) {
  const appTitle = page.getByRole('heading', { name: 'Trophē', exact: true });
  const toolbarTitle = page.getByRole('heading', { name: workspaceTitle, exact: true });
  const back = page.getByRole('link', { name: 'Back', exact: true });
  const home = page.getByRole('link', { name: 'Workout Home', exact: true });
  await expect(appTitle).toBeInViewport();
  await expect(toolbarTitle).toBeInViewport();
  await expect(back).toBeInViewport();
  await expect(home).toBeInViewport();
  const geometry = await page.evaluate(({ appText, toolbarText }) => {
    const heading = (text: string) => [...document.querySelectorAll('h1')].find((element) => element.textContent?.trim() === text);
    const rect = (element: Element | null | undefined) => {
      const box = element?.getBoundingClientRect();
      return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height } : null;
    };
    const appHeader = heading(appText)?.closest('header');
    const toolbar = heading(toolbarText)?.closest('header');
    return {
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      app: rect(appHeader),
      toolbar: rect(toolbar),
      back: rect(document.querySelector('a[aria-label="Back"]')),
      home: rect(document.querySelector('a[aria-label="Workout Home"]')),
    };
  }, { appText: 'Trophē', toolbarText: workspaceTitle });
  expect(geometry.app).not.toBeNull();
  expect(geometry.toolbar).not.toBeNull();
  expect(geometry.app!.top).toBeGreaterThanOrEqual(0);
  expect(geometry.toolbar!.top).toBeGreaterThanOrEqual(geometry.app!.bottom - 1);
  expect(geometry.toolbar!.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  for (const target of [geometry.back, geometry.home]) {
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.top).toBeGreaterThanOrEqual(0);
    expect(target!.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  }
}

async function assertControlClearsBottomNav(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const [controlBox, navBox] = await Promise.all([
    control.boundingBox(),
    page.getByRole('navigation', { name: 'Primary' }).boundingBox(),
  ]);
  expect(controlBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(navBox!.y - 4);
}

async function assertRoutedExerciseDetailGeometry(page: Page, theme: ThemeMode) {
  await assertWorkoutSurface(page, theme);
  const detail = page.locator('.exercise-detail--route');
  const evidence = detail.getByRole('heading', { name: 'Training evidence' });
  const action = detail.locator('.exercise-detail__action button');
  await evidence.scrollIntoViewIfNeeded();
  await expect(evidence).toBeVisible();
  await expect(action).toBeVisible();
  await assertControlClearsBottomNav(page, action);
  const scroll = await page.evaluate(() => ({
    top: document.scrollingElement?.scrollTop ?? 0,
    max: Math.max(0, (document.scrollingElement?.scrollHeight ?? 0) - (window.visualViewport?.height ?? window.innerHeight)),
  }));
  expect(scroll.top).toBeGreaterThan(0);
  expect(scroll.top).toBeLessThanOrEqual(scroll.max + 1);
}

async function assertLiveExerciseSheetGeometry(page: Page, theme: ThemeMode) {
  await assertWorkoutSurface(page, theme);
  const dialog = page.getByRole('dialog');
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThanOrEqual(1);
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport!.height - 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await dialog.getByRole('heading', { name: 'Training evidence' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('heading', { name: 'Training evidence' })).toBeVisible();
  const containment = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(containment.scrollHeight).toBeGreaterThan(containment.clientHeight);
  expect(containment.pageOverflow).toBeLessThanOrEqual(1);
}

async function waitForWorkoutBuildAtTop(page: Page) {
  await waitForRouteSettled(page, '/dashboard/workout/build');
  const heading = page.getByRole('heading', { name: 'Build Workout' });
  const back = page.getByRole('link', { name: 'Back', exact: true });
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
  const statusRail = currentWorkspace(page).getByRole('region', { name: "Today's workout status" });
  const targetHeading = currentWorkspace(page).getByRole('heading', { name: "Today's target" });
  const primaryAction = currentWorkspace(page).getByTestId('workout-primary-action');
  await expect(statusRail).toHaveCount(1);
  await expect(targetHeading).toHaveCount(1);
  await expect(primaryAction).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Workout Home', exact: true })).toBeVisible();
  await expect(statusRail).toBeVisible();
  await expect(targetHeading).toBeVisible();
  await expect(primaryAction).toBeEnabled();
  await expect(page.locator('[data-loading-skeleton]')).toHaveCount(0);
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
      test.setTimeout(120_000);
      const routineName = `E2E ${theme} ${testInfo.project.name} ${Date.now().toString(36)} Push`;
      await page.setViewportSize({ width: 390, height: 844 });
      const assertNoPaidRequests = await blockPaidRequests(page);
      await loginAs(page, 'client');
      await setTheme(page, theme);
      await page.goto('/dashboard/workout');
      await waitForWorkoutHomeSettled(page);
      await assertWorkoutSurface(page, theme);
      await captureWorkout(page, testInfo, `${theme}-evidence-01-home.png`, { atTop: true });

      await expect(currentWorkspace(page).getByRole('heading', { name: 'Recommended workout' })).toBeVisible();
      await expect(currentWorkspace(page).getByText('Recommended by Trophē', { exact: true })).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Review plan' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/review');
      await waitForWorkoutRouteAtTop(page, 'recommended workout review must open at the top');
      await expect(currentWorkspace(page).getByTestId('plan-exercise')).toHaveCount(3);
      await expect(currentWorkspace(page).getByRole('button', { name: 'Start workout' })).toBeEnabled();
      await captureWorkout(page, testInfo, `${theme}-evidence-02-recommended-review.png`, { atTop: true });
      await currentWorkspace(page).getByRole('button', { name: 'Edit workout' }).click();
      await waitForWorkoutBuildAtTop(page);
      await expect(currentWorkspace(page).getByText('Draft · Not started')).toBeVisible();
      await expect(page.getByLabel('Workout status: Draft')).toBeVisible();
      await currentWorkspace(page).getByRole('textbox', { name: 'Workout name' }).fill(routineName);
      await assertCanonicalWorkoutChrome(page, 'Build Workout');
      const firstBuildCard = currentWorkspace(page).getByTestId('plan-exercise').first();
      await expect(firstBuildCard.locator('img')).toBeVisible();
      await expect(firstBuildCard).toHaveAttribute('data-media-tier', /^(verified-technique|verified-anatomy|reference)$/);
      await expect(firstBuildCard.getByText(/^(Technique verified|Anatomy reference|No exact demo yet)$/)).toBeVisible();
      await expect(firstBuildCard.getByText(/^Equipment:/)).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-03-build.png`, { atTop: true });

      await currentWorkspace(page).getByRole('button', { name: 'Save plan' }).click();
      await expect(currentWorkspace(page).getByRole('status')).toContainText('Routine saved with name, order, sets and reps.');

      // Returning Home keeps the draft dominant. Choosing cardio is an
      // explicit, named replace decision: Cancel preserves it; Confirm swaps it.
      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await waitForWorkoutHomeSettled(page);
      await expect(currentWorkspace(page).getByRole('button', { name: 'Continue editing' })).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Plan cardio' }).click();
      const replaceDraft = page.getByRole('alertdialog', { name: 'Replace this draft?' });
      await expect(replaceDraft).toContainText(`Replace ${routineName} with Cardio`);
      await replaceDraft.getByRole('button', { name: 'Keep current draft' }).click();
      await expect(currentWorkspace(page).getByRole('button', { name: 'Continue editing' })).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Plan cardio' }).click();
      await page.getByRole('alertdialog', { name: 'Replace this draft?' }).getByRole('button', { name: 'Replace draft' }).click();
      await waitForWorkoutBuildAtTop(page);
      await expect(currentWorkspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue('Cardio');

      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await waitForWorkoutHomeSettled(page);
      await currentWorkspace(page).getByRole('button', { name: `Preview ${routineName}` }).click();
      await expect(page.getByRole('region', { name: 'Preview', exact: true })).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Use this template' }).click();
      await page.getByRole('alertdialog', { name: 'Replace this draft?' }).getByRole('button', { name: 'Replace draft' }).click();
      await waitForWorkoutBuildAtTop(page);
      await currentWorkspace(page).getByRole('textbox', { name: 'Workout name' }).fill(routineName);

      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await waitForWorkoutHomeSettled(page);
      await page.reload();
      await waitForWorkoutHomeSettled(page);
      const routines = currentWorkspace(page).getByRole('heading', { name: 'Saved plans' }).locator('..');
      await expect(routines.getByRole('button', { name: `Preview ${routineName}` })).toBeVisible();
      await currentWorkspace(page).getByRole('button', { name: 'Plan cardio' }).click();
      await page.getByRole('alertdialog', { name: 'Replace this draft?' }).getByRole('button', { name: 'Replace draft' }).click();
      await waitForWorkoutBuildAtTop(page);
      await expect(currentWorkspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue('Cardio');
      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await waitForWorkoutHomeSettled(page);
      await currentWorkspace(page).getByRole('button', { name: `Preview ${routineName}` }).click();
      await currentWorkspace(page).getByRole('button', { name: 'Use this template' }).click();
      await page.getByRole('alertdialog', { name: 'Replace this draft?' }).getByRole('button', { name: 'Replace draft' }).click();
      await waitForWorkoutBuildAtTop(page);
      await expect(currentWorkspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue(routineName);

      await currentWorkspace(page).getByRole('button', { name: 'Add exercise' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/exercises');
      await waitForWorkoutRouteAtTop(page, 'exercise browser must open at the top');
      const search = page.getByRole('searchbox', { name: 'Search exercises...' });
      await expect(search).toBeVisible();
      await assertControlClearsBottomNav(page, page.getByRole('button', { name: 'Review plan' }));
      await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/dashboard/workout/build');
      await captureWorkout(page, testInfo, `${theme}-evidence-04-browser.png`, { atTop: true });
      await search.fill('Floor Press');
      const exerciseInfo = page.getByRole('button', { name: 'Exercise info: Floor Press', exact: true });
      await expect(exerciseInfo).toBeVisible();
      const detailName = (await exerciseInfo.getAttribute('aria-label'))?.replace(/^Exercise info:\s*/, '');
      expect(detailName).toBeTruthy();
      await exerciseInfo.click();
      await expect(page).toHaveURL(/\/dashboard\/workout\/exercises\/[^/]+$/);
      await expect(page.getByRole('heading', { name: detailName!, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/dashboard/workout/exercises');
      await captureWorkout(page, testInfo, `${theme}-evidence-05-detail.png`, { atTop: true });
      await page.getByRole('link', { name: 'Back', exact: true }).click();
      await waitForRouteSettled(page, '/dashboard/workout/exercises');
      await search.fill('Floor Press');
      await page.getByRole('button', { name: 'Add Floor Press', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Floor Press added', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Close exercise picker' }).click();
      await waitForWorkoutBuildAtTop(page);

      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await waitForWorkoutHomeSettled(page);
      await expect(page.getByLabel('Workout status: Draft')).toHaveCount(0);
      await page.goBack();
      await waitForRouteSettled(page, '/dashboard/workout/build');
      await expect(page.getByLabel('Workout status: Draft')).toBeVisible();
      await expect(currentWorkspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue(routineName);
      await currentWorkspace(page).getByRole('spinbutton', { name: /^Target sets for/ }).first().fill('4');
      await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/review');
      await waitForWorkoutRouteAtTop(page, 'review must open at the top');
      await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/dashboard/workout/build');
      const firstReviewExercise = currentWorkspace(page).getByTestId('plan-exercise').first();
      await expect(firstReviewExercise.locator('img')).toBeVisible();
      await expect(firstReviewExercise).toHaveAttribute('data-media-tier', /^(verified-technique|verified-anatomy|reference)$/);
      await expect(firstReviewExercise.getByText(/^4 sets ·/)).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-06-review.png`, { atTop: true });
      await page.getByRole('link', { name: 'Back', exact: true }).click();
      await waitForWorkoutBuildAtTop(page);
      await expect(currentWorkspace(page).getByRole('spinbutton', { name: /^Target sets for/ }).first()).toHaveValue('4');
      await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/review');
      await currentWorkspace(page).getByRole('button', { name: 'Start workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await waitForWorkoutRouteAtTop(page, 'live workout must open at the top');
      const weight = currentWorkspace(page).getByRole('spinbutton', { name: 'Weight in kg' }).first();
      const reps = currentWorkspace(page).getByRole('spinbutton', { name: 'Reps' }).first();
      await expect(weight).toBeEnabled();
      await assertCanonicalWorkoutChrome(page, 'Live Workout');
      await captureWorkout(page, testInfo, `${theme}-evidence-07-live.png`, { atTop: true });

      await page.goto('/dashboard/workout');
      await expect(page.getByRole('button', { name: 'Resume workout' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Build strength workout' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Resume workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await page.goto('/dashboard/workout/build');
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await page.goto('/dashboard/workout/review');
      await waitForRouteSettled(page, '/dashboard/workout/live');

      const firstSetRow = currentWorkspace(page).locator('[data-set-row]').first();
      const firstLiveExerciseName = (await firstSetRow.getByRole('heading').textContent())?.trim();
      const firstLiveExerciseId = await firstSetRow.getAttribute('data-exercise-id');
      expect(firstLiveExerciseName).toBeTruthy();
      expect(firstLiveExerciseId).toBeTruthy();
      await weight.fill('60');
      await reps.fill('8');
      await currentWorkspace(page).getByRole('checkbox', { name: 'Warmup' }).first().click();
      await currentWorkspace(page).getByRole('button', { name: 'Complete set' }).first().click();
      await expect(currentWorkspace(page).getByRole('button', { name: 'Undo set' })).toHaveCount(1);
      const shiftedWorkWeight = currentWorkspace(page).getByRole('spinbutton', { name: 'Weight in kg' }).nth(1);
      const shiftedWorkReps = currentWorkspace(page).getByRole('spinbutton', { name: 'Reps' }).nth(1);
      await expect(shiftedWorkWeight).toHaveValue('');
      await expect(shiftedWorkReps).toHaveValue('');
      await shiftedWorkWeight.fill('65');
      await shiftedWorkReps.fill('8');
      await currentWorkspace(page).getByRole('button', { name: 'Complete set' }).first().click();
      await expect(currentWorkspace(page).getByRole('button', { name: 'Undo set' })).toHaveCount(2);
      await page.reload();
      await expect(currentWorkspace(page).getByRole('button', { name: 'Undo set' })).toHaveCount(2);
      const recoveredFirstExerciseRows = currentWorkspace(page).locator(`[data-set-row][data-exercise-id="${firstLiveExerciseId}"]`);
      await expect(recoveredFirstExerciseRows).toHaveCount(5);
      await expect(recoveredFirstExerciseRows.getByRole('button', { name: 'Complete set' })).toHaveCount(3);

      await currentWorkspace(page).getByRole('button', { name: 'More exercise options' }).first().click();
      await currentWorkspace(page).getByRole('button', { name: 'Report pain' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Report pain' })).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-09-pain.png`);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await page.getByRole('navigation', { name: 'Workout path' }).getByRole('button').filter({ hasText: 'Floor Press' }).click();
      const floorPressStage = currentWorkspace(page).getByRole('region', { name: 'Floor Press', exact: true });
      await expect(floorPressStage).toBeVisible();
      const floorPressRow = floorPressStage.locator('[data-set-row]').filter({ has: page.getByRole('heading', { name: 'Floor Press', exact: true }) }).first();
      await expect(floorPressRow).toBeVisible();
      await floorPressRow.getByRole('spinbutton', { name: 'Weight in kg' }).fill('60');
      await floorPressRow.getByRole('button', { name: 'More exercise options' }).click();
      await floorPressRow.getByRole('button', { name: 'Plate calculator' }).click();
      const plateCalculator = page.getByRole('dialog', { name: 'Plate calculator' });
      await expect(plateCalculator).toBeVisible();
      await captureWorkout(page, testInfo, `${theme}-evidence-10-plate.png`);
      await plateCalculator.getByRole('button', { name: 'Cancel', exact: true }).filter({ hasText: /^Cancel$/ }).click();
      await page.getByRole('navigation', { name: 'Workout path' }).getByRole('button').filter({ hasText: firstLiveExerciseName! }).click();
      await expect(currentWorkspace(page).getByRole('region', { name: firstLiveExerciseName!, exact: true })).toBeVisible();
      await expect(currentWorkspace(page).getByRole('button', { name: 'Undo set' })).toHaveCount(2);

      await currentWorkspace(page).getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByText('Paused')).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      await captureWorkout(page, testInfo, `${theme}-evidence-08-paused.png`, { atTop: true });
      await currentWorkspace(page).getByRole('button', { name: 'Finish Workout' }).click();
      const finishDialog = page.getByRole('dialog', { name: 'Finish workout?' });
      await expect(finishDialog).toBeVisible();
      await expect(finishDialog.getByText(/^Duration \d+ min$/)).toBeVisible();
      await expect(finishDialog).not.toContainText('NaN');
      await assertWorkoutSurface(page, theme);
      await captureWorkout(page, testInfo, `${theme}-evidence-11-finish.png`);
      await finishDialog.getByRole('button', { name: 'Save and finish' }).click();
      await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
      await expect(page.getByLabel('Workout status: Completed')).toBeVisible();
      await assertWorkoutSurface(page, theme);
      await assertCanonicalWorkoutChrome(page, 'Live Workout');
      await captureWorkout(page, testInfo, `${theme}-evidence-12-completed.png`, { atTop: true });

      await page.reload();
      await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
      await expect(page.getByLabel('Workout status: Completed')).toBeVisible();
      await page.goto('/dashboard/workout/build');
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
      await page.getByRole('link', { name: 'History' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/history');
      await waitForWorkoutRouteAtTop(page, 'history must open at the top after completing a workout');
      await expect(page.getByRole('heading', { name: 'History', exact: true })).toHaveCount(1);
      await assertCanonicalWorkoutChrome(page, 'History');
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout');
      await expect(page.getByRole('button', { name: 'View workout summary' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Build strength workout' })).toHaveCount(0);
      await page.getByRole('button', { name: 'View workout summary' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/live');
      if (theme === 'light') {
        await page.getByRole('link', { name: 'History' }).click();
        await waitForRouteSettled(page, '/dashboard/workout/history');
        const completedCard = page.locator('[data-history-card]').filter({ hasText: routineName }).first();
        await expect(completedCard).toBeVisible();
        await completedCard.getByRole('button').first().click();
        await completedCard.getByRole('button', { name: 'Repeat' }).click();
        await waitForRouteSettled(page, '/dashboard/workout/build');
        await expect(currentWorkspace(page).getByRole('textbox', { name: 'Workout name' })).toHaveValue(routineName);
        await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
        await waitForRouteSettled(page, '/dashboard/workout/review');
        await expect(currentWorkspace(page).getByText(routineName, { exact: true })).toBeVisible();
        await expect(currentWorkspace(page).getByRole('button', { name: 'Start workout' })).toBeEnabled();
      } else {
        await page.getByRole('button', { name: 'Done' }).click();
        await waitForWorkoutHomeSettled(page);
        await expect(page.getByRole('button', { name: 'Review plan' })).toBeEnabled();
      }
      assertNoPaidRequests();
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: routed detail and paused live sheet remain reachable, with running focus stable across a clock tick`, async ({ page }) => {
      const assertNoPaidRequests = await blockPaidRequests(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await loginAs(page, 'client');
      await setTheme(page, theme);
      await page.goto('/dashboard/workout');
      await waitForRouteSettled(page, '/dashboard/workout');

      await currentWorkspace(page).getByRole('link', { name: 'Find an exercise' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/exercises');
      await currentWorkspace(page).getByRole('button', { name: 'Create strength draft' }).click();
      const search = page.getByRole('searchbox', { name: 'Search exercises...' });
      await search.fill('Bench Press');
      const exerciseInfo = page.getByRole('button', { name: /^Exercise info:/ }).first();
      await expect(exerciseInfo).toBeVisible();
      await exerciseInfo.click();
      await expect(page).toHaveURL(/\/dashboard\/workout\/exercises\/[^/]+$/);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await assertRoutedExerciseDetailGeometry(page, theme);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.exercise-detail__action button').click();
      await waitForRouteSettled(page, '/dashboard/workout/build');
      await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/review');
      await currentWorkspace(page).getByRole('button', { name: 'Start workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout/live');
      await expect(currentWorkspace(page).getByRole('button', { name: 'More exercise options' }).first()).toBeEnabled();
      const pauseControl = currentWorkspace(page).getByRole('button', { name: 'Pause' });
      const runningClock = pauseControl.locator('..').getByText(/^\d+:\d{2}$/);
      await currentWorkspace(page).getByRole('button', { name: 'More exercise options' }).first().click();
      const techniqueOpener = currentWorkspace(page).getByRole('button', { name: 'Technique' }).first();
      await techniqueOpener.click();
      const runningExerciseDialog = page.getByRole('dialog');
      await expect(runningExerciseDialog).toBeVisible();
      const runningPhaseControl = runningExerciseDialog.getByRole('button', { name: 'Work phase' });
      await runningPhaseControl.focus();
      await expect(runningPhaseControl).toBeFocused();
      const focusedClockBaseline = await runningClock.textContent();
      await expect.poll(() => runningClock.textContent(), { timeout: 2_500 }).not.toBe(focusedClockBaseline);
      await expect(runningPhaseControl).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(runningExerciseDialog).toHaveCount(0);
      await expect(techniqueOpener).toBeFocused();

      await pauseControl.click();
      await expect(page.getByText('Paused')).toBeVisible();
      await expect(techniqueOpener).toBeVisible();
      await techniqueOpener.click();
      const pausedExerciseDialog = page.getByRole('dialog');
      await expect(pausedExerciseDialog).toBeVisible();
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await assertLiveExerciseSheetGeometry(page, theme);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      const phaseControl = pausedExerciseDialog.getByRole('button', { name: 'Work phase' });
      await phaseControl.focus();
      await expect(phaseControl).toBeFocused();
      const closeDetail = pausedExerciseDialog.getByRole('button', { name: 'Close exercise details' });
      await closeDetail.focus();
      await page.keyboard.press('Shift+Tab');
      expect(await pausedExerciseDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Tab');
      await expect(closeDetail).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(pausedExerciseDialog).toHaveCount(0);
      await expect(techniqueOpener).toBeFocused();

      await currentWorkspace(page).getByRole('button', { name: /finish workout/i }).click();
      await page.getByRole('button', { name: 'Discard empty workout' }).click();
      await waitForRouteSettled(page, '/dashboard/workout');
      assertNoPaidRequests();
    });
  }

  test('retrospective cardio survives a committed lost response and repeats into Review', async ({ page }) => {
    const workoutName = `E2E retrospective cardio ${Date.now().toString(36)}`;
    await page.setViewportSize({ width: 390, height: 844 });
    const assertNoPaidRequests = await blockPaidRequests(page);
    await loginAs(page, 'client');
    await setTheme(page, 'light');
    await page.goto('/dashboard/workout');
    await waitForWorkoutHomeSettled(page);
    await currentWorkspace(page).getByRole('button', { name: 'Plan cardio' }).click();
    await waitForWorkoutBuildAtTop(page);
    await currentWorkspace(page).getByRole('textbox', { name: 'Workout name' }).fill(workoutName);
    await currentWorkspace(page).getByRole('spinbutton', { name: 'Duration in minutes' }).fill('36');
    await currentWorkspace(page).getByRole('spinbutton', { name: 'Distance optional' }).fill('6.2');
    await currentWorkspace(page).getByRole('spinbutton', { name: 'Effort' }).fill('7');
    await currentWorkspace(page).getByRole('button', { name: 'Review workout' }).click();
    await waitForRouteSettled(page, '/dashboard/workout/review');
    await currentWorkspace(page).getByRole('button', { name: 'Log completed workout' }).click();

    let committedResponseLost = false;
    await page.route('**/rest/v1/rpc/save_retrospective_workout', async (route) => {
      if (committedResponseLost) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committedResponseLost = true;
      await route.abort('failed');
    });
    await currentWorkspace(page).getByRole('button', { name: 'Log completed workout' }).click();
    await page.getByRole('alertdialog', { name: 'Save completed workout?' }).getByRole('button', { name: 'Save workout' }).click();
    await expect.poll(() => committedResponseLost).toBe(true);
    await expect(page.getByRole('heading', { name: 'Completed workout awaiting confirmation' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Completed workout awaiting confirmation' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry same save' }).click();
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
    await expect(page.getByText('36 min')).toBeVisible();
    await expect(page.getByText('Workout recovery could not be verified.')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
    await expect(page.getByText('Workout recovery could not be verified.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Discard empty workout' })).toHaveCount(0);

    await page.getByRole('link', { name: 'History' }).click();
    await waitForRouteSettled(page, '/dashboard/workout/history');
    const sessionCard = page.locator('.glass').filter({ hasText: workoutName }).first();
    await sessionCard.getByRole('button').first().click();
    await sessionCard.getByRole('button', { name: 'Repeat' }).click();
    await waitForRouteSettled(page, '/dashboard/workout/review');
    await expect(currentWorkspace(page).getByText(workoutName, { exact: true })).toBeVisible();
    await expect(currentWorkspace(page).getByText('36 minutes')).toBeVisible();
    await expect(currentWorkspace(page).getByText('6.2 km')).toBeVisible();
    await expect(currentWorkspace(page).getByText('Effort 7/10')).toBeVisible();
    await expect(currentWorkspace(page).locator('details')).toHaveCount(0);
    assertNoPaidRequests();
  });

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
        if (viewport.width <= 375) {
          const reviewPlan = page.getByRole('button', { name: 'Review plan' });
          await reviewPlan.scrollIntoViewIfNeeded();
          if (viewport.width === 320) await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
          await reviewPlan.click();
          await waitForRouteSettled(page, '/dashboard/workout/review');
          await waitForWorkoutRouteAtTop(page, `${viewport.width}px recommended Review must keep the canonical chrome visible`);
          await assertCanonicalWorkoutChrome(page, 'Review Workout');
          await assertWorkoutSurface(page, theme);
          await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-recommended-review.png`);
          await currentWorkspace(page).getByRole('button', { name: 'Edit workout' }).click();
          await waitForWorkoutBuildAtTop(page);
          await assertCanonicalWorkoutChrome(page, 'Build Workout');
          await expect(currentWorkspace(page).getByText('Draft · Not started')).toBeVisible();
          await assertWorkoutSurface(page, theme);
          await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-build.png`);
          const reviewWorkout = currentWorkspace(page).getByRole('button', { name: 'Review workout' });
          await assertControlClearsBottomNav(page, reviewWorkout);
          await reviewWorkout.click();
          await waitForRouteSettled(page, '/dashboard/workout/review');
          await waitForWorkoutRouteAtTop(page, `${viewport.width}px Review must keep the canonical chrome visible`);
          await assertCanonicalWorkoutChrome(page, 'Review Workout');
          await assertWorkoutSurface(page, theme);
          await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-review.png`);
          await assertControlClearsBottomNav(page, currentWorkspace(page).getByRole('button', { name: 'Start workout' }));
        }
        if (viewport.width === 320 || viewport.width === 390) {
          for (const [route, title, slug] of [
            ['/dashboard/workout/history', 'History', 'history'],
            ['/dashboard/workout/stats', 'Stats', 'stats'],
            ['/dashboard/workout/form-check', 'Form Check', 'form-check'],
          ] as const) {
            await page.goto(route);
            await waitForRouteSettled(page, route);
            await waitForWorkoutRouteAtTop(page, `${title} support route must open at the top`);
            await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
            await assertCanonicalWorkoutChrome(page, title);
            await assertWorkoutSurface(page, theme);
            if (route === '/dashboard/workout/form-check' && viewport.width === 390) {
              await expect(page.getByText('Analyze your movement in real time. Choose an exercise, stand side-on, and record your repetitions to compare your angles with the reference.')).toBeVisible();
              await expect(page.getByText('Analiza tu movimiento', { exact: false })).toHaveCount(0);
            }
            if (route === '/dashboard/workout/history' && viewport.width === 320) {
              const historyCard = page.locator('[data-history-card]').first();
              await expect(historyCard).toBeVisible();
              const geometry = await historyCard.evaluate((card) => {
                const primary = card.querySelector('[data-history-primary]')?.getBoundingClientRect();
                const summary = card.querySelector('[data-history-summary]')?.getBoundingClientRect();
                return primary && summary ? {
                  primaryBottom: primary.bottom,
                  summaryTop: summary.top,
                  cardRight: card.getBoundingClientRect().right,
                  summaryRight: summary.right,
                } : null;
              });
              expect(geometry).not.toBeNull();
              expect(geometry!.summaryTop).toBeGreaterThanOrEqual(geometry!.primaryBottom);
              expect(geometry!.summaryRight).toBeLessThanOrEqual(geometry!.cardRight);
            }
            await captureWorkout(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-${slug}.png`, { atTop: true });
          }
        }
        assertNoPaidRequests();
      });
    }
  }
});
