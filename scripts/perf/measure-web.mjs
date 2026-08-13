#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
export const SETTLE_QUIET_MS = 1_000;
export const MAX_SETTLE_MS = 5_000;
export const THEME_TOGGLE_COUNT = 20;
export const MAX_THEME_NAVIGATION_REGRESSION_RATIO = 0.05;

const METRICS = [
  'ttfb',
  'fcp',
  'lcp',
  'cls',
  'load',
  'requestCount',
  'transferredBytes',
  'longTasks',
];
const MAX_SAMPLES = 10;
const SETTLE_POLL_MS = 100;
const CLS_SESSION_GAP_MS = 1_000;
const CLS_SESSION_MAX_MS = 5_000;
const MAX_ERROR_EVENTS_PER_SAMPLE = 50;
const OUTPUT_PATTERN = /^docs\/quality\/performance-[a-z0-9][a-z0-9-]*\.json$/;

function finiteValues(samples, metric) {
  return samples
    .map((sample) => sample.metrics?.[metric])
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function median(values) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

export function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

export function summarizeNavigationDistribution(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Navigation samples must be finite positive durations');
  }
  return { medianMs: median(values), p95Ms: percentile(values, 95) };
}

/**
 * Converts one route's twenty CSS-only toggle observations into an auditable
 * release gate. The counter values are collected independently of timing so a
 * fast toggle cannot hide a route reload or data-provider side effect.
 */
export function calculateThemePerformanceReport({
  route,
  baselineNavigationMs,
  postToggleNavigationMs = baselineNavigationMs,
  toggleDurationsMs,
  navigationCount,
  supabaseRefetchCount,
  providerRemountCount,
}) {
  if (!Array.isArray(toggleDurationsMs) || toggleDurationsMs.length !== THEME_TOGGLE_COUNT) {
    throw new Error(`Theme measurement requires exactly ${THEME_TOGGLE_COUNT} toggles`);
  }
  const baselineSamples = Array.isArray(baselineNavigationMs) ? baselineNavigationMs : [baselineNavigationMs];
  const postToggleSamples = Array.isArray(postToggleNavigationMs) ? postToggleNavigationMs : [postToggleNavigationMs];
  const baselineNavigation = summarizeNavigationDistribution(baselineSamples);
  const postToggleNavigation = summarizeNavigationDistribution(postToggleSamples);
  const sortedDurations = [...toggleDurationsMs].sort((left, right) => left - right);
  if (sortedDurations.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Theme toggle durations must be finite non-negative numbers');
  }
  const navigationRegressionRatio = (postToggleNavigation.medianMs - baselineNavigation.medianMs) / baselineNavigation.medianMs;
  const navigationP95RegressionRatio = (postToggleNavigation.p95Ms - baselineNavigation.p95Ms) / baselineNavigation.p95Ms;
  const failures = [];
  if (navigationCount !== 0) failures.push('navigation_detected');
  if (supabaseRefetchCount !== 0) failures.push('supabase_refetch_detected');
  if (providerRemountCount !== 0) failures.push('provider_remount_detected');
  if (navigationRegressionRatio > MAX_THEME_NAVIGATION_REGRESSION_RATIO
    || navigationP95RegressionRatio > MAX_THEME_NAVIGATION_REGRESSION_RATIO) {
    failures.push('navigation_regression_exceeded');
  }

  return {
    route,
    toggleCount: toggleDurationsMs.length,
    medianMs: median(sortedDurations),
    p95Ms: percentile(sortedDurations, 95),
    baselineNavigation,
    postToggleNavigation,
    baselineNavigationMs: baselineNavigation.medianMs,
    navigationRegressionMs: postToggleNavigation.medianMs,
    navigationRegressionRatio,
    navigationP95RegressionRatio,
    navigationRegressionMeasurement: 'separate_page_reload_excluded_from_toggle_navigation_count',
    navigationCount,
    supabaseRefetchCount,
    providerRemountCount,
    providerRemountDetection: 'document_element_mount_counter',
    failures,
    ok: failures.length === 0,
  };
}

function metricSummary(samples, reducer) {
  return Object.fromEntries(METRICS.map((metric) => {
    const values = finiteValues(samples, metric);
    return [metric, values.length === 0 ? null : reducer(values)];
  }));
}

