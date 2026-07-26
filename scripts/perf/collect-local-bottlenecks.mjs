#!/usr/bin/env node

import {
  lstat,
  open,
  readFile,
  realpath,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTransferAccumulator } from './measure-web.mjs';

export const DIAGNOSTIC_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
export const DIAGNOSTIC_ROUTES = ['/', '/login'];
export const DIAGNOSTIC_QUIET_MS = 1_000;
export const DIAGNOSTIC_MAX_SETTLE_MS = 5_000;
export const DIAGNOSTIC_OPERATION_TIMEOUT_MS = 5_000;

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

export function diagnosticRequestRejectionReason(request) {
  const method = request.method();
  if (!isDiagnosticReadOnlyMethod(method)) {
    return `blocked_method_${String(method).toLowerCase()}`;
  }
  let url;
  try {
    url = new URL(request.url());
  } catch {
    return 'blocked_invalid_url';
  }
  if (url.origin !== 'http://127.0.0.1:3300') {
    return 'blocked_external_origin';
  }
  if (url.username || url.password) return 'blocked_credentials';
  if (request.isNavigationRequest?.()) {
    const frame = request.frame?.();
    if (!frame || typeof frame.parentFrame !== 'function') {
      return 'blocked_unverifiable_navigation';
    }
    if (url.search) return 'blocked_query';
    if (url.hash) return 'blocked_fragment';
    if (frame.parentFrame() === null && !DIAGNOSTIC_ROUTES.includes(url.pathname)) {
      return 'blocked_main_frame_path';
    }
  }
  return null;
}

/**
 * @param {{ onBlocked?: (reason: string, request: object) => void }} [options]
 */
