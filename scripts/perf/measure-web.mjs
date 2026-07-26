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

function metricSummary(samples, reducer) {
  return Object.fromEntries(METRICS.map((metric) => {
    const values = finiteValues(samples, metric);
    return [metric, values.length === 0 ? null : reducer(values)];
  }));
}

export function sanitizeFailureUrl(value) {
  try {
    const url = new URL(value);
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
    consoleErrors: sanitizeConsoleErrors(sample.consoleErrors ?? []),
    networkErrors: sanitizeNetworkErrors(sample.networkErrors ?? []),
  }));

  return {
    url: sanitizeFailureUrl(url),
    viewport,
    samples: sanitizedSamples,
    median: metricSummary(sanitizedSamples, median),
    worst: metricSummary(sanitizedSamples, (values) => values.at(-1)),
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
      || shift.startTime - previousShift > CLS_SESSION_GAP_MS
      || shift.startTime - sessionStart > CLS_SESSION_MAX_MS;
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
  const failed = new Set();
  let transferredBytes = 0;

  return {
    loadingFinished({ requestId, encodedDataLength }) {
      if (completed.has(requestId) || cached.has(requestId) || failed.has(requestId)) return;
      completed.add(requestId);
      if (Number.isFinite(encodedDataLength) && encodedDataLength > 0) {
        transferredBytes += encodedDataLength;
      }
    },
    requestServedFromCache({ requestId }) {
      if (!completed.has(requestId) && !failed.has(requestId)) cached.add(requestId);
    },
    loadingFailed({ requestId }) {
      if (!completed.has(requestId) && !cached.has(requestId)) failed.add(requestId);
    },
    snapshot() {
      return {
        transferredBytes,
        completedCount: completed.size,
        cachedCount: cached.size,
        failedCount: failed.size,
      };
    },
  };
}

export async function waitForNetworkSettle({
  getLastActivityAt,
  now = Date.now,
  wait,
  quietMs = SETTLE_QUIET_MS,
  maxMs = MAX_SETTLE_MS,
}) {
  const startedAt = now();
  while (now() - startedAt < maxMs) {
    const quietFor = now() - getLastActivityAt();
    if (quietFor >= quietMs) return { reason: 'network_quiet', durationMs: now() - startedAt };
    const remainingQuiet = quietMs - quietFor;
    const remainingTotal = maxMs - (now() - startedAt);
    await wait(Math.max(1, Math.min(SETTLE_POLL_MS, remainingQuiet, remainingTotal)));
  }
  return { reason: 'max_settle_reached', durationMs: now() - startedAt };
}

export async function collectSample({ browser, url, viewport, now = Date.now }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  let cdp;
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
    const page = await context.newPage();
    cdp = await context.newCDPSession(page);
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
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (!isReadOnlyMethod(request.method())) {
        blockedRequestCount += 1;
        blockedReasons.set(request, `blocked_${request.method().toLowerCase()}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
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

    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await waitForNetworkSettle({
      getLastActivityAt: () => lastNetworkActivityAt,
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
    return {
      metrics: {
        ...observed,
        cls: calculateCls(observed.layoutShifts),
        requestCount,
        allowedRequestCount,
        blockedRequestCount,
        transferredBytes: transferSnapshot.transferredBytes,
      },
      valid: blockedRequestCount === 0,
      transferOutcomes: transferSnapshot,
      consoleErrors,
      networkErrors,
    };
  } finally {
    await cdp?.detach();
    await context.close();
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
