#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIAGNOSTIC_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
export const DIAGNOSTIC_ROUTES = ['/', '/login'];
export const DIAGNOSTIC_QUIET_MS = 1_000;
export const DIAGNOSTIC_MAX_SETTLE_MS = 5_000;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'v8.execute',
  'blink.user_timing',
  'loading',
  'disabled-by-default-devtools.timeline',
];
const SCRIPT_EVENTS = new Set([
  'EvaluateScript',
  'FunctionCall',
  'RunMicrotasks',
  'TimerFire',
  'EventDispatch',
  'FireAnimationFrame',
]);
const STYLE_LAYOUT_EVENTS = new Set([
  'UpdateLayoutTree',
  'Layout',
  'RecalculateStyles',
  'ParseAuthorStyleSheet',
]);
const PAINT_EVENTS = new Set(['PrePaint', 'Paint', 'CompositeLayers']);
const CRITICAL_RELEVANCE = new Set([
  'navigation_document',
  'browser_reported_render_blocking',
  'lcp_resource',
  'lcp_font_family_candidate',
]);
const FONT_FACES = new Map([
  ['/_next/static/media/19cfc7226ec3afaa-s.p.woff2', 'Inter Greek'],
  ['/_next/static/media/e4af272ccee01ff0-s.p.woff2', 'Inter Latin'],
  ['/_next/static/media/9cc5b37ab1350db7-s.p.woff2', 'Instrument Serif italic Latin'],
  ['/_next/static/media/e6099e249fd938cc-s.p.woff2', 'Instrument Serif normal Latin'],
  ['/_next/static/media/427e4a37d3642943-s.woff2', 'JetBrains Mono Latin'],
  ['/_next/static/media/db5568a2cfd831e2-s.woff2', 'JetBrains Mono Greek'],
]);

const round = (value, places = 3) => Number(value.toFixed(places));
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function isDiagnosticReadOnlyMethod(method) {
  return typeof method === 'string' && SAFE_METHODS.has(method.toUpperCase());
}

export function validatedLoopbackTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Diagnostic target must be a loopback HTTP URL');
  }
  if (
    url.protocol !== 'http:'
    || url.hostname !== '127.0.0.1'
    || url.port !== '3300'
  ) {
    throw new Error('Diagnostic target must be loopback http://127.0.0.1:3300');
  }
  if (url.username || url.password) {
    throw new Error('Diagnostic target credentials are forbidden');
  }
  if (url.search || url.hash) {
    throw new Error('Diagnostic target query strings and fragments are forbidden');
  }
  if (!DIAGNOSTIC_ROUTES.includes(url.pathname)) {
    throw new Error('Diagnostic target path must be / or /login');
  }
  return url;
}