export function sanitizeFailureUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'non-http-url';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'invalid-url';
  }
}

function sanitizeConsoleErrors(errors) {
  return errors.slice(0, MAX_ERROR_EVENTS_PER_SAMPLE).map(() => ({ category: 'console_error' }));
}

function sanitizeNetworkErrors(errors) {
  return errors.slice(0, MAX_ERROR_EVENTS_PER_SAMPLE).map((error) => ({
    url: sanitizeFailureUrl(error.url),
    reason: typeof error.reason === 'string' && /^[a-z0-9_]{1,64}$/.test(error.reason)
      ? error.reason
      : 'request_failed',
  }));
}

export function calculateReport({ url, viewport, samples }) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('At least one measurement sample is required');
  }

  const sanitizedSamples = samples.map((sample) => ({
    ...sample,
    invalidReasons: (sample.invalidReasons ?? [])
      .filter((reason) => typeof reason === 'string' && /^[a-z0-9_]{1,64}$/.test(reason))
      .slice(0, MAX_ERROR_EVENTS_PER_SAMPLE),
    consoleErrors: sanitizeConsoleErrors(sample.consoleErrors ?? []),
    networkErrors: sanitizeNetworkErrors(sample.networkErrors ?? []),
  }));
  const validSamples = sanitizedSamples.filter((sample) => sample.valid !== false);
  const invalidSamples = sanitizedSamples.filter((sample) => sample.valid === false);
  const invalidReasons = [...new Set(invalidSamples.flatMap((sample) => sample.invalidReasons))];

  return {
    url: sanitizeFailureUrl(url),
    viewport,
    samples: sanitizedSamples,
    valid: validSamples.length > 0 && invalidSamples.length === 0,
    validSampleCount: validSamples.length,
    invalidSampleCount: invalidSamples.length,
    invalidReasons,
    median: validSamples.length > 0 ? metricSummary(validSamples, median) : null,
    worst: validSamples.length > 0 ? metricSummary(validSamples, (values) => values.at(-1)) : null,
    consoleErrors: sanitizedSamples.flatMap((sample) => sample.consoleErrors ?? []),
    networkErrors: sanitizedSamples.flatMap((sample) => sample.networkErrors),
  };
}

function validatedUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('url must be a valid absolute http or https URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('url must use http or https');
  }
  if (url.username || url.password) {
    throw new Error('url must not include credentials');
  }

  url.search = '';
  url.hash = '';
  return url.toString();
}

function defaultOutputFor(url) {
  const target = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `docs/quality/performance-${target || 'target'}.json`;
}

function validatedOutput(rawOutput) {
  if (!OUTPUT_PATTERN.test(rawOutput)) {
    throw new Error('output must be a docs/quality/performance-<target>.json path');
  }
  return rawOutput;
}

function validatedSamples(rawSamples) {
  const samples = Number(rawSamples);
  if (!Number.isInteger(samples) || samples < 1 || samples > MAX_SAMPLES) {
    throw new Error(`samples must be an integer between 1 and ${MAX_SAMPLES}`);
  }
  return samples;
}

export function parseCliArgs(argv) {
  let rawUrl;
  let rawSamples = '3';
  let rawOutput;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!['--url', '--samples', '--output'].includes(argument) || value === undefined || value.startsWith('--')) {
      throw new Error('usage: perf:measure --url <http(s) URL> [--samples 1-10] [--output docs/quality/performance-<target>.json]');
    }
    if (argument === '--url') rawUrl = value;
    if (argument === '--samples') rawSamples = value;
    if (argument === '--output') rawOutput = value;
    index += 1;
  }

  const url = validatedUrl(rawUrl);
  const samples = validatedSamples(rawSamples);

  return { url, samples, output: validatedOutput(rawOutput ?? defaultOutputFor(url)) };
}

function installMetricObservers() {
  window.__trophePerformance = { lcp: null, layoutShifts: [], longTasks: 0 };

  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) window.__trophePerformance.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) {
      window.__trophePerformance.layoutShifts.push({
        startTime: entry.startTime,
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });

  new PerformanceObserver((entries) => {
    window.__trophePerformance.longTasks += entries.getEntries().length;
  }).observe({ type: 'longtask', buffered: true });
}