export function createDiagnosticRouteHandler({
  onBlocked = () => {},
} = {}) {
  return async (route) => {
    const request = route.request();
    const reason = diagnosticRequestRejectionReason(request);
    if (reason) {
      onBlocked(reason, request);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  };
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

export async function writeDiagnosticOutput(rawPath, contents) {
  const output = validatedDiagnosticOutputPath(rawPath);
  const parent = dirname(output);
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink()) {
    throw new Error('Diagnostic output parent must not be a symlink');
  }
  if (!parentStat.isDirectory()) {
    throw new Error('Diagnostic output parent must be a directory');
  }
  const [temporaryRoot, realParent] = await Promise.all([
    realpath('/tmp'),
    realpath(parent),
  ]);
  if (
    dirname(realParent) !== temporaryRoot
    || basename(realParent) !== basename(parent)
  ) {
    throw new Error('Diagnostic output parent escapes the real temporary root');
  }
  try {
    const outputStat = await lstat(output);
    if (outputStat.isSymbolicLink()) {
      throw new Error('Diagnostic output file must not be a symlink');
    }
    throw new Error('Diagnostic output file already exists; exclusive create required');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const handle = await open(output, 'wx', 0o600);
  try {
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
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

export function createDiagnosticNetworkAccumulator() {
  const transfers = createTransferAccumulator();
  const active = new Map();
  const resources = [];

  const startRecord = (event) => ({
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
    servedFromCache: false,
  });
  const finishRecord = (
    requestId,
    {
      terminalBytes = 0,
      timestamp = null,
      response = null,
      failed = false,
    } = {},
  ) => {
    const record = active.get(requestId);
    if (!record) return;
    if (response) {
      record.url = response.url ?? record.url;
      record.status = response.status ?? record.status;
      record.mimeType = response.mimeType ?? record.mimeType;
    }
    record.finishTimestamp = timestamp;
    record.transferBytes = record.servedFromCache
      ? 0
      : Math.max(
        record.partialBytes,
        Number.isFinite(terminalBytes) ? terminalBytes : 0,
      );
    record.failed = failed;
    resources.push({ ...record });
    active.delete(requestId);
  };

  return {
    requestWillBeSent(event) {
      transfers.requestWillBeSent(event);
      if (event.redirectResponse) {
        finishRecord(event.requestId, {
          terminalBytes: event.redirectResponse.encodedDataLength,
          timestamp: event.timestamp,
          response: event.redirectResponse,
        });
      }
      active.set(event.requestId, startRecord(event));
    },
    dataReceived(event) {
      transfers.dataReceived(event);
      const record = active.get(event.requestId);
      if (
        record
        && !record.servedFromCache
        && Number.isFinite(event.encodedDataLength)
        && event.encodedDataLength > 0
      ) {
        record.partialBytes += event.encodedDataLength;
      }
    },
    responseReceived(event) {
      const record = active.get(event.requestId);
      if (record) {
        record.type = event.type ?? record.type;
        record.status = event.response.status;
        record.mimeType = event.response.mimeType;
      }
    },
    requestServedFromCache(event) {
      transfers.requestServedFromCache(event);
      const record = active.get(event.requestId);
      if (record) {
        record.partialBytes = 0;
        record.servedFromCache = true;
      }
    },
    loadingFinished(event) {
      transfers.loadingFinished(event);
      finishRecord(event.requestId, {
        terminalBytes: event.encodedDataLength,
        timestamp: event.timestamp,
      });
    },
    loadingFailed(event) {
      transfers.loadingFailed(event);
      finishRecord(event.requestId, {
        timestamp: event.timestamp,
        failed: true,
      });
    },
    snapshot() {
      return {
        transferOutcomes: transfers.snapshot(),
        resources: resources.map((resource) => ({ ...resource })),
      };
    },
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

function compactElementDescription(node) {
  return node ? {
    tag: node.tagName,
    id: node.id || null,
    className: typeof node.className === 'string'
      ? node.className.slice(0, 320)
      : null,
    text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240),
  } : null;
}

export function collectLcpTextLeaves(
  element,
  getStyle = (node) => getComputedStyle(node),
  textNodeType = Node.TEXT_NODE,
) {
  if (!element) return [];
  return [element, ...element.querySelectorAll('*')].flatMap((candidate) => {
    const directText = [...candidate.childNodes]
      .filter((node) => node.nodeType === textNodeType)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 240);
    if (!directText) return [];
    const style = getStyle(candidate);
    return [{
      ...compactElementDescription(candidate),
      directText,
      computedStyle: style ? {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        backgroundImage: style.backgroundImage,
      } : null,
    }];
  });
}

export function lcpFontCandidate(resource, lcp) {
  const leaves = lcp.textLeaves ?? (
    lcp.paintNode ? [lcp.paintNode] : []
  );
  return leaves.some(({ computedStyle: style }) => style && ((
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
  )));
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
      const describe = (node) => node ? {
        tag: node.tagName,
        id: node.id || null,
        className: typeof node.className === 'string'
          ? node.className.slice(0, 320)
          : null,
        text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240),
      } : null;
      const textLeaves = element
        ? [element, ...element.querySelectorAll('*')].flatMap((candidate) => {
          const directText = [...candidate.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .slice(0, 240);
          if (!directText) return [];
          const style = getComputedStyle(candidate);
          return [{
            ...describe(candidate),
            directText,
            computedStyle: {
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              backgroundImage: style.backgroundImage,
            },
          }];
        })
        : [];
      window.__tropheBottleneckDiagnostic.lcp = {
        startTime: entry.startTime,
        renderTime: entry.renderTime,
        loadTime: entry.loadTime,
        size: entry.size,
        url: entry.url || null,
        element: describe(element),
        textLeaves,
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

export async function waitForDiagnosticSettle({
  getLastActivityAt,
  loadCompletedAt,
  getInFlightCount,
  now = Date.now,
  wait,
  quietMs = DIAGNOSTIC_QUIET_MS,
  maxMs = DIAGNOSTIC_MAX_SETTLE_MS,
}) {
  const startedAt = now();
  while (now() - startedAt < maxMs) {
    const quietFor = now() - Math.max(getLastActivityAt(), loadCompletedAt);
    const remainingInFlightCount = getInFlightCount();
    if (
      remainingInFlightCount === 0
      && quietFor >= quietMs
    ) {
      return {
        reason: 'network_quiet',
        durationMs: now() - startedAt,
        remainingInFlightCount: 0,
      };
    }
    const remainingQuiet = quietMs - quietFor;
    const remainingTotal = maxMs - (now() - startedAt);
    await wait(Math.max(1, Math.min(
      50,
      remainingInFlightCount === 0 ? remainingQuiet : 50,
      remainingTotal,
    )));
  }
  return {
    reason: 'max_settle_reached',
    durationMs: now() - startedAt,
    remainingInFlightCount: getInFlightCount(),
  };
}

export async function withDiagnosticDeadline(promise, {
  label,
  timeoutMs = DIAGNOSTIC_OPERATION_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimer(() => {
      reject(new Error(`${label} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimer(timer);
  }
}

export async function runWithBoundedCleanup({
  operation,
  cleanup,
  deadline = (promise, label) => withDiagnosticDeadline(promise, { label }),
}) {
  let result;
  let primaryError;
  try {
    result = await operation();
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  for (const item of cleanup) {
    try {
      await deadline(Promise.resolve().then(item.run), item.label);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

export async function collectDiagnosticSample(browser, {
  baseUrl,
  routePath,
  viewport,
  sampleIndex,
  now = Date.now,
  deadline = (promise, label) => withDiagnosticDeadline(promise, { label }),
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
  let lastActivityAt = now();
  const blockedReasonCounts = {};
  const network = createDiagnosticNetworkAccumulator();
  const trace = [];
  let cdp;

  return runWithBoundedCleanup({
    operation: async () => {
    if (typeof context.routeWebSocket !== 'function') {
      throw new Error('WebSocket blocking unavailable; refusing unsafe diagnostic');
    }
    await context.route('**/*', createDiagnosticRouteHandler({
      onBlocked(reason) {
        blockedRequestCount += 1;
        blockedReasonCounts[reason] = (blockedReasonCounts[reason] ?? 0) + 1;
      },
    }));
    await context.routeWebSocket('**/*', (webSocket) => {
      webSocket.close({ code: 1008, reason: 'read_only_measurement' });
    });
    const page = await context.newPage();
    await page.addInitScript(installDiagnosticObservers);
    page.on('request', (request) => {
      requestCount += 1;
      if (diagnosticRequestRejectionReason(request) === null) {
        allowedRequestCount += 1;
      }
      lastActivityAt = now();
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrorCount += 1;
    });
    page.on('requestfailed', () => {
      networkErrorCount += 1;
      lastActivityAt = now();
    });
    page.on('response', (response) => {
      if (response.status() >= 400) networkErrorCount += 1;
      lastActivityAt = now();
    });

    cdp = await context.newCDPSession(page);
    let tracingComplete;
    const traceDone = new Promise((resolveTrace) => {
      tracingComplete = resolveTrace;
    });
    cdp.on('Tracing.dataCollected', (event) => trace.push(...event.value));
    cdp.on('Tracing.tracingComplete', tracingComplete);
    cdp.on('Network.requestWillBeSent', (event) => {
      lastActivityAt = now();
      network.requestWillBeSent(event);
    });
    cdp.on('Network.dataReceived', (event) => {
      lastActivityAt = now();
      network.dataReceived(event);
    });
    cdp.on('Network.responseReceived', (event) => {
      lastActivityAt = now();
      network.responseReceived(event);
    });
    cdp.on('Network.requestServedFromCache', (event) => {
      lastActivityAt = now();
      network.requestServedFromCache(event);
    });
    cdp.on('Network.loadingFinished', (event) => {
      lastActivityAt = now();
      network.loadingFinished(event);
    });
    cdp.on('Network.loadingFailed', (event) => {
      lastActivityAt = now();
      network.loadingFailed(event);
    });
    await cdp.send('Network.enable');
    await cdp.send('Tracing.start', {
      categories: `-*,${TRACE_CATEGORIES.join(',')}`,
      transferMode: 'ReportEvents',
    });

    const capturedAtUtc = new Date().toISOString();
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30_000 });
    const loadCompletedAt = now();
    const settlement = await waitForDiagnosticSettle({
      getLastActivityAt: () => lastActivityAt,
      loadCompletedAt,
      getInFlightCount: () => (
        network.snapshot().transferOutcomes.inFlightCount
      ),
      now,
      wait: (milliseconds) => page.waitForTimeout(milliseconds),
    });
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
    await deadline(cdp.send('Tracing.end'), 'Tracing.end');
    await deadline(traceDone, 'Tracing.tracingComplete');

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
    const networkSnapshot = network.snapshot();
    const navigationRequest = networkSnapshot.resources.find(
      (record) => record.url === targetUrl,
    );
    if (!navigationRequest) throw new Error(`Missing document request for ${targetUrl}`);
    const timingByUrl = new Map(
      observed.resources.map((entry) => [entry.name, entry]),
    );
    const resources = networkSnapshot.resources
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
    if (
      transfers.transferredBytes
      !== networkSnapshot.transferOutcomes.transferredBytes
    ) {
      throw new Error(`CDP transfer reconciliation failed for ${routePath}`);
    }
    const initialScripts = resources.filter((resource) => (
      resource.type === 'Script' && resource.startMs <= react.lastCommitMs
    ));
    const postCommitScripts = resources.filter((resource) => (
      resource.type === 'Script' && resource.startMs > react.lastCommitMs
    ));
    const invalidReasons = [];
    const blockedReasons = Object.keys(blockedReasonCounts).sort();
    if (blockedRequestCount > 0) {
      invalidReasons.push('blocked_requests', ...blockedReasons);
    }
    if (settlement.reason !== 'network_quiet') {
      invalidReasons.push(settlement.reason);
    }
    return {
      sample: sampleIndex,
      capturedAtUtc,
      valid: invalidReasons.length === 0,
      invalidReasons,
      settlement,
      transferOutcomes: networkSnapshot.transferOutcomes,
      safety: {
        requestCount,
        allowedRequestCount,
        blockedRequestCount,
        blockedReasonCounts,
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
        textLeaves: lcp.textLeaves,
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
    },
    cleanup: [
      {
        label: 'CDP detach',
        run: async () => {
          if (cdp) await cdp.detach();
        },
      },
      {
        label: 'context close',
        run: () => context.close(),
      },
    ],
    deadline,
  });
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

export function lcpIdentityKey(lcp) {
  const candidate = [
    lcp.element?.tag,
    lcp.element?.text,
  ].join('|');
  const leaves = lcp.textLeaves ?? (
    lcp.paintNode ? [lcp.paintNode] : []
  );
  return [candidate, ...leaves.map((leaf) => [
    leaf.tag,
    leaf.directText ?? leaf.text,
    leaf.computedStyle?.fontFamily,
    leaf.computedStyle?.fontWeight,
    leaf.computedStyle?.fontStyle,
  ].join('|'))].join('||');
}

export function summarizeDiagnosticSamples(samples, baselineMedian) {
  const validSamples = samples.filter((sample) => sample.valid);
  const invalidReasons = [...new Set(
    samples.flatMap((sample) => sample.invalidReasons ?? []),
  )];
  const validity = {
    valid: validSamples.length > 0 && validSamples.length === samples.length,
    validSampleCount: validSamples.length,
    invalidSampleCount: samples.length - validSamples.length,
    invalidReasons,
  };
  if (validSamples.length === 0) {
    return {
      ...validity,
      metricSummary: null,
      mainThreadSummary: null,
      reactSummary: null,
      javascriptPhases: null,
      lcpIdentityConsistency: null,
      lcpIdentityKeys: [],
      representativeSample: null,
      representativeLcp: null,
      criticalRequestChain: [],
      baselineReconciliation: {
        headlineMedian: {
          ttfb: baselineMedian.ttfb,
          fcp: baselineMedian.fcp,
          lcp: baselineMedian.lcp,
          load: baselineMedian.load,
          requestCount: baselineMedian.requestCount,
          transferredBytes: baselineMedian.transferredBytes,
        },
        diagnosticMedian: null,
        requestCountExactMatch: false,
        transferredBytesExactMatch: false,
      },
    };
  }
  const metricKeys = Object.keys(validSamples[0].metrics);
  const mainThreadKeys = Object.keys(validSamples[0].mainThread);
  const reactKeys = [
    'rendererInjectMs',
    'firstCommitMs',
    'lastCommitMs',
    'commitCount',
    'injectToFirstCommitMs',
    'injectToLastCommitMs',
  ];
  const representative = selectRepresentativeSample(validSamples);
  const metricSummary = numericSummary(validSamples, 'metrics', metricKeys);
  const identities = validSamples.map((sample) => lcpIdentityKey(sample.lcp));
  return {
    ...validity,
    metricSummary,
    mainThreadSummary: numericSummary(
      validSamples,
      'mainThread',
      mainThreadKeys,
    ),
    reactSummary: numericSummary(validSamples, 'react', reactKeys),
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
    invalidReasons: sample.invalidReasons,
    settlement: sample.settlement,
    transferOutcomes: sample.transferOutcomes,
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
  deadline = (promise, label) => withDiagnosticDeadline(promise, { label }),
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
  const report = await runWithBoundedCleanup({
    operation: async () => {
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
            deadline,
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
        version: 2,
        grain: 'route × viewport × sample',
        samplesPerViewport: samples,
        viewportOrder: DIAGNOSTIC_VIEWPORTS,
        timingUnits: 'milliseconds from navigationStart',
        transferUnits: 'shared Task 1 CDP accumulator: per-hop maximum of partial and terminal encoded bytes, cached hops zero, terminal events deduplicated',
        traceCategories: TRACE_CATEGORIES,
        boundedWindow: {
          starts: 'before navigation',
          ends: 'one second of zero CDP in-flight network activity after load',
          maximumMs: DIAGNOSTIC_MAX_SETTLE_MS,
          operationTimeoutMs: DIAGNOSTIC_OPERATION_TIMEOUT_MS,
        },
        hydrationMethod: {
          boundary: 'React DevTools hook renderer injection through last initial commit before bounded network settlement',
          cost: 'union of non-overlapping renderer-main scripting events in that boundary',
          interpretation: 'diagnostic upper-bound proxy for hydration plus immediate client effects; not a React profiler duration and not a replacement for headline harness timings',
        },
        criticalChainMethod: {
          blockingStatus: 'PerformanceResourceTiming.renderBlockingStatus',
          lcpIdentity: 'authoritative buffered LargestContentfulPaint candidate plus every direct text-bearing descendant and computed style',
          resources: 'CDP type/status/encoded bytes joined to Resource Timing start/duration/initiator',
        },
        safety: {
          target: 'exact http://127.0.0.1:3300 origin for every request and redirect hop',
          mainFramePaths: DIAGNOSTIC_ROUTES,
          statefulUrls: 'credentials blocked for every request; query strings and fragments blocked for navigation requests',
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
    return report;
    },
    cleanup: [{
      label: 'browser close',
      run: () => browser.close(),
    }],
    deadline,
  });
  await writeDiagnosticOutput(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
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
