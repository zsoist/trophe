import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blockPaidRequests, loginAs, setTheme, type Role, type ThemeMode } from './helpers/auth';
import { assertMinimumTargets, assertNamedInteractiveControls, assertNoPageOverflow, assertTheme } from './helpers/accessibility';

const themes: ThemeMode[] = ['light', 'dark'];
const clientId = process.env.E2E_CLIENT_ID;
const testOrganizationId = process.env.E2E_TEST_ORG_ID;
const testOrganizationSlug = process.env.E2E_TEST_ORG_SLUG;

const clientRoutes = [
  ['/dashboard', 'dashboard'], ['/dashboard/log', 'meal log'], ['/dashboard/progress', 'progress'],
  ['/dashboard/profile', 'profile appearance'], ['/dashboard/workout', 'workout'], ['/dashboard/intake', 'intake'],
  ['/dashboard/messages', 'messages'], ['/dashboard/book', 'booking'], ['/dashboard/checkin', 'check-in'],
  ['/dashboard/supplements', 'supplements'],
] as const;
const coachRoutes = (id: string) => [
  ['/coach', 'roster search and filter'], [`/coach/client/${id}`, 'client detail'], [`/coach/client/${id}/plan`, 'client plan'],
  [`/coach/client/${id}/memory`, 'client memory'], ['/coach/inbox', 'inbox'], [`/coach/inbox/${id}`, 'thread'],
  ['/coach/calendar', 'calendar'], ['/coach/foods', 'foods'], ['/coach/habits', 'habits'], ['/coach/protocols', 'protocols'],
  ['/coach/templates', 'templates'], ['/coach/questionnaires', 'questionnaires'], ['/coach/invite', 'invite'],
] as const;
const adminRoutes = [['/admin/orgs', 'organizations'], ['/admin/costs', 'costs'], ['/super', 'overview']] as const;
const superTabs = ['OVERVIEW', 'COSTS', 'USERS', 'RUNS', 'DATA', 'AUDIT'] as const;

const routeStates: Record<string, RegExp> = {
  '/dashboard': /good (morning|afternoon|evening|night)|today/i,
  '/dashboard/log': /analyze a recipe|meals/i,
  '/dashboard/progress': /progress|customize/i,
  '/dashboard/profile': /profile|account|appearance/i,
  '/dashboard/workout': /workout|training/i,
  '/dashboard/intake': /question|goal/i,
  '/dashboard/messages': /message|coach/i,
  '/dashboard/book': /book|session|appointment/i,
  '/dashboard/checkin': /check.?in/i,
  '/dashboard/supplements': /supplement/i,
  '/coach': /client|roster/i,
  '/coach/inbox': /inbox|conversation|message/i,
  '/coach/calendar': /calendar/i,
  '/coach/foods': /food/i,
  '/coach/habits': /habit/i,
  '/coach/protocols': /protocol/i,
  '/coach/templates': /template/i,
  '/coach/questionnaires': /questionnaire/i,
  '/coach/invite': /invite/i,
  '/admin/orgs': /organization/i,
  '/admin/costs': /cost/i,
  '/super': /command center|overview/i,
};

test('DOM assertion helpers execute in the browser and reject a real unnamed control', async ({ page }) => {
  await page.setContent('<main><button aria-label="Save" style="width:44px;height:44px">Save</button></main>');
  await assertNamedInteractiveControls(page);
  await assertMinimumTargets(page, 44);
  await assertNoPageOverflow(page);
  await page.setContent('<main><button style="width:44px;height:44px"><svg aria-hidden="true"></svg></button></main>');
  await expect(assertNamedInteractiveControls(page)).rejects.toThrow('interactive controls without accessible names');
});

test('DOM assertion helpers use the enclosing label name and target for wrapped controls', async ({ page }) => {
  await page.setContent('<main><label style="display:inline-flex;width:44px;height:44px">Required<input type="checkbox"></label></main>');
  await assertNamedInteractiveControls(page);
  await assertMinimumTargets(page, 44);
});