async function defaultBrowserFactory() {
  const { chromium } = await import('@playwright/test');
  return chromium.launch({ headless: true });
}

const THEME_ROUTES = [
  { name: 'login', route: '/login' },
  { name: 'dashboard', route: '/dashboard', credentialPrefix: 'CLIENT' },
  { name: 'coach', route: '/coach', credentialPrefix: 'COACH' },
  { name: 'super', route: '/super', credentialPrefix: 'SUPER' },
];

function joinUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

function navigationDuration(page) {
  return page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    return entry ? entry.loadEventEnd - entry.startTime : performance.now();
  });
}

async function navigationDistribution(page, sampleCount = 5) {
  const samples = [await navigationDuration(page)];
  for (let index = 1; index < sampleCount; index += 1) {
    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    samples.push(await navigationDuration(page));
  }
  return samples;
}

function providerMountCount(page) {
  return page.evaluate(() => {
    const count = Number(document.documentElement.dataset.tropheThemeProviderMounts ?? '0');
    if (!Number.isInteger(count) || count < 1) throw new Error('Theme provider mount signal is unavailable');
    return count;
  });
}

function toggleInPage(page) {
  return page.evaluate(async () => {
    const toggle = document.querySelector('button[aria-label="Toggle color theme"]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error('Theme toggle is unavailable');
    const root = document.documentElement;
    const before = root.classList.contains('light') ? 'light' : 'dark';
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error('Theme class did not change within 1000ms'));
      }, 1_000);
      const observer = new MutationObserver(() => {
        const current = root.classList.contains('light') ? 'light' : 'dark';
        if (current !== before) {
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve({ mode: current, durationMs: performance.now() - startedAt });
        }
      });
      observer.observe(root, { attributes: true, attributeFilter: ['class'] });
      toggle.click();
    });
  });
}

function isSupabaseRequest(url) {
  const parsed = new URL(url);
  return parsed.hostname.includes('supabase') || parsed.pathname.startsWith('/rest/v1/');
}

function themeCredential(credentialPrefix, env) {
  const email = env[`THEME_PERF_${credentialPrefix}_EMAIL`] ?? env[`E2E_${credentialPrefix}_EMAIL`];
  const password = env[`THEME_PERF_${credentialPrefix}_PASSWORD`] ?? env[`E2E_${credentialPrefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Theme performance measurement requires THEME_PERF_${credentialPrefix}_EMAIL and THEME_PERF_${credentialPrefix}_PASSWORD`);
  }
  return { email, password };
}

async function loginForThemeMeasurement(page, baseUrl, credentialPrefix, env) {
  const { email, password } = themeCredential(credentialPrefix, env);
  await page.goto(joinUrl(baseUrl, '/login'), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Measure one authenticated or public route without allowing the toggle to navigate or fetch. */
/** @param {{ browser: any, baseUrl: string, route: string, credentialPrefix?: string, env?: Record<string, string | undefined> }} options */
export async function measureThemeRoute({ browser, baseUrl, route, credentialPrefix, env = process.env }) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    if (credentialPrefix) await loginForThemeMeasurement(page, baseUrl, credentialPrefix, env);
    let toggleNavigationCount = 0;
    let supabaseRefetchCount = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.resourceType() === 'document') toggleNavigationCount += 1;
      if (isSupabaseRequest(request.url())) supabaseRefetchCount += 1;
    });
    await page.goto(joinUrl(baseUrl, route), { waitUntil: 'load', timeout: 30_000 });
    const baselineNavigationMs = await navigationDistribution(page);
    const initialProviderMountCount = await providerMountCount(page);
    toggleNavigationCount = 0;
    supabaseRefetchCount = 0;

    const toggleDurationsMs = [];
    for (let index = 0; index < THEME_TOGGLE_COUNT; index += 1) {
      toggleDurationsMs.push((await toggleInPage(page)).durationMs);
    }
    const providerRemountCount = (await providerMountCount(page)) - initialProviderMountCount;

    const toggleRequestCounts = {
      navigationCount: toggleNavigationCount,
      supabaseRefetchCount,
    };

    const postToggleNavigationMs = await navigationDistribution(page);
    const result = calculateThemePerformanceReport({
      route,
      baselineNavigationMs,
      postToggleNavigationMs,
      toggleDurationsMs,
      ...toggleRequestCounts,
      providerRemountCount,
    });
    if (!result.ok) {
      throw new Error(
        `Theme performance failure for ${route}: ${result.failures.join(', ')}; `
        + `baseline median=${result.baselineNavigation.medianMs}ms p95=${result.baselineNavigation.p95Ms}ms; `
        + `post-toggle median=${result.postToggleNavigation.medianMs}ms p95=${result.postToggleNavigation.p95Ms}ms`,
      );
    }
    return result;
  } finally {
    await context.close();
  }
}