export function validatedDiagnosticOutputPath(rawPath) {
  const output = resolve(rawPath);
  if (
    !/^\/tmp\/trophe-bottleneck-trace\.[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
      .test(output)
  ) {
    throw new Error('Output must be a JSON file in a unique temporary trace directory');
  }
  return output;
}

export function parseDiagnosticCliArgs(argv) {
  let url;
  let output;
  let samples = 3;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--url') {
      if (!value) throw new Error('--url requires a value');
      url = value;
      index += 1;
    } else if (argument === '--output') {
      if (!value) throw new Error('--output requires a value');
      output = value;
      index += 1;
    } else if (argument === '--samples') {
      if (!value) throw new Error('--samples requires a value');
      samples = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown diagnostic argument: ${argument}`);
    }
  }
  if (!url) throw new Error('--url is required');
  if (!output) throw new Error('--output is required');
  if (!Number.isInteger(samples) || samples < 1 || samples > 5) {
    throw new Error('--samples must be an integer between 1 and 5');
  }
  const target = validatedLoopbackTarget(url);
  return {
    baseUrl: `${target.origin}/`,
    output: validatedDiagnosticOutputPath(output),
    samples,
  };
}

export function mergedDurationMs(events, startUs, endUs) {
  const intervals = events
    .filter((event) => event.ph === 'X' && Number.isFinite(event.dur))
    .map((event) => [
      Math.max(startUs, event.ts),
      Math.min(endUs, event.ts + event.dur),
    ])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || interval[0] > previous[1]) {
      merged.push([...interval]);
    } else {
      previous[1] = Math.max(previous[1], interval[1]);
    }
  }
  return round(
    merged.reduce((total, [start, end]) => total + end - start, 0) / 1_000,
  );
}

export function summarizeResourceTransfers(resources) {
  const transferFor = (predicate) => resources
    .filter(predicate)
    .reduce((total, resource) => total + resource.transferBytes, 0);
  const classifiedTypes = new Set([
    'Document',
    'Stylesheet',
    'Script',
    'Font',
    'Fetch',
  ]);
  return {
    transferredBytes: transferFor(() => true),
    documentTransferBytes: transferFor((resource) => resource.type === 'Document'),
    renderBlockingTransferBytes: transferFor(
      (resource) => resource.renderBlockingStatus === 'blocking',
    ),
    javascriptTransferBytes: transferFor((resource) => resource.type === 'Script'),
    cssTransferBytes: transferFor((resource) => resource.type === 'Stylesheet'),
    fontTransferBytes: transferFor((resource) => resource.type === 'Font'),
    fetchTransferBytes: transferFor((resource) => resource.type === 'Fetch'),
    otherTransferBytes: transferFor(
      (resource) => !classifiedTypes.has(resource.type),
    ),
    preloadedFontTransferBytes: transferFor((resource) => (
      resource.type === 'Font' && resource.initiatorType === 'link'
    )),
  };
}

export function selectRepresentativeSample(samples) {
  const medianLcp = median(samples.map((sample) => sample.metrics.lcpMs));
  return [...samples].sort((left, right) => (
    Math.abs(left.metrics.lcpMs - medianLcp)
    - Math.abs(right.metrics.lcpMs - medianLcp)
  ))[0];
}

export function selectCriticalRequestChain(resources) {
  return resources.filter((resource) => (
    resource.relevance.some((label) => CRITICAL_RELEVANCE.has(label))
  ));
}

function sanitizedResourcePath(value, baseUrl) {
  const url = new URL(value);
  return url.origin === new URL(baseUrl).origin
    ? url.pathname
    : `${url.origin}${url.pathname}`;
}

function lcpFontCandidate(resource, lcp) {
  const style = lcp.paintNode.computedStyle;
  return (
    resource.fontFace === 'Inter Latin'
    && style.fontFamily.includes('Inter')
    && style.fontStyle === 'normal'
  ) || (
    resource.fontFace === 'Instrument Serif italic Latin'
    && style.fontFamily.includes('Instrument Serif')
    && style.fontStyle === 'italic'
  ) || (
    resource.fontFace === 'Instrument Serif normal Latin'
    && style.fontFamily.includes('Instrument Serif')
    && style.fontStyle === 'normal'
  ) || (
    resource.fontFace === 'JetBrains Mono Latin'
    && style.fontFamily.includes('JetBrains Mono')
  );
}

function addResourceRelevance(resource, lcp, baseUrl) {
  const relevance = [];
  if (resource.type === 'Document') relevance.push('navigation_document');
  if (resource.renderBlockingStatus === 'blocking') {
    relevance.push('browser_reported_render_blocking');
  }
  if (
    lcp.url
    && resource.url === sanitizedResourcePath(lcp.url, baseUrl)
  ) relevance.push('lcp_resource');
  if (resource.type === 'Font' && resource.initiatorType === 'link') {
    relevance.push('preloaded_font');
  }
  if (resource.type === 'Font' && lcpFontCandidate(resource, lcp)) {
    relevance.push('lcp_font_family_candidate');
  }
  if (resource.type === 'Script' && resource.url.startsWith('/_next/static/')) {
    relevance.push('client_boot_or_route_prefetch');
  }
  if (resource.type === 'Stylesheet') relevance.push('stylesheet');
  if (resource.url === '/_vercel/insights/script.js') {
    relevance.push('noncritical_local_analytics_failure');
  }
  return { ...resource, relevance };
}

function traceMetrics(trace, targetUrl, traceEndMs, lcp, react) {
  const navigation = trace.find((event) => (
    event.name === 'navigationStart'
    && event.args?.data?.isOutermostMainFrame
    && event.args?.data?.documentLoaderURL === targetUrl
  ));
  if (!navigation) {
    throw new Error(`Missing navigationStart trace event for ${targetUrl}`);
  }
  const mainEvents = trace.filter((event) => (
    event.pid === navigation.pid
    && event.tid === navigation.tid
    && event.ph === 'X'
    && Number.isFinite(event.dur)
  ));
  const startUs = navigation.ts;
  const endUs = startUs + traceEndMs * 1_000;
  const lcpEndUs = startUs + lcp.startTime * 1_000;
  const reactStartUs = startUs + react.rendererInjectMs * 1_000;
  const reactEndUs = startUs + react.lastCommitMs * 1_000;
  const runTasks = mainEvents.filter((event) => event.name === 'RunTask');
  const scripting = mainEvents.filter((event) => SCRIPT_EVENTS.has(event.name));
  const styleLayout = mainEvents.filter(
    (event) => STYLE_LAYOUT_EVENTS.has(event.name),
  );
  const paint = mainEvents.filter((event) => PAINT_EVENTS.has(event.name));
  const parse = mainEvents.filter((event) => event.name === 'ParseHTML');
  return {
    traceWindowMs: round(traceEndMs),
    mainThreadBusyToSettleMs: mergedDurationMs(runTasks, startUs, endUs),
    mainThreadBusyToLcpMs: mergedDurationMs(runTasks, startUs, lcpEndUs),
    scriptingToSettleMs: mergedDurationMs(scripting, startUs, endUs),
    scriptingToLcpMs: mergedDurationMs(scripting, startUs, lcpEndUs),
    scriptingDuringReactWindowMs: mergedDurationMs(
      scripting,
      reactStartUs,
      Math.max(reactStartUs, reactEndUs),
    ),
    styleLayoutToSettleMs: mergedDurationMs(styleLayout, startUs, endUs),
    paintToSettleMs: mergedDurationMs(paint, startUs, endUs),
    parseHtmlMs: mergedDurationMs(parse, startUs, endUs),
    longestMainThreadTaskMs: round(
      Math.max(0, ...runTasks.map((event) => event.dur / 1_000)),
    ),
    mainThreadTasksOver50Ms: runTasks.filter((event) => event.dur >= 50_000).length,
  };
}

function installDiagnosticObservers() {
  window.__tropheBottleneckDiagnostic = {
    lcp: null,
    react: { renderer: null, commits: [] },
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const element = entry.element;
      const leafCandidates = element
        ? [element, ...element.querySelectorAll('*')].filter((candidate) => (
          [...candidate.childNodes].some((node) => (
            node.nodeType === Node.TEXT_NODE && node.textContent.trim()
          ))
        ))
        : [];
      const paintNode = leafCandidates.at(-1) ?? element;
      const style = paintNode ? getComputedStyle(paintNode) : null;
      const describe = (node) => node ? {
        tag: node.tagName,
        id: node.id || null,
        className: typeof node.className === 'string'
          ? node.className.slice(0, 320)
          : null,
        text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240),
      } : null;
      window.__tropheBottleneckDiagnostic.lcp = {
        startTime: entry.startTime,
        renderTime: entry.renderTime,
        loadTime: entry.loadTime,
        size: entry.size,
        url: entry.url || null,
        element: describe(element),
        paintNode: {
          ...describe(paintNode),
          computedStyle: style ? {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStyle: style.fontStyle,
            backgroundImage: style.backgroundImage,
          } : null,
        },
      };
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  let rendererId = 0;
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    configurable: true,
    value: {
      supportsFiber: true,
      checkDCE() {},
      inject(renderer) {
        window.__tropheBottleneckDiagnostic.react.renderer = {
          injectTime: performance.now(),
          version: renderer?.version ?? null,
          packageName: renderer?.rendererPackageName ?? null,
        };
        rendererId += 1;
        return rendererId;
      },
      onCommitFiberRoot(id, root, priority, didError) {
        window.__tropheBottleneckDiagnostic.react.commits.push({
          time: performance.now(),
          rendererId: id,
          didError: Boolean(didError),
          isDehydrated: root?.current?.memoizedState?.isDehydrated ?? null,
        });
      },
      onPostCommitFiberRoot() {},
      onCommitFiberUnmount() {},
      getFiberRoots() { return new Set(); },
    },
  });
}

async function waitForDiagnosticSettle(page, getLastActivityAt, getInFlightCount) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DIAGNOSTIC_MAX_SETTLE_MS) {
    if (
      getInFlightCount() === 0
      && Date.now() - getLastActivityAt() >= DIAGNOSTIC_QUIET_MS
    ) {
      return {
        reason: 'network_quiet',
        durationMs: Date.now() - startedAt,
        remainingInFlightCount: 0,
      };
    }
    await page.waitForTimeout(50);
  }
  return {
    reason: 'max_settle_reached',
    durationMs: Date.now() - startedAt,
    remainingInFlightCount: getInFlightCount(),
  };
}

async function collectDiagnosticSample(browser, {
  baseUrl,
  routePath,
  viewport,
  sampleIndex,
}) {
  const targetUrl = new URL(routePath, baseUrl).toString();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
  });
  let blockedRequestCount = 0;
  let requestCount = 0;
  let allowedRequestCount = 0;
  let consoleErrorCount = 0;
  let networkErrorCount = 0;
  let lastActivityAt = Date.now();
  const inFlight = new Set();
  const network = new Map();
  const trace = [];
  let cdp;

  try {
    if (typeof context.routeWebSocket !== 'function') {
      throw new Error('WebSocket blocking unavailable; refusing unsafe diagnostic');
    }
    await context.route('**/*', async (route) => {
      if (!isDiagnosticReadOnlyMethod(route.request().method())) {
        blockedRequestCount += 1;
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await context.routeWebSocket('**/*', (webSocket) => {
      webSocket.close({ code: 1008, reason: 'read_only_measurement' });
    });
    const page = await context.newPage();
    await page.addInitScript(installDiagnosticObservers);
    page.on('request', (request) => {
      requestCount += 1;
      if (isDiagnosticReadOnlyMethod(request.method())) allowedRequestCount += 1;
      lastActivityAt = Date.now();
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrorCount += 1;
    });
    page.on('requestfailed', () => {
      networkErrorCount += 1;
      lastActivityAt = Date.now();
    });
    page.on('response', (response) => {
      if (response.status() >= 400) networkErrorCount += 1;
      lastActivityAt = Date.now();
    });

    cdp = await context.newCDPSession(page);
    let tracingComplete;
    const traceDone = new Promise((resolveTrace) => {
      tracingComplete = resolveTrace;
    });
    cdp.on('Tracing.dataCollected', (event) => trace.push(...event.value));
    cdp.on('Tracing.tracingComplete', tracingComplete);
    cdp.on('Network.requestWillBeSent', (event) => {
      lastActivityAt = Date.now();
      inFlight.add(event.requestId);
      network.set(event.requestId, {
        url: event.request.url,
        type: event.type,
        initiatorType: event.initiator?.type ?? null,
        startTimestamp: event.timestamp,
        finishTimestamp: null,
        partialBytes: 0,
        transferBytes: 0,
        status: null,
        mimeType: null,
        failed: false,
      });
    });
    cdp.on('Network.dataReceived', (event) => {
      lastActivityAt = Date.now();
      const record = network.get(event.requestId);
      if (record && Number.isFinite(event.encodedDataLength)) {
        record.partialBytes += Math.max(0, event.encodedDataLength);
      }
    });
    cdp.on('Network.responseReceived', (event) => {
      lastActivityAt = Date.now();
      const record = network.get(event.requestId);
      if (record) {
        record.type = event.type;
        record.status = event.response.status;
        record.mimeType = event.response.mimeType;
      }
    });
    cdp.on('Network.loadingFinished', (event) => {
      lastActivityAt = Date.now();
      inFlight.delete(event.requestId);
      const record = network.get(event.requestId);
      if (record) {
        record.finishTimestamp = event.timestamp;
        record.transferBytes = Math.max(
          record.partialBytes,
          event.encodedDataLength ?? 0,
        );
      }
    });
    cdp.on('Network.loadingFailed', (event) => {
      lastActivityAt = Date.now();
      inFlight.delete(event.requestId);
      const record = network.get(event.requestId);
      if (record) {
        record.finishTimestamp = event.timestamp;
        record.transferBytes = record.partialBytes;
        record.failed = true;
      }
    });
    await cdp.send('Network.enable');
    await cdp.send('Tracing.start', {
      categories: `-*,${TRACE_CATEGORIES.join(',')}`,
      transferMode: 'ReportEvents',
    });

    const capturedAtUtc = new Date().toISOString();
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30_000 });
    const settlement = await waitForDiagnosticSettle(
      page,
      () => lastActivityAt,
      () => inFlight.size,
    );
    const observed = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      return {
        traceEndMs: performance.now(),
        navigation: navigation.toJSON(),
        fcp: paints.find(
          (entry) => entry.name === 'first-contentful-paint',
        )?.startTime ?? null,
        resources: performance.getEntriesByType('resource').map((entry) => ({
          ...entry.toJSON(),
          renderBlockingStatus: entry.renderBlockingStatus,
        })),
        diagnostic: window.__tropheBottleneckDiagnostic,
      };
    });
    await cdp.send('Tracing.end');
    await traceDone;

    const lcp = observed.diagnostic.lcp;
    const renderer = observed.diagnostic.react.renderer;
    const commits = observed.diagnostic.react.commits;
    if (!lcp || !renderer || commits.length === 0) {
      throw new Error(`Missing LCP or React observation for ${routePath}`);
    }
    const firstCommitMs = commits[0].time;
    const lastCommitMs = commits.at(-1).time;
    const react = {
      rendererPackage: renderer.packageName,
      rendererVersion: renderer.version,
      rendererInjectMs: round(renderer.injectTime),
      firstCommitMs: round(firstCommitMs),
      lastCommitMs: round(lastCommitMs),
      commitCount: commits.length,
      injectToFirstCommitMs: round(firstCommitMs - renderer.injectTime),
      injectToLastCommitMs: round(lastCommitMs - renderer.injectTime),
      commitErrors: commits.filter((commit) => commit.didError).length,
      finalIsDehydrated: commits.at(-1).isDehydrated,
    };
    const navigationRequest = [...network.values()].find(
      (record) => record.url === targetUrl,
    );
    if (!navigationRequest) throw new Error(`Missing document request for ${targetUrl}`);
    const timingByUrl = new Map(
      observed.resources.map((entry) => [entry.name, entry]),
    );
    const resources = [...network.values()]
      .filter((record) => record.finishTimestamp !== null)
      .map((record) => {
        const timing = timingByUrl.get(record.url);
        const isDocument = record.url === targetUrl;
        const url = sanitizedResourcePath(record.url, baseUrl);
        const resource = {
          url,
          type: record.type,
          initiatorType: isDocument
            ? 'navigation'
            : timing?.initiatorType ?? record.initiatorType,
          startMs: isDocument
            ? 0
            : round(timing?.startTime ?? (
              (record.startTimestamp - navigationRequest.startTimestamp) * 1_000
            )),
          durationMs: round(isDocument
            ? (record.finishTimestamp - record.startTimestamp) * 1_000
            : timing?.duration ?? (
              (record.finishTimestamp - record.startTimestamp) * 1_000
            )),
          transferBytes: Math.round(record.transferBytes),
          decodedBodyBytes: isDocument
            ? Math.round(observed.navigation.decodedBodySize)
            : Math.round(timing?.decodedBodySize ?? 0),
          status: record.status,
          mimeType: record.mimeType,
          renderBlockingStatus: isDocument
            ? 'navigation'
            : timing?.renderBlockingStatus ?? 'unknown',
          failed: record.failed,
          fontFace: FONT_FACES.get(url) ?? null,
        };
        return addResourceRelevance(resource, lcp, baseUrl);
      })
      .sort((left, right) => (
        left.startMs - right.startMs || left.url.localeCompare(right.url)
      ));
    const transfers = summarizeResourceTransfers(resources);
    const initialScripts = resources.filter((resource) => (
      resource.type === 'Script' && resource.startMs <= react.lastCommitMs
    ));
    const postCommitScripts = resources.filter((resource) => (
      resource.type === 'Script' && resource.startMs > react.lastCommitMs
    ));
    return {
      sample: sampleIndex,
      capturedAtUtc,
      valid: settlement.reason === 'network_quiet' && blockedRequestCount === 0,
      settlement,
      safety: {
        requestCount,
        allowedRequestCount,
        blockedRequestCount,
        consoleErrorCount,
        networkErrorCount,
      },
      metrics: {
        ttfbMs: round(observed.navigation.responseStart),
        fcpMs: round(observed.fcp),
        lcpMs: round(lcp.startTime),
        loadMs: round(observed.navigation.loadEventEnd),
        requestCount,
        ...transfers,
        initialJavascriptRequestCount: initialScripts.length,
        initialJavascriptTransferBytes: initialScripts.reduce(
          (total, resource) => total + resource.transferBytes,
          0,
        ),
        postReactCommitJavascriptRequestCount: postCommitScripts.length,
        postReactCommitJavascriptTransferBytes: postCommitScripts.reduce(
          (total, resource) => total + resource.transferBytes,
          0,
        ),
      },
      lcp: {
        startTimeMs: round(lcp.startTime),
        renderTimeMs: round(lcp.renderTime),
        loadTimeMs: round(lcp.loadTime),
        sizePx2: lcp.size,
        url: lcp.url ? sanitizedResourcePath(lcp.url, baseUrl) : null,
        resourceTransferBytes: lcp.url
          ? resources
            .filter((resource) => (
              resource.url === sanitizedResourcePath(lcp.url, baseUrl)
            ))
            .reduce((total, resource) => total + resource.transferBytes, 0)
          : 0,
        element: lcp.element,
        paintNode: lcp.paintNode,
      },
      react,
      mainThread: traceMetrics(
        trace,
        targetUrl,
        observed.traceEndMs,
        lcp,
        react,
      ),
      resources,
    };
  } finally {
    if (cdp) await cdp.detach().catch(() => {});
    await context.close();
  }
}

function numericSummary(samples, objectKey, keys) {
  return Object.fromEntries(keys.map((key) => {
    const values = samples.map((sample) => sample[objectKey][key]);
    return [key, {
      median: round(median(values)),
      worst: round(Math.max(...values)),
    }];
  }));
}

function lcpIdentityKey(lcp) {
  return [
    lcp.element?.tag,
    lcp.paintNode?.tag,
    lcp.element?.text,
    lcp.paintNode?.text,
    lcp.paintNode?.computedStyle?.fontFamily,
    lcp.paintNode?.computedStyle?.fontWeight,
    lcp.paintNode?.computedStyle?.fontStyle,
  ].join('|');
}

function summarizeDiagnosticSamples(samples, baselineMedian) {
  const metricKeys = Object.keys(samples[0].metrics);
  const mainThreadKeys = Object.keys(samples[0].mainThread);
  const reactKeys = [
    'rendererInjectMs',
    'firstCommitMs',
    'lastCommitMs',
    'commitCount',
    'injectToFirstCommitMs',
    'injectToLastCommitMs',
  ];
  const representative = selectRepresentativeSample(samples);
  const metricSummary = numericSummary(samples, 'metrics', metricKeys);
  const identities = samples.map((sample) => lcpIdentityKey(sample.lcp));
  return {
    validSampleCount: samples.filter((sample) => sample.valid).length,
    metricSummary,
    mainThreadSummary: numericSummary(samples, 'mainThread', mainThreadKeys),
    reactSummary: numericSummary(samples, 'react', reactKeys),
    javascriptPhases: {
      throughLastReactCommit: {
        requestCount: metricSummary.initialJavascriptRequestCount,
        transferBytes: metricSummary.initialJavascriptTransferBytes,
      },
      afterLastReactCommit: {
        requestCount: metricSummary.postReactCommitJavascriptRequestCount,
        transferBytes: metricSummary.postReactCommitJavascriptTransferBytes,
      },
    },
    lcpIdentityConsistency: new Set(identities).size === 1,
    lcpIdentityKeys: identities,
    representativeSample: representative.sample,
    representativeLcp: representative.lcp,
    criticalRequestChain: selectCriticalRequestChain(representative.resources),
    baselineReconciliation: {
      headlineMedian: {
        ttfb: baselineMedian.ttfb,
        fcp: baselineMedian.fcp,
        lcp: baselineMedian.lcp,
        load: baselineMedian.load,
        requestCount: baselineMedian.requestCount,
        transferredBytes: baselineMedian.transferredBytes,
      },
      diagnosticMedian: {
        ttfbMs: metricSummary.ttfbMs.median,
        fcpMs: metricSummary.fcpMs.median,
        lcpMs: metricSummary.lcpMs.median,
        loadMs: metricSummary.loadMs.median,
        requestCount: metricSummary.requestCount.median,
        transferredBytes: metricSummary.transferredBytes.median,
      },
      requestCountExactMatch: (
        baselineMedian.requestCount === metricSummary.requestCount.median
      ),
      transferredBytesExactMatch: (
        baselineMedian.transferredBytes === metricSummary.transferredBytes.median
      ),
    },
  };
}

function compactSample(sample) {
  return {
    sample: sample.sample,
    capturedAtUtc: sample.capturedAtUtc,
    valid: sample.valid,
    settlement: sample.settlement,
    safety: sample.safety,
    metrics: sample.metrics,
    lcp: {
      startTimeMs: sample.lcp.startTimeMs,
      renderTimeMs: sample.lcp.renderTimeMs,
      loadTimeMs: sample.lcp.loadTimeMs,
      sizePx2: sample.lcp.sizePx2,
      url: sample.lcp.url,
      resourceTransferBytes: sample.lcp.resourceTransferBytes,
    },
    react: sample.react,
    mainThread: sample.mainThread,
  };
}

export async function collectLocalBottlenecks({
  baseUrl,
  output,
  samples = 3,
  browserFactory,
  baselinePath = 'docs/quality/performance-local-baseline.json',
}) {
  const target = validatedLoopbackTarget(baseUrl);
  const normalizedBaseUrl = `${target.origin}/`;
  const outputPath = validatedDiagnosticOutputPath(output);
  if (!Number.isInteger(samples) || samples < 1 || samples > 5) {
    throw new Error('samples must be an integer between 1 and 5');
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const launchBrowser = browserFactory ?? (async () => {
    const { chromium } = await import('playwright');
    return chromium.launch({ headless: true });
  });
  const browser = await launchBrowser();
  const startedAtUtc = new Date().toISOString();
  try {
    const routes = [];
    for (const routePath of DIAGNOSTIC_ROUTES) {
      const baselineRoute = baseline.routes.find((route) => route.path === routePath);
      if (!baselineRoute) throw new Error(`Missing baseline route ${routePath}`);
      const viewports = [];
      for (const viewport of DIAGNOSTIC_VIEWPORTS) {
        const collected = [];
        for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) {
          collected.push(await collectDiagnosticSample(browser, {
            baseUrl: normalizedBaseUrl,
            routePath,
            viewport,
            sampleIndex,
          }));
        }
        const baselineMedian = baselineRoute.summaryByViewport.find(
          (summary) => summary.viewport.name === viewport.name,
        )?.median;
        if (!baselineMedian) {
          throw new Error(`Missing baseline viewport ${routePath}/${viewport.name}`);
        }
        viewports.push({
          viewport,
          samples: collected.map(compactSample),
          summary: summarizeDiagnosticSamples(collected, baselineMedian),
        });
      }
      routes.push({
        path: routePath,
        buildAssetRawBytes: baselineRoute.sourceObservation.referencedAssets,
        viewports,
      });
    }
    const playwrightPackage = JSON.parse(
      await readFile(resolve('node_modules/playwright/package.json'), 'utf8'),
    );
    const report = {
      schema: {
        name: 'trophe.local-bottleneck-diagnostic',
        version: 1,
        grain: 'route × viewport × sample',
        samplesPerViewport: samples,
        viewportOrder: DIAGNOSTIC_VIEWPORTS,
        timingUnits: 'milliseconds from navigationStart',
        transferUnits: 'CDP Network.loadingFinished encodedDataLength bytes',
        traceCategories: TRACE_CATEGORIES,
        boundedWindow: {
          starts: 'before navigation',
          ends: 'one second of zero CDP in-flight network activity after load',
          maximumMs: DIAGNOSTIC_MAX_SETTLE_MS,
        },
        hydrationMethod: {
          boundary: 'React DevTools hook renderer injection through last initial commit before bounded network settlement',
          cost: 'union of non-overlapping renderer-main scripting events in that boundary',
          interpretation: 'diagnostic upper-bound proxy for hydration plus immediate client effects; not a React profiler duration and not a replacement for headline harness timings',
        },
        criticalChainMethod: {
          blockingStatus: 'PerformanceResourceTiming.renderBlockingStatus',
          lcpIdentity: 'buffered LargestContentfulPaint entry plus exact element/leaf text node and computed style',
          resources: 'CDP type/status/encoded bytes joined to Resource Timing start/duration/initiator',
        },
        safety: {
          target: 'loopback only',
          permittedMethods: [...SAFE_METHODS],
          serviceWorkers: 'blocked',
          webSockets: 'blocked',
          context: 'fresh per sample',
          interactions: false,
          cookiesSupplied: false,
        },
      },
      target: 'local-production-build',
      baseUrl: normalizedBaseUrl.replace(/\/$/, ''),
      browser: {
        engine: 'Chromium',
        version: await browser.version(),
        playwrightVersion: playwrightPackage.version,
        headless: true,
      },
      captureWindowUtc: {
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
      },
      routes,
    };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await browser.close();
  }
}

async function main() {
  const options = parseDiagnosticCliArgs(process.argv.slice(2));
  await collectLocalBottlenecks(options);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
