#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

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

export function calculateReport({ url, viewport, samples }) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('At least one measurement sample is required');
  }

  const sanitizedSamples = samples.map((sample) => ({
    ...sample,
    networkErrors: (sample.networkErrors ?? []).map((error) => ({
      ...error,
      url: sanitizeFailureUrl(error.url),
    })),
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
  const samples = Number(rawSamples);
  if (!Number.isInteger(samples) || samples < 1 || samples > MAX_SAMPLES) {
    throw new Error(`samples must be an integer between 1 and ${MAX_SAMPLES}`);
  }

  return { url, samples, output: validatedOutput(rawOutput ?? defaultOutputFor(url)) };
}

function installMetricObservers() {
  window.__trophePerformance = { lcp: null, cls: 0, longTasks: 0 };

  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) window.__trophePerformance.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) {
      if (!entry.hadRecentInput) window.__trophePerformance.cls += entry.value;
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
  return method === 'GET' || method === 'HEAD';
}

async function collectSample({ browser, url, viewport }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];
  let requestCount = 0;

  await page.addInitScript(installMetricObservers);
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!isReadOnlyMethod(request.method())) {
      networkErrors.push({ url: request.url(), reason: `blocked_${request.method().toLowerCase()}` });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  page.on('request', (request) => {
    if (isReadOnlyMethod(request.method())) requestCount += 1;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ message: message.text() });
  });
  page.on('requestfailed', (request) => {
    networkErrors.push({ url: request.url(), reason: request.failure()?.errorText ?? 'request_failed' });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      networkErrors.push({ url: response.url(), reason: `http_${response.status()}` });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
      const resourceBytes = performance.getEntriesByType('resource')
        .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
      const recorded = window.__trophePerformance ?? { lcp: null, cls: 0, longTasks: 0 };

      return {
        ttfb: navigation ? navigation.responseStart - navigation.startTime : null,
        fcp,
        lcp: recorded.lcp,
        cls: recorded.cls,
        load: navigation ? navigation.loadEventEnd - navigation.startTime : performance.now(),
        transferredBytes: resourceBytes + (navigation?.transferSize ?? 0),
        longTasks: recorded.longTasks,
      };
    });
    return { metrics: { ...metrics, requestCount }, consoleErrors, networkErrors };
  } finally {
    await context.close();
  }
}

export async function measureUrl({ url, viewport, samples, browserFactory = defaultBrowserFactory }) {
  const browser = await browserFactory();
  try {
    const collected = [];
    for (let index = 0; index < samples; index += 1) {
      collected.push(await collectSample({ browser, url, viewport }));
    }
    return calculateReport({ url, viewport, samples: collected });
  } finally {
    await browser.close();
  }
}

export async function runMeasurements({ url, samples, browserFactory = defaultBrowserFactory }) {
  const reports = [];
  for (const viewport of VIEWPORTS) {
    reports.push(await measureUrl({ url, viewport, samples, browserFactory }));
  }
  return { url: sanitizeFailureUrl(url), samples, reports };
}

export async function writeReport(output, report) {
  const absoluteOutput = resolve(output);
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