/** @param {{ baseUrl?: string, browserFactory?: typeof defaultBrowserFactory, env?: Record<string, string | undefined> }} options */
export async function runThemeMeasurements({
  baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3300',
  browserFactory = defaultBrowserFactory,
  env = process.env,
} = {}) {
  const normalizedBaseUrl = validatedUrl(baseUrl);
  for (const { credentialPrefix } of THEME_ROUTES) {
    if (credentialPrefix) themeCredential(credentialPrefix, env);
  }
  const browser = await browserFactory();
  try {
    const routes = [];
    for (const config of THEME_ROUTES) {
      routes.push(await measureThemeRoute({ browser, baseUrl: normalizedBaseUrl, ...config, env }));
    }
    return { baseUrl: normalizedBaseUrl, routes };
  } finally {
    await browser.close();
  }
}

export function isReadOnlyMethod(method) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export function calculateCls(entries) {
  const shifts = entries
    .filter((entry) => !entry.hadRecentInput && Number.isFinite(entry.startTime) && Number.isFinite(entry.value))
    .sort((left, right) => left.startTime - right.startTime);
  let maximum = 0;
  let sessionValue = 0;
  let sessionStart = 0;
  let previousShift = 0;

  for (const shift of shifts) {
    const startsNewSession = sessionValue === 0
      || shift.startTime - previousShift >= CLS_SESSION_GAP_MS
      || shift.startTime - sessionStart >= CLS_SESSION_MAX_MS;
    if (startsNewSession) {
      sessionValue = shift.value;
      sessionStart = shift.startTime;
    } else {
      sessionValue += shift.value;
    }
    previousShift = shift.startTime;
    maximum = Math.max(maximum, sessionValue);
  }

  return maximum;
}

export function createTransferAccumulator() {
  const completed = new Set();
  const cached = new Set();
  const terminalCached = new Set();
  const failed = new Set();
  const inFlight = new Map();
  let transferredBytes = 0;

  const activeRequest = (requestId) => {
    if (!inFlight.has(requestId)) {
      inFlight.set(requestId, { partialBytes: 0, servedFromCache: false });
    }
    return inFlight.get(requestId);
  };

  const addTerminalBytes = (requestId, terminalBytes = 0) => {
    const request = inFlight.get(requestId);
    const partialBytes = request?.partialBytes ?? 0;
    transferredBytes += Math.max(partialBytes, Number.isFinite(terminalBytes) ? terminalBytes : 0);
  };

  return {
    /** @param {{ requestId: string, redirectResponse?: { encodedDataLength?: number } }} event */
    requestWillBeSent({ requestId, redirectResponse }) {
      if (completed.has(requestId) || terminalCached.has(requestId) || failed.has(requestId)) return;
      if (redirectResponse) {
        const request = activeRequest(requestId);
        if (!request.servedFromCache) {
          addTerminalBytes(requestId, redirectResponse.encodedDataLength);
        }
        inFlight.set(requestId, { partialBytes: 0, servedFromCache: false });
      } else {
        activeRequest(requestId);
      }
    },
    dataReceived({ requestId, encodedDataLength }) {
      if (completed.has(requestId) || terminalCached.has(requestId) || failed.has(requestId)) return;
      const request = activeRequest(requestId);
      if (request.servedFromCache) return;
      if (Number.isFinite(encodedDataLength) && encodedDataLength > 0) {
        request.partialBytes += encodedDataLength;
      }
    },
    loadingFinished({ requestId, encodedDataLength }) {
      if (completed.has(requestId) || terminalCached.has(requestId) || failed.has(requestId)) return;
      const request = activeRequest(requestId);
      if (request.servedFromCache) {
        terminalCached.add(requestId);
      } else {
        addTerminalBytes(requestId, encodedDataLength);
        completed.add(requestId);
      }
      inFlight.delete(requestId);
    },
    requestServedFromCache({ requestId }) {
      if (!completed.has(requestId) && !terminalCached.has(requestId) && !failed.has(requestId)) {
        const request = activeRequest(requestId);
        request.partialBytes = 0;
        request.servedFromCache = true;
        cached.add(requestId);
      }
    },
    loadingFailed({ requestId }) {
      if (!completed.has(requestId) && !terminalCached.has(requestId) && !failed.has(requestId)) {
        const request = activeRequest(requestId);
        if (!request.servedFromCache) {
          addTerminalBytes(requestId);
          failed.add(requestId);
        }
      }
      inFlight.delete(requestId);
    },
    snapshot() {
      return {
        transferredBytes,
        completedCount: completed.size,
        cachedCount: cached.size,
        failedCount: failed.size,
        inFlightCount: inFlight.size,
      };
    },
  };
}