async function prepare(page: Page, role: Role) {
  const assertNoPaidRequests = await blockPaidRequests(page);
  await loginAs(page, role);
  return assertNoPaidRequests;
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const dismissInstallPrompt = page.getByRole('button', { name: 'Dismiss install prompt' });
  if (await dismissInstallPrompt.isVisible()) await dismissInstallPrompt.click();
  await expect(page.locator('body')).not.toBeEmpty();
  const visible = await page.locator('body').evaluate((body) => {
    const rect = body.getBoundingClientRect();
    return { width: rect.width, height: rect.height, text: (body as HTMLElement).innerText.trim() };
  });
  expect(visible.width, 'screenshot would be blank or cropped horizontally').toBeGreaterThan(1);
  expect(visible.height, 'screenshot would be blank or cropped vertically').toBeGreaterThan(1);
  expect(visible.text, 'screenshot captured a loading-only or blank state').not.toMatch(/^(loading|loading…|please wait)[.!…\s]*$/i);
  await expect.poll(async () => page.locator('[data-loading-state], [data-loading-skeleton], .skeleton, .shimmer, .animate-pulse').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }).length), {
    message: 'screenshot captured visible loading, skeleton, shimmer, or placeholder surfaces',
    timeout: 15_000,
  }).toBe(0);
  await expect.poll(async () => page.getByText(/^\s*loading…?\s*$/i).evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }).length), {
    message: 'screenshot captured visible Loading text',
    timeout: 15_000,
  }).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('screenshots', `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function assertRoute(page: Page, route: string, theme: ThemeMode, testInfo: TestInfo, label: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.url(), `wrong route state for ${route}`).toContain(route);
  const expectedState = routeStates[route] ?? (route.includes('/coach/client/')
    ? route.endsWith('/plan')
      ? /plan editor|weekly meal plan|save plan/i
      : route.endsWith('/memory')
        ? /ai memory|memory/i
        : /assessment|coach notes|habit history/i
    : route.includes('/coach/inbox/')
      ? /send message|write a message|message/i
      : undefined);
  if (!expectedState) throw new Error(`missing expected route state contract for ${route} (${label})`);
  await expect(page.locator('main, [role="main"], body').filter({ hasText: expectedState }).first(), `route-specific state did not render for ${route}`).toBeVisible();
  if (route === '/coach') {
    await expect(page.getByPlaceholder('Search clients...'), 'coach roster search must render after loading').toBeVisible();
    await expect(page.locator('[data-loading-skeleton]'), 'coach roster cannot masquerade as a loaded route while skeletons render').toHaveCount(0);
  }
  if (route === '/dashboard/book') {
    await expect(page.getByText(/booking unlocks|your appointments|open slots|no open slots right now/i).first(), 'booking must reach a loaded route-specific state').toBeVisible();
  }
  if (route === '/dashboard/messages') {
    const loadedMessageState = page.getByText(/no coach assigned|no messages yet/i)
      .or(page.getByRole('textbox', { name: /message/i }));
    await expect(loadedMessageState.first(), 'messages must reach a loaded route-specific state').toBeVisible();
  }
  if (route === '/dashboard/progress') {
    await expect(page.getByRole('button', { name: /customize/i }), 'progress must render its loaded customization control').toBeVisible();
  }
  if (route === '/admin/costs') {
    await expect(page.getByRole('heading', { name: 'API Cost Tracker' }), 'costs must render its route heading').toBeVisible();
    await expect(page.getByRole('status'), 'costs must finish loading before route assertions and screenshots').toHaveCount(0);
    await expect(
      page.getByText(/no api usage data yet/i).or(page.getByText('Total cost', { exact: true })).first(),
      'costs must render an empty or populated post-load state',
    ).toBeVisible();
  }
  await assertTheme(page, theme);
  await assertNamedInteractiveControls(page);
  await assertMinimumTargets(page, 44);
  await assertNoPageOverflow(page);
  await capture(page, testInfo, `${theme}-${label.replaceAll(/[^a-z0-9]+/gi, '-')}`);
}

test.describe('public theme, motion, and stale-session recovery', () => {
  for (const mode of themes) {
    test(`public landing honors saved ${mode} theme and accessible controls`, async ({ page }, testInfo) => {
      const assertNoPaidRequests = await blockPaidRequests(page);
      await page.addInitScript((theme) => localStorage.setItem('trophe_theme_mode', theme), mode);
      await page.goto('/');
      await assertTheme(page, mode);
      await assertNamedInteractiveControls(page);
      await assertMinimumTargets(page, 44);
      await assertNoPageOverflow(page);
      await capture(page, testInfo, `public-${mode}`);
      assertNoPaidRequests();
    });
  }

  test('reduced-motion suppresses the theme icon animation', async ({ page }) => {
    const assertNoPaidRequests = await blockPaidRequests(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    const themeIcon = page.locator('[data-theme-icon]').first();
    await expect(themeIcon).toBeVisible();
    const themeDurations = await themeIcon.evaluate((element) => {
      const style = getComputedStyle(element);
      return { duration: style.animationDuration, transition: style.transitionDuration };
    });
    expect(parseFloat(themeDurations.duration), 'reduced-motion theme icon animation must be effectively zero').toBeLessThanOrEqual(0.001);
    expect(parseFloat(themeDurations.transition), 'reduced-motion theme icon transition must be effectively zero').toBeLessThanOrEqual(0.001);
    assertNoPaidRequests();
  });

  test('invalid refresh state shows login without a reload loop and valid local sign-in remains possible', async ({ page }) => {
    test.skip(
      !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
      'The disposable local-auth runner must supply client credentials for the sign-in recovery check',
    );
    const assertNoPaidRequests = await blockPaidRequests(page);
    let documentRequests = 0;
    page.on('request', (request) => { if (request.isNavigationRequest() && request.resourceType() === 'document') documentRequests += 1; });
    await page.addInitScript(() => {
      localStorage.setItem('trophe_theme_mode', 'dark');
      localStorage.setItem('sb-localhost-auth-token', '{not-a-session}');
    });
    await page.goto('/login');
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    expect(documentRequests).toBeLessThanOrEqual(2);
    await loginAs(page, 'client');
    await expect(page).not.toHaveURL(/\/login/);
    assertNoPaidRequests();
  });
});

test.describe('authenticated role route matrix', () => {
  test.skip(!clientId, 'The disposable local-auth runner must supply E2E_CLIENT_ID for real coach detail routes');

  test('reduced-motion stops a rendered dashboard skeleton sheen', async ({ page }) => {
    const assertNoPaidRequests = await prepare(page, 'client');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/rest/v1/**', (route) => route.abort());
    await page.goto('/dashboard');
    const skeleton = page.locator('.skeleton').first();
    await expect(skeleton).toBeVisible();
    const duration = await skeleton.evaluate((element) => getComputedStyle(element, '::after').animationDuration);
    expect(parseFloat(duration), 'reduced-motion skeleton animation must be effectively zero').toBeLessThanOrEqual(0.001);
    assertNoPaidRequests();
  });

  for (const mode of themes) {
    test(`reduced motion removes recipe modal movement in ${mode}`, async ({ page }) => {
      const assertNoPaidRequests = await prepare(page, 'client');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, mode);
      await page.goto('/dashboard/log');
      await page.getByRole('button', { name: /analyze a recipe/i }).click();
      const modal = page.getByRole('dialog', { name: 'Analyze recipe' });
      await expect(modal).toBeVisible();
      expect(parseFloat(await modal.evaluate((element) => getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.001);
      await page.keyboard.press('Escape');

      assertNoPaidRequests();
    });

    test(`reduced motion removes customization sheet movement in ${mode}`, async ({ page }) => {
      const assertNoPaidRequests = await prepare(page, 'client');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, mode);
      await page.goto('/dashboard/progress');
      await page.getByRole('button', { name: /customize/i }).click();
      const sheet = page.getByRole('dialog', { name: /customize/i });
      await expect(sheet).toBeVisible();
      expect(parseFloat(await sheet.evaluate((element) => getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.001);
      assertNoPaidRequests();
    });

    test(`client routes render in ${mode} at the project viewport`, async ({ page }, testInfo) => {
      const assertNoPaidRequests = await prepare(page, 'client');
      await setTheme(page, mode);
      for (const [route, label] of clientRoutes) {
        await assertRoute(page, route, mode, testInfo, `client-${label}`);
        if (route === '/dashboard/log') {
          await page.getByRole('button', { name: /analyze a recipe/i }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await assertNamedInteractiveControls(page);
          await assertMinimumTargets(page, 44);
          await capture(page, testInfo, `client-food-modal-${mode}`);
          await page.keyboard.press('Escape');
        }
      }
      assertNoPaidRequests();
    });

    test(`client 200% reflow equivalent keeps primary controls reachable in ${mode}`, async ({ page }, testInfo) => {
      const assertNoPaidRequests = await prepare(page, 'client');
      await page.setViewportSize({ width: 640, height: 900 });
      await setTheme(page, mode);
      await assertRoute(page, '/dashboard/log', mode, testInfo, `client-log-640-${mode}`);
      await expect(page.locator('button, a[href]').filter({ hasText: /add|log|food/i }).first()).toBeVisible();
      assertNoPaidRequests();
    });

    test(`coach routes render in ${mode}, including detail, plan, memory, and thread`, async ({ page }, testInfo) => {
      const assertNoPaidRequests = await prepare(page, 'coach');
      await setTheme(page, mode);
      for (const [route, label] of coachRoutes(clientId!)) await assertRoute(page, route, mode, testInfo, `coach-${label}`);
      await page.goto(`/coach/inbox/${clientId!}`);
      await expect(page.getByRole('textbox').or(page.getByText(/client|conversation/i)).first(), 'coach thread must render a conversation state, not a dashboard fallback').toBeVisible();
      await page.goto('/coach');
      const more = page.getByRole('button', { name: /more/i });
      await expect(more.first()).toBeVisible();
      await more.first().click();
      await expect(page.getByRole('link', { name: /calendar|foods|habits/i }).first()).toBeVisible();
      await page.goto(`/coach/client/${clientId!}`);
      const trayOverlap = await page.locator('[data-coach-action-tray]').evaluate((tray) => {
        const root = tray.closest('[data-coach-workspace-root]') as HTMLElement;
        const rect = tray.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        return { trayBottom: rect.bottom, rootBottom: rootRect.bottom, paddingBottom: Number.parseFloat(getComputedStyle(root).paddingBottom) };
      });
      expect(trayOverlap.rootBottom - trayOverlap.trayBottom + trayOverlap.paddingBottom, 'coach action tray overlaps final route content').toBeGreaterThanOrEqual(0);
      assertNoPaidRequests();
    });

    test(`admin and super-admin operations render in ${mode}`, async ({ page }, testInfo) => {
      const assertNoPaidRequests = await prepare(page, 'admin');
      await setTheme(page, mode);
      for (const [route, label] of adminRoutes) await assertRoute(page, route, mode, testInfo, `admin-${label}`);
      await page.goto('/admin/orgs');
      expect(testOrganizationId, 'local runner must provision the populated organization fixture').toBeTruthy();
      expect(testOrganizationSlug, 'local runner must provide the populated organization fixture slug').toBeTruthy();
      if (testInfo.project.name === 'desktop-chromium') {
        const desktopOrganizationRow = page.locator('table tbody tr').filter({ hasText: testOrganizationSlug! });
        await expect(desktopOrganizationRow, 'desktop organizations table must contain the current fixture slug').toHaveCount(1);
        await expect(desktopOrganizationRow).toBeVisible();
      } else {
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileOrganizationCard = page.locator('[data-admin-org-mobile-cards] article').filter({ hasText: testOrganizationSlug! });
        await expect(mobileOrganizationCard, 'mobile organization cards must contain the current fixture slug').toHaveCount(1);
        await expect(mobileOrganizationCard).toBeVisible();
      }
      await page.goto('/super');
      await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'OVERVIEW' })).toBeVisible();
      for (const tab of superTabs) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await assertNoPageOverflow(page);
        await capture(page, testInfo, `super-${mode}-${tab.toLowerCase()}`);
      }
      assertNoPaidRequests();
    });
  }
});
