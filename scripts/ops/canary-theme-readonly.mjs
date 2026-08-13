#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PAID_PROVIDER_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.voyageai.com',
  'api.deepseek.com',
  'api.mistral.ai',
]);
const PAID_APP_PATHS = new Set([
  '/api/food/parse',
  '/api/food/recipe-analyze',
  '/api/coach/shopping-list',
  '/api/coach/meal-plan-macros',
]);
const ROLE_CONFIG = [
  ['client', '/dashboard', /good (morning|afternoon|evening|night)|today/i],
  ['coach', '/coach', /client|roster/i],
  ['admin', '/admin/orgs', /organization/i],
  ['super', '/super', /command center|overview/i],
];

function validBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PLAYWRIGHT_BASE_URL must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PLAYWRIGHT_BASE_URL must be an absolute credential-free http(s) URL');
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

function roleEnvName(role) {
  return `THEME_CANARY_${role.toUpperCase()}`;
}

/** @param {Record<string, string | undefined>} env */
export function parseCanaryConfig(env = process.env) {
  const baseUrl = validBaseUrl(env.PLAYWRIGHT_BASE_URL ?? env.BASE_URL ?? 'https://trophe.app');
  const supabaseAuthOrigin = validBaseUrl(env.THEME_CANARY_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const roles = {};
  for (const [role, route, loadedState] of ROLE_CONFIG) {
    const prefix = roleEnvName(role);
    const email = env[`${prefix}_EMAIL`];
    const password = env[`${prefix}_PASSWORD`];
    if (!email) throw new Error(`${prefix}_EMAIL is required`);
    if (!password) throw new Error(`${prefix}_PASSWORD is required`);
    roles[role] = { route, loadedState, email, password };
  }
  return { baseUrl, supabaseAuthOrigin: new URL(supabaseAuthOrigin).origin, roles };
}

export function isPaidProviderRoute(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return PAID_PROVIDER_HOSTS.has(url.hostname)
    || url.pathname.startsWith('/api/ai/')
    || PAID_APP_PATHS.has(pathname);
}

export function isAllowedAuthenticationRequest(method, rawUrl, supabaseAuthOrigin) {
  try {
    const url = new URL(rawUrl);
    return method === 'POST'
      && url.origin === supabaseAuthOrigin
      && url.pathname === '/auth/v1/token';
  } catch {
    return false;
  }
}

function isReadOnlyMethod(method) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function pageUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function assertPageHealth(page, route) {
  const health = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
    };
    const controlName = (element) => element.getAttribute('aria-label')?.trim()
      || element.getAttribute('title')?.trim()
      || element.innerText?.trim()
      || element.textContent?.trim()
      || element.getAttribute('placeholder')?.trim()
      || '';
    const controls = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"]'))
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: controlName(element), left: rect.left, right: rect.right };
      });
    return {
      bodyWidth: document.body.getBoundingClientRect().width,
      bodyHeight: document.body.getBoundingClientRect().height,
      bodyText: document.body.innerText.trim(),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      unnamedControls: controls.filter((control) => !control.name).length,
      offscreenControls: controls.filter((control) => control.left < -1 || control.right > window.innerWidth + 1).length,
    };
  });
  if (health.bodyWidth <= 1 || health.bodyHeight <= 1 || /^(loading|loading…|please wait)[.!…\s]*$/i.test(health.bodyText)) {
    throw new Error(`${route} rendered a blank or loading-only page`);
  }
  if (health.overflow > 1) throw new Error(`${route} has ${health.overflow}px horizontal overflow`);
  if (health.unnamedControls > 0) throw new Error(`${route} has ${health.unnamedControls} unnamed interactive controls`);
  if (health.offscreenControls > 0) throw new Error(`${route} has ${health.offscreenControls} offscreen interactive controls`);
}

async function assertRoleRoute(page, role) {
  const finalPathname = new URL(page.url()).pathname;
  if (finalPathname !== role.route) {
    throw new Error(`${role.route} ended at ${finalPathname || '/'}`);
  }
  await page.getByText(role.loadedState).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function toggleAndAssertPersistence(page, route) {
  const observedModes = new Set();
  for (let index = 0; index < 2; index += 1) {
    const previousMode = await page.locator('html').evaluate((element) => element.classList.contains('light') ? 'light' : 'dark');
    const expectedMode = previousMode === 'light' ? 'dark' : 'light';
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    await page.waitForFunction((mode) => document.documentElement.classList.contains(mode), expectedMode);
    const currentMode = await page.locator('html').evaluate((element) => element.classList.contains('light') ? 'light' : 'dark');
    if (currentMode === previousMode) throw new Error(`${route} theme toggle did not change mode`);
    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    const persistedMode = await page.locator('html').evaluate((element) => element.classList.contains('light') ? 'light' : 'dark');
    if (persistedMode !== currentMode) throw new Error(`${route} did not persist ${currentMode} after reload`);
    observedModes.add(currentMode);
  }
  if (!observedModes.has('light') || !observedModes.has('dark')) throw new Error(`${route} did not verify both theme modes`);
}

async function login(page, baseUrl, role) {
  await page.goto(pageUrl(baseUrl, '/login'), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByPlaceholder('Email').fill(role.email);
  await page.getByPlaceholder('Password').fill(role.password);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

async function visitRole({ browser, baseUrl, supabaseAuthOrigin, name, role }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const failures = [];
  let authenticationAllowed = true;
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console error on ${name}`);
  });
  page.on('pageerror', () => failures.push(`page error on ${name}`));
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (isPaidProviderRoute(request.url())) {
      failures.push(`paid route blocked on ${name}`);
      await route.abort('blockedbyclient');
      return;
    }
    if (!isReadOnlyMethod(request.method()) && !(authenticationAllowed
      && isAllowedAuthenticationRequest(request.method(), request.url(), supabaseAuthOrigin))) {
      failures.push(`non-read-only ${request.method()} blocked on ${name}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  try {
    await login(page, baseUrl, role);
    authenticationAllowed = false;
    await page.goto(pageUrl(baseUrl, role.route), { waitUntil: 'load', timeout: 30_000 });
    await assertRoleRoute(page, role);
    await assertPageHealth(page, role.route);
    await toggleAndAssertPersistence(page, role.route);
    await assertRoleRoute(page, role);
    await assertPageHealth(page, role.route);
    if (failures.length > 0) throw new Error(failures.join('; '));
  } finally {
    await context.close();
  }
}

export async function runCanary(config = parseCanaryConfig()) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name] of ROLE_CONFIG) {
      await visitRole({ browser, baseUrl: config.baseUrl, supabaseAuthOrigin: config.supabaseAuthOrigin, name, role: config.roles[name] });
    }
  } finally {
    await browser.close();
  }
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executedDirectly) {
  runCanary().then(() => {
    process.stdout.write('canary:theme PASS - read-only role and theme checks green\n');
  }).catch((error) => {
    process.stderr.write(`canary:theme FAIL - ${error.message}\n`);
    process.exitCode = 1;
  });
}