export async function waitForNetworkSettle({
  getLastActivityAt,
  getInFlightCount = () => 0,
  now = Date.now,
  wait,
  quietMs = SETTLE_QUIET_MS,
  maxMs = MAX_SETTLE_MS,
}) {
  const startedAt = now();
  while (now() - startedAt < maxMs) {
    const quietFor = now() - getLastActivityAt();
    const remainingInFlightCount = getInFlightCount();
    if (remainingInFlightCount === 0 && quietFor >= quietMs) {
      return {
        reason: 'network_quiet',
        durationMs: now() - startedAt,
        remainingInFlightCount: 0,
      };
    }
    const remainingQuiet = quietMs - quietFor;
    const remainingTotal = maxMs - (now() - startedAt);
    await wait(Math.max(1, Math.min(
      SETTLE_POLL_MS,
      remainingInFlightCount === 0 ? remainingQuiet : SETTLE_POLL_MS,
      remainingTotal,
    )));
  }
  return {
    reason: 'max_settle_reached',
    durationMs: now() - startedAt,
    remainingInFlightCount: getInFlightCount(),
  };
}

export async function collectSample({ browser, url, viewport, now = Date.now }) {
  const normalizedUrl = validatedUrl(url);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
  });
  let cdp;
  let measurementError;
  const consoleErrors = [];
  const networkErrors = [];
  let requestCount = 0;
  let allowedRequestCount = 0;
  let blockedRequestCount = 0;
  let lastNetworkActivityAt = now();
  const blockedReasons = new WeakMap();
  const recordedFailures = new WeakSet();
  const transfers = createTransferAccumulator();
  const addNetworkError = (error) => {
    if (networkErrors.length < MAX_ERROR_EVENTS_PER_SAMPLE) {
      networkErrors.push(sanitizeNetworkErrors([error])[0]);
    }
  };

  try {
    if (typeof context.routeWebSocket !== 'function') {
      throw new Error('WebSocket blocking is unavailable; refusing unsafe measurement');
    }
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (!isReadOnlyMethod(request.method())) {
        blockedRequestCount += 1;
        blockedReasons.set(request, `blocked_${request.method().toLowerCase()}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await context.routeWebSocket('**/*', (webSocket) => {
      webSocket.close({ code: 1008, reason: 'read_only_measurement' });
    });
    const page = await context.newPage();
    cdp = await context.newCDPSession(page);
    cdp.on('Network.requestWillBeSent', (event) => {
      lastNetworkActivityAt = now();
      transfers.requestWillBeSent(event);
    });
    cdp.on('Network.dataReceived', (event) => {
      lastNetworkActivityAt = now();
      transfers.dataReceived(event);
    });
    cdp.on('Network.loadingFinished', (event) => {
      lastNetworkActivityAt = now();
      transfers.loadingFinished(event);
    });
    cdp.on('Network.requestServedFromCache', (event) => {
      lastNetworkActivityAt = now();
      transfers.requestServedFromCache(event);
    });
    cdp.on('Network.loadingFailed', (event) => {
      lastNetworkActivityAt = now();
      transfers.loadingFailed(event);
    });
    await cdp.send('Network.enable');
    await page.addInitScript(installMetricObservers);
    page.on('request', (request) => {
      requestCount += 1;
      lastNetworkActivityAt = now();
      if (isReadOnlyMethod(request.method())) allowedRequestCount += 1;
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && consoleErrors.length < MAX_ERROR_EVENTS_PER_SAMPLE) {
        consoleErrors.push({ category: 'console_error' });
      }
    });
    page.on('requestfailed', (request) => {
      lastNetworkActivityAt = now();
      if (recordedFailures.has(request)) return;
      recordedFailures.add(request);
      addNetworkError({
        url: request.url(),
        reason: blockedReasons.get(request) ?? 'request_failed',
      });
    });
    page.on('response', (response) => {
      lastNetworkActivityAt = now();
      if (response.status() >= 400) {
        addNetworkError({ url: response.url(), reason: `http_${response.status()}` });
      }
    });

    await page.goto(normalizedUrl, { waitUntil: 'load', timeout: 30_000 });
    const loadCompletedAt = now();
    const settlement = await waitForNetworkSettle({
      getLastActivityAt: () => Math.max(lastNetworkActivityAt, loadCompletedAt),
      getInFlightCount: () => transfers.snapshot().inFlightCount,
      now,
      wait: (milliseconds) => page.waitForTimeout(milliseconds),
    });
    const observed = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
      const recorded = window.__trophePerformance ?? { lcp: null, layoutShifts: [], longTasks: 0 };

      return {
        ttfb: navigation ? navigation.responseStart - navigation.startTime : null,
        fcp,
        lcp: recorded.lcp,
        layoutShifts: recorded.layoutShifts,
        load: navigation ? navigation.loadEventEnd - navigation.startTime : performance.now(),
        longTasks: recorded.longTasks,
      };
    });
    const transferSnapshot = transfers.snapshot();
    const invalidReasons = [];
    if (blockedRequestCount > 0) invalidReasons.push('blocked_requests');
    if (settlement.reason !== 'network_quiet') invalidReasons.push(settlement.reason);
    return {
      metrics: {
        ...observed,
        cls: calculateCls(observed.layoutShifts),
        requestCount,
        allowedRequestCount,
        blockedRequestCount,
        transferredBytes: transferSnapshot.transferredBytes,
      },
      valid: invalidReasons.length === 0,
      invalidReasons,
      settlement,
      transferOutcomes: transferSnapshot,
      consoleErrors,
      networkErrors,
    };
  } catch (error) {
    measurementError = error;
    throw error;
  } finally {
    let cleanupError;
    try {
      await cdp?.detach();
    } catch (error) {
      cleanupError = error;
    }
    try {
      await context.close();
    } catch (error) {
      cleanupError ??= error;
    }
    if (!measurementError && cleanupError) throw cleanupError;
  }
}

export async function measureUrl({ url, viewport, samples, browserFactory = defaultBrowserFactory }) {
  const normalizedUrl = validatedUrl(url);
  const sampleCount = validatedSamples(samples);
  const browser = await browserFactory();
  try {
    const collected = [];
    for (let index = 0; index < sampleCount; index += 1) {
      collected.push(await collectSample({ browser, url: normalizedUrl, viewport }));
    }
    return calculateReport({ url: normalizedUrl, viewport, samples: collected });
  } finally {
    await browser.close();
  }
}

export async function runMeasurements({ url, samples, browserFactory = defaultBrowserFactory }) {
  const normalizedUrl = validatedUrl(url);
  const sampleCount = validatedSamples(samples);
  const reports = [];
  for (const viewport of VIEWPORTS) {
    reports.push(await measureUrl({ url: normalizedUrl, viewport, samples: sampleCount, browserFactory }));
  }
  return { url: normalizedUrl, samples: sampleCount, reports };
}

export async function writeReport(output, report) {
  const validatedPath = validatedOutput(output);
  const absoluteOutput = resolve(validatedPath);
  const qualityRoot = resolve('docs/quality');
  if (!absoluteOutput.startsWith(`${qualityRoot}/`)) {
    throw new Error('output must remain inside docs/quality');
  }
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--theme') {
    if (argv.length > 1) throw new Error('usage: perf:measure [--theme] or perf:measure --url <http(s) URL> [--samples 1-10] [--output docs/quality/performance-<target>.json]');
    const report = await runThemeMeasurements();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  }
  const options = parseCliArgs(argv);
  const report = await runMeasurements(options);
  await writeReport(options.output, report);
  return report;
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
