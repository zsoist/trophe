import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createDiagnosticNetworkAccumulator,
  createDiagnosticRouteHandler,
  collectLcpTextLeaves,
  collectDiagnosticSample,
  lcpFontCandidate,
  lcpIdentityKey,
  runWithBoundedCleanup,
  isDiagnosticReadOnlyMethod,
  mergedDurationMs,
  parseDiagnosticCliArgs,
  selectCriticalRequestChain,
  selectRepresentativeSample,
  summarizeDiagnosticSamples,
  summarizeResourceTransfers,
  validatedDiagnosticOutputPath,
  validatedLoopbackTarget,
  waitForDiagnosticSettle,
  withDiagnosticDeadline,
  writeDiagnosticOutput,
} from '../../scripts/perf/collect-local-bottlenecks.mjs';

type DiagnosticRequestFixture = {
  method: () => string;
  url: () => string;
  isNavigationRequest: () => boolean;
  frame: () => { parentFrame: () => object | null };
};

type FixtureEventHandler = (value: unknown) => void;
type DiagnosticRouteFixture = {
  request: () => DiagnosticRequestFixture;
  continue: () => Promise<void>;
  abort: () => Promise<void>;
};

function requestFixture({
  method = 'GET',
  url,
  navigation = false,
  mainFrame = false,
}: {
  method?: string;
  url: string;
  navigation?: boolean;
  mainFrame?: boolean;
}): DiagnosticRequestFixture {
  return {
    method: () => method,
    url: () => url,
    isNavigationRequest: () => navigation,
    frame: () => ({ parentFrame: () => mainFrame ? null : {} }),
  };
}

async function applyDiagnosticRoute(request: DiagnosticRequestFixture) {
  let outcome: 'continued' | 'aborted' | undefined;
  const blockedReasons: string[] = [];
  const handler = createDiagnosticRouteHandler({
    onBlocked: (reason: string) => { blockedReasons.push(reason); },
  });
  await handler({
    request: () => request,
    continue: async () => { outcome = 'continued'; },
    abort: async () => { outcome = 'aborted'; },
  });
  return { outcome, blockedReasons };
}

function diagnosticBrowserFixture({
  includeExternalRequest = false,
  completeTrace = true,
  navigationError,
  detachError,
  contextCloseHangs = false,
}: {
  includeExternalRequest?: boolean;
  completeTrace?: boolean;
  navigationError?: Error;
  detachError?: Error;
  contextCloseHangs?: boolean;
} = {}) {
  let elapsed = 0;
  let contextClosed = false;
  const pageHandlers = new Map<string, FixtureEventHandler>();
  const cdpHandlers = new Map<string, FixtureEventHandler>();
  let routeHandler: ((route: DiagnosticRouteFixture) => Promise<void>) | undefined;
  const mainFrame = { parentFrame: () => null };
  const childFrame = { parentFrame: () => mainFrame };
  const localRequest = requestFixture({
    url: 'http://127.0.0.1:3300/',
    navigation: true,
    mainFrame: true,
  });
  const externalRequest = {
    ...requestFixture({
      url: 'https://external.invalid/collect',
    }),
    frame: () => childFrame,
  };
  const routeFor = (request: DiagnosticRequestFixture) => ({
    request: () => request,
    continue: async () => {},
    abort: async () => { pageHandlers.get('requestfailed')?.(request); },
  });
  const page = {
    addInitScript: async () => {},
    on: (event: string, handler: FixtureEventHandler) => {
      pageHandlers.set(event, handler);
    },
    goto: async () => {
      pageHandlers.get('request')?.(localRequest);
      await routeHandler?.(routeFor(localRequest));
      cdpHandlers.get('Network.requestWillBeSent')?.({
        requestId: 'document',
        request: { url: 'http://127.0.0.1:3300/' },
        type: 'Document',
        initiator: { type: 'other' },
        timestamp: 1,
      });
      cdpHandlers.get('Network.responseReceived')?.({
        requestId: 'document',
        type: 'Document',
        response: { status: 200, mimeType: 'text/html' },
      });
      cdpHandlers.get('Network.loadingFinished')?.({
        requestId: 'document',
        encodedDataLength: 100,
        timestamp: 1.003,
      });
      if (includeExternalRequest) {
        pageHandlers.get('request')?.(externalRequest);
        await routeHandler?.(routeFor(externalRequest));
      }
      if (navigationError) throw navigationError;
    },
    waitForTimeout: async (milliseconds: number) => { elapsed += milliseconds; },
    evaluate: async () => ({
      traceEndMs: 1_000,
      navigation: {
        responseStart: 3,
        loadEventEnd: 50,
        decodedBodySize: 500,
      },
      fcp: 60,
      resources: [],
      diagnostic: {
        lcp: {
          startTime: 60,
          renderTime: 60,
          loadTime: 0,
          size: 10_000,
          url: null,
          element: { tag: 'P', text: 'candidate' },
          textLeaves: [{
            tag: 'P',
            directText: 'candidate',
            computedStyle: {
              fontFamily: 'Inter',
              fontWeight: '400',
              fontStyle: 'normal',
            },
          }],
        },
        react: {
          renderer: {
            injectTime: 30,
            version: '19.2.4',
            packageName: 'react-dom',
          },
          commits: [{
            time: 45,
            didError: false,
            isDehydrated: false,
          }],
        },
      },
    }),
  };
  const cdp = {
    on: (event: string, handler: FixtureEventHandler) => {
      cdpHandlers.set(event, handler);
    },
    send: async (command: string) => {
      if (command === 'Tracing.start') {
        cdpHandlers.get('Tracing.dataCollected')?.({
          value: [{
            name: 'navigationStart',
            pid: 1,
            tid: 1,
            ts: 0,
            args: {
              data: {
                isOutermostMainFrame: true,
                documentLoaderURL: 'http://127.0.0.1:3300/',
              },
            },
          }],
        });
      }
      if (command === 'Tracing.end') {
        if (completeTrace) cdpHandlers.get('Tracing.tracingComplete')?.({});
      }
    },
    detach: async () => {
      if (detachError) throw detachError;
    },
  };
  const context = {
    route: async (_pattern: string, handler: typeof routeHandler) => {
      routeHandler = handler;
    },
    routeWebSocket: async () => {},
    newPage: async () => page,
    newCDPSession: async () => cdp,
    close: async () => {
      contextClosed = true;
      if (contextCloseHangs) return new Promise(() => {});
    },
  };
  return {
    browser: { newContext: async () => context },
    now: () => elapsed,
    contextClosed: () => contextClosed,
  };
}

function diagnosticSample({
  sample,
  lcpMs,
  valid = true,
  invalidReasons = [],
}: {
  sample: number;
  lcpMs: number;
  valid?: boolean;
  invalidReasons?: string[];
}) {
  return {
    sample,
    valid,
    invalidReasons,
    metrics: {
      ttfbMs: 3,
      fcpMs: lcpMs,
      lcpMs,
      loadMs: 50,
      requestCount: 4,
      transferredBytes: 1_000,
      documentTransferBytes: 100,
      renderBlockingTransferBytes: 200,
      javascriptTransferBytes: 300,
      cssTransferBytes: 200,
      fontTransferBytes: 400,
      fetchTransferBytes: 0,
      otherTransferBytes: 0,
      preloadedFontTransferBytes: 400,
      initialJavascriptRequestCount: 1,
      initialJavascriptTransferBytes: 300,
      postReactCommitJavascriptRequestCount: 0,
      postReactCommitJavascriptTransferBytes: 0,
    },
    mainThread: {
      traceWindowMs: 1_100,
      mainThreadBusyToSettleMs: 70,
      mainThreadBusyToLcpMs: 40,
      scriptingToSettleMs: 30,
      scriptingToLcpMs: 20,
      scriptingDuringReactWindowMs: 15,
      styleLayoutToSettleMs: 10,
      paintToSettleMs: 5,
      parseHtmlMs: 1,
      longestMainThreadTaskMs: 12,
      mainThreadTasksOver50Ms: 0,
    },
    react: {
      rendererInjectMs: 30,
      firstCommitMs: 45,
      lastCommitMs: 50,
      commitCount: 4,
      injectToFirstCommitMs: 15,
      injectToLastCommitMs: 20,
    },
    lcp: {
      startTimeMs: lcpMs,
      renderTimeMs: lcpMs,
      loadTimeMs: 0,
      sizePx2: 10_000,
      url: null,
      resourceTransferBytes: 0,
      element: { tag: 'P', text: 'candidate' },
      textLeaves: [{
        tag: 'P',
        text: 'candidate',
        computedStyle: {
          fontFamily: 'Inter',
          fontWeight: '400',
          fontStyle: 'normal',
        },
      }],
    },
    resources: [{
      url: '/',
      relevance: ['navigation_document'],
    }],
  };
}

describe('local bottleneck collector reducers', () => {
  it('retains every direct text-bearing leaf and style under the LCP candidate', () => {
    const headingText = { nodeType: 3, textContent: 'Track smarter. ' };
    const serifText = { nodeType: 3, textContent: 'Eat better.' };
    const serifSpan = {
      tagName: 'SPAN',
      id: '',
      className: 'display-hero',
      textContent: 'Eat better.',
      childNodes: [serifText],
      querySelectorAll: () => [],
    };
    const heading = {
      tagName: 'H1',
      id: '',
      className: 'hero',
      textContent: 'Track smarter. Eat better.',
      childNodes: [headingText, serifSpan],
      querySelectorAll: () => [serifSpan],
    };
    const styles = new Map<object, CSSStyleDeclaration>([
      [heading, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '60px',
        fontWeight: '700',
        fontStyle: 'normal',
        backgroundImage: 'none',
      } as CSSStyleDeclaration],
      [serifSpan, {
        fontFamily: '"Instrument Serif", serif',
        fontSize: '60px',
        fontWeight: '400',
        fontStyle: 'italic',
        backgroundImage: 'none',
      } as CSSStyleDeclaration],
    ]);

    const leaves = collectLcpTextLeaves(
      heading,
      (element: object) => styles.get(element) as CSSStyleDeclaration,
      3,
    );

    expect(leaves).toEqual([
      {
        tag: 'H1',
        id: null,
        className: 'hero',
        text: 'Track smarter. Eat better.',
        directText: 'Track smarter.',
        computedStyle: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '60px',
          fontWeight: '700',
          fontStyle: 'normal',
          backgroundImage: 'none',
        },
      },
      {
        tag: 'SPAN',
        id: null,
        className: 'display-hero',
        text: 'Eat better.',
        directText: 'Eat better.',
        computedStyle: {
          fontFamily: '"Instrument Serif", serif',
          fontSize: '60px',
          fontWeight: '400',
          fontStyle: 'italic',
          backgroundImage: 'none',
        },
      },
    ]);
  });

  it('attributes both fonts used by a mixed-font authoritative LCP candidate', () => {
    const lcp = {
      element: { tag: 'H1', text: 'Track smarter. Eat better.' },
      textLeaves: [
        {
          tag: 'H1',
          directText: 'Track smarter.',
          computedStyle: {
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
          },
        },
        {
          tag: 'SPAN',
          directText: 'Eat better.',
          computedStyle: {
            fontFamily: '"Instrument Serif", serif',
            fontStyle: 'italic',
          },
        },
      ],
    };
    const resources = [
      { fontFace: 'Inter Latin' },
      { fontFace: 'Instrument Serif italic Latin' },
      { fontFace: 'Instrument Serif normal Latin' },
      { fontFace: 'JetBrains Mono Latin' },
    ];

    expect(resources.filter((resource) => (
      lcpFontCandidate(resource, lcp)
    )).map((resource) => resource.fontFace)).toEqual([
      'Inter Latin',
      'Instrument Serif italic Latin',
    ]);
    expect(lcpIdentityKey(lcp)).toContain('Track smarter.');
    expect(lcpIdentityKey(lcp)).toContain('Eat better.');
    expect(lcpIdentityKey(lcp)).toContain('Inter, sans-serif');
    expect(lcpIdentityKey(lcp)).toContain('"Instrument Serif", serif');
  });

  it('keeps resource-type and blocking transfer totals mutually reconcilable', () => {
    const resources = [
      {
        type: 'Document',
        transferBytes: 1_000,
        renderBlockingStatus: 'navigation',
        initiatorType: 'navigation',
      },
      {
        type: 'Stylesheet',
        transferBytes: 200,
        renderBlockingStatus: 'blocking',
        initiatorType: 'link',
      },
      {
        type: 'Script',
        transferBytes: 300,
        renderBlockingStatus: 'non-blocking',
        initiatorType: 'script',
      },
      {
        type: 'Font',
        transferBytes: 400,
        renderBlockingStatus: 'non-blocking',
        initiatorType: 'link',
      },
      {
        type: 'Font',
        transferBytes: 500,
        renderBlockingStatus: 'non-blocking',
        initiatorType: 'css',
      },
      {
        type: 'Script',
        transferBytes: 0,
        renderBlockingStatus: 'non-blocking',
        initiatorType: 'script',
      },
      {
        type: 'Fetch',
        transferBytes: 600,
        renderBlockingStatus: 'non-blocking',
        initiatorType: 'fetch',
      },
      {
        type: 'Image',
        transferBytes: 100,
        renderBlockingStatus: 'non-blocking',
        initiatorType: 'img',
      },
    ];

    expect(summarizeResourceTransfers(resources)).toEqual({
      transferredBytes: 3_100,
      documentTransferBytes: 1_000,
      renderBlockingTransferBytes: 200,
      javascriptTransferBytes: 300,
      cssTransferBytes: 200,
      fontTransferBytes: 900,
      fetchTransferBytes: 600,
      otherTransferBytes: 100,
      preloadedFontTransferBytes: 400,
    });
  });

  it('unions nested renderer-main intervals and clips them to the bounded window', () => {
    const traceEvents = [
      { ph: 'X', ts: 10_000, dur: 10_000 },
      { ph: 'X', ts: 12_000, dur: 5_000 },
      { ph: 'X', ts: 19_000, dur: 10_000 },
      { ph: 'X', ts: 40_000, dur: 10_000 },
      { ph: 'I', ts: 20_000, dur: 100_000 },
    ];

    expect(mergedDurationMs(traceEvents, 0, 45_000)).toBe(24);
  });

  it('selects the median-LCP sample and only its measured critical chain', () => {
    const samples = [
      { sample: 1, metrics: { lcpMs: 90 } },
      { sample: 2, metrics: { lcpMs: 60 } },
      { sample: 3, metrics: { lcpMs: 120 } },
    ];
    const resources = [
      { url: '/', relevance: ['navigation_document'] },
      { url: '/blocking.css', relevance: ['browser_reported_render_blocking'] },
      { url: '/hero.webp', relevance: ['lcp_resource'] },
      { url: '/hero.woff2', relevance: ['lcp_font_family_candidate'] },
      { url: '/app.js', relevance: ['deferred_client_boot_hydration'] },
    ];

    expect(selectRepresentativeSample(samples)).toEqual(samples[0]);
    expect(selectCriticalRequestChain(resources).map(
      (resource: { url: string }) => resource.url,
    ))
      .toEqual(['/', '/blocking.css', '/hero.webp', '/hero.woff2']);
  });

  it('accounts redirect hops and partial failures once without duplication', () => {
    const network = createDiagnosticNetworkAccumulator();
    network.requestWillBeSent({
      requestId: 'redirect',
      request: { url: 'http://127.0.0.1:3300/' },
      type: 'Document',
      initiator: { type: 'other' },
      timestamp: 1,
    });
    network.dataReceived({ requestId: 'redirect', encodedDataLength: 80 });
    network.requestWillBeSent({
      requestId: 'redirect',
      request: { url: 'http://127.0.0.1:3300/login' },
      type: 'Document',
      initiator: { type: 'redirect' },
      timestamp: 2,
      redirectResponse: {
        url: 'http://127.0.0.1:3300/',
        encodedDataLength: 100,
        status: 302,
        mimeType: 'text/html',
      },
    });
    network.dataReceived({ requestId: 'redirect', encodedDataLength: 150 });
    network.loadingFinished({
      requestId: 'redirect',
      encodedDataLength: 200,
      timestamp: 3,
    });
    network.requestWillBeSent({
      requestId: 'partial',
      request: { url: 'http://127.0.0.1:3300/partial.js' },
      type: 'Script',
      initiator: { type: 'script' },
      timestamp: 4,
    });
    network.dataReceived({ requestId: 'partial', encodedDataLength: 50 });
    network.dataReceived({ requestId: 'partial', encodedDataLength: 70 });
    network.loadingFailed({ requestId: 'partial', timestamp: 5 });

    expect(network.snapshot()).toMatchObject({
      transferOutcomes: {
        transferredBytes: 420,
        completedCount: 1,
        cachedCount: 0,
        failedCount: 1,
        inFlightCount: 0,
      },
      resources: [
        {
          url: 'http://127.0.0.1:3300/',
          transferBytes: 100,
          status: 302,
          failed: false,
          servedFromCache: false,
        },
        {
          url: 'http://127.0.0.1:3300/login',
          transferBytes: 200,
          failed: false,
          servedFromCache: false,
        },
        {
          url: 'http://127.0.0.1:3300/partial.js',
          transferBytes: 120,
          failed: true,
          servedFromCache: false,
        },
      ],
    });
  });

  it('resets a cached redirect before its final network hop', () => {
    const network = createDiagnosticNetworkAccumulator();
    network.requestWillBeSent({
      requestId: 'cached-redirect',
      request: { url: 'http://127.0.0.1:3300/' },
      type: 'Document',
      initiator: { type: 'other' },
      timestamp: 1,
    });
    network.requestServedFromCache({ requestId: 'cached-redirect' });
    network.requestWillBeSent({
      requestId: 'cached-redirect',
      request: { url: 'http://127.0.0.1:3300/login' },
      type: 'Document',
      initiator: { type: 'redirect' },
      timestamp: 2,
      redirectResponse: {
        url: 'http://127.0.0.1:3300/',
        encodedDataLength: 0,
        status: 302,
        mimeType: 'text/html',
      },
    });
    network.dataReceived({
      requestId: 'cached-redirect',
      encodedDataLength: 200,
    });
    network.loadingFinished({
      requestId: 'cached-redirect',
      encodedDataLength: 250,
      timestamp: 3,
    });

    expect(network.snapshot()).toMatchObject({
      transferOutcomes: {
        transferredBytes: 250,
        completedCount: 1,
        cachedCount: 1,
        failedCount: 0,
        inFlightCount: 0,
      },
      resources: [
        { transferBytes: 0, servedFromCache: true },
        { transferBytes: 250, servedFromCache: false },
      ],
    });
  });

  it('scopes cache state to the final hop of a network redirect', () => {
    const network = createDiagnosticNetworkAccumulator();
    network.requestWillBeSent({
      requestId: 'network-redirect',
      request: { url: 'http://127.0.0.1:3300/' },
      type: 'Document',
      initiator: { type: 'other' },
      timestamp: 1,
    });
    network.dataReceived({
      requestId: 'network-redirect',
      encodedDataLength: 80,
    });
    network.requestWillBeSent({
      requestId: 'network-redirect',
      request: { url: 'http://127.0.0.1:3300/login' },
      type: 'Document',
      initiator: { type: 'redirect' },
      timestamp: 2,
      redirectResponse: {
        url: 'http://127.0.0.1:3300/',
        encodedDataLength: 100,
        status: 302,
        mimeType: 'text/html',
      },
    });
    network.requestServedFromCache({ requestId: 'network-redirect' });
    network.loadingFinished({
      requestId: 'network-redirect',
      encodedDataLength: 0,
      timestamp: 3,
    });

    expect(network.snapshot()).toMatchObject({
      transferOutcomes: {
        transferredBytes: 100,
        completedCount: 0,
        cachedCount: 1,
        failedCount: 0,
        inFlightCount: 0,
      },
      resources: [
        { transferBytes: 100, servedFromCache: false },
        { transferBytes: 0, servedFromCache: true },
      ],
    });
  });

  it('ignores duplicate terminal events while retaining cached and failed outcomes', () => {
    const network = createDiagnosticNetworkAccumulator();
    network.requestWillBeSent({
      requestId: 'complete',
      request: { url: 'http://127.0.0.1:3300/app.js' },
      type: 'Script',
      initiator: { type: 'script' },
      timestamp: 1,
    });
    network.loadingFinished({
      requestId: 'complete',
      encodedDataLength: 512,
      timestamp: 2,
    });
    network.loadingFinished({
      requestId: 'complete',
      encodedDataLength: 512,
      timestamp: 2,
    });
    network.requestWillBeSent({
      requestId: 'cache',
      request: { url: 'http://127.0.0.1:3300/cached.js' },
      type: 'Script',
      initiator: { type: 'script' },
      timestamp: 3,
    });
    network.requestServedFromCache({ requestId: 'cache' });
    network.loadingFinished({
      requestId: 'cache',
      encodedDataLength: 0,
      timestamp: 4,
    });
    network.requestWillBeSent({
      requestId: 'failed',
      request: { url: 'http://127.0.0.1:3300/failed.js' },
      type: 'Script',
      initiator: { type: 'script' },
      timestamp: 5,
    });
    network.loadingFailed({ requestId: 'failed', timestamp: 6 });

    expect(network.snapshot().transferOutcomes).toEqual({
      transferredBytes: 512,
      completedCount: 1,
      cachedCount: 1,
      failedCount: 1,
      inFlightCount: 0,
    });
    expect(network.snapshot().resources).toHaveLength(3);
  });

  it('excludes invalid samples from every diagnostic summary and representative', () => {
    const valid = diagnosticSample({ sample: 1, lcpMs: 60 });
    const invalid = diagnosticSample({
      sample: 2,
      lcpMs: 9_999,
      valid: false,
      invalidReasons: ['blocked_external_origin'],
    });

    expect(summarizeDiagnosticSamples(
      [valid, invalid],
      {
        ttfb: 3,
        fcp: 60,
        lcp: 60,
        load: 50,
        requestCount: 4,
        transferredBytes: 1_000,
      },
    )).toMatchObject({
      valid: false,
      validSampleCount: 1,
      invalidSampleCount: 1,
      invalidReasons: ['blocked_external_origin'],
      metricSummary: { lcpMs: { median: 60, worst: 60 } },
      representativeSample: 1,
      representativeLcp: { startTimeMs: 60 },
    });
  });

  it('returns null diagnostic summaries when every sample is invalid', () => {
    const summary = summarizeDiagnosticSamples([
      diagnosticSample({
        sample: 1,
        lcpMs: 9_999,
        valid: false,
        invalidReasons: ['max_settle_reached'],
      }),
    ], {
      ttfb: 3,
      fcp: 60,
      lcp: 60,
      load: 50,
      requestCount: 4,
      transferredBytes: 1_000,
    });

    expect(summary).toMatchObject({
      valid: false,
      validSampleCount: 0,
      invalidSampleCount: 1,
      invalidReasons: ['max_settle_reached'],
      metricSummary: null,
      mainThreadSummary: null,
      reactSummary: null,
      javascriptPhases: null,
      representativeSample: null,
      representativeLcp: null,
      criticalRequestChain: [],
    });
  });

  it('starts the quiet interval no earlier than load completion', async () => {
    let elapsed = 2_000;
    const settlement = await waitForDiagnosticSettle({
      getLastActivityAt: () => 500,
      loadCompletedAt: 2_000,
      getInFlightCount: () => 0,
      now: () => elapsed,
      wait: async (milliseconds: number) => { elapsed += milliseconds; },
    });

    expect(elapsed).toBe(3_000);
    expect(settlement).toEqual({
      reason: 'network_quiet',
      durationMs: 1_000,
      remainingInFlightCount: 0,
    });
  });

  it.each(['Tracing.end', 'Tracing.tracingComplete'])(
    'times out a missing %s completion deterministically',
    async (label) => {
      await expect(withDiagnosticDeadline(
        new Promise(() => {}),
        {
          label,
          timeoutMs: 5_000,
          setTimer: ((callback: () => void) => {
            callback();
            return setTimeout(() => {}, 60_000);
          }) as typeof setTimeout,
          clearTimer: clearTimeout,
        },
      )).rejects.toThrow(`${label} timed out after 5000 ms`);
    },
  );

  it('preserves a primary error while bounding detach and closing context', async () => {
    const cleanupOrder: string[] = [];
    await expect(runWithBoundedCleanup({
      operation: async () => {
        throw new Error('measurement failed');
      },
      cleanup: [
        {
          label: 'CDP detach',
          run: async () => {
            cleanupOrder.push('detach');
            throw new Error('detach failed');
          },
        },
        {
          label: 'context close',
          run: async () => { cleanupOrder.push('context'); },
        },
      ],
      deadline: async (promise: Promise<unknown>) => promise,
    })).rejects.toThrow('measurement failed');
    expect(cleanupOrder).toEqual(['detach', 'context']);
  });

  it('bounds context and browser cleanup and reports the first cleanup failure', async () => {
    const cleanupOrder: string[] = [];
    await expect(runWithBoundedCleanup({
      operation: async () => 'complete',
      cleanup: [
        {
          label: 'context close',
          run: () => new Promise(() => {}),
        },
        {
          label: 'browser close',
          run: async () => { cleanupOrder.push('browser'); },
        },
      ],
      deadline: async (promise: Promise<unknown>, label: string) => {
        if (label === 'context close') {
          throw new Error('context close timed out after 5000 ms');
        }
        return promise;
      },
    })).rejects.toThrow('context close timed out after 5000 ms');
    expect(cleanupOrder).toEqual(['browser']);
  });
});

describe('local bottleneck collector safety boundaries', () => {
  it('bounds missing tracing completion and still closes the context', async () => {
    const fixture = diagnosticBrowserFixture({ completeTrace: false });
    await expect(collectDiagnosticSample(fixture.browser, {
      baseUrl: 'http://127.0.0.1:3300/',
      routePath: '/',
      viewport: { name: 'mobile', width: 390, height: 844 },
      sampleIndex: 1,
      now: fixture.now,
      deadline: async (promise: Promise<unknown>, label: string) => {
        if (label === 'Tracing.tracingComplete') {
          throw new Error('Tracing.tracingComplete timed out after 5000 ms');
        }
        return promise;
      },
    })).rejects.toThrow('Tracing.tracingComplete timed out after 5000 ms');
    expect(fixture.contextClosed()).toBe(true);
  });

  it('preserves navigation failure when detach also fails', async () => {
    const fixture = diagnosticBrowserFixture({
      navigationError: new Error('navigation failed'),
      detachError: new Error('detach failed'),
    });
    await expect(collectDiagnosticSample(fixture.browser, {
      baseUrl: 'http://127.0.0.1:3300/',
      routePath: '/',
      viewport: { name: 'mobile', width: 390, height: 844 },
      sampleIndex: 1,
      now: fixture.now,
      deadline: async (promise: Promise<unknown>) => promise,
    })).rejects.toThrow('navigation failed');
    expect(fixture.contextClosed()).toBe(true);
  });

  it('bounds a stuck context close after a successful sample', async () => {
    const fixture = diagnosticBrowserFixture({ contextCloseHangs: true });
    await expect(collectDiagnosticSample(fixture.browser, {
      baseUrl: 'http://127.0.0.1:3300/',
      routePath: '/',
      viewport: { name: 'mobile', width: 390, height: 844 },
      sampleIndex: 1,
      now: fixture.now,
      deadline: async (promise: Promise<unknown>, label: string) => {
        if (label === 'context close') {
          throw new Error('context close timed out after 5000 ms');
        }
        return promise;
      },
    })).rejects.toThrow('context close timed out after 5000 ms');
    expect(fixture.contextClosed()).toBe(true);
  });

  it('invalidates a real diagnostic sample when an external request is blocked', async () => {
    const fixture = diagnosticBrowserFixture({ includeExternalRequest: true });
    const sample = await collectDiagnosticSample(fixture.browser, {
      baseUrl: 'http://127.0.0.1:3300/',
      routePath: '/',
      viewport: { name: 'mobile', width: 390, height: 844 },
      sampleIndex: 1,
      now: fixture.now,
      deadline: async (promise: Promise<unknown>) => promise,
    });

    expect(sample).toMatchObject({
      valid: false,
      invalidReasons: ['blocked_requests', 'blocked_external_origin'],
      safety: {
        requestCount: 2,
        allowedRequestCount: 1,
        blockedRequestCount: 1,
        blockedReasonCounts: { blocked_external_origin: 1 },
      },
    });
    expect(fixture.contextClosed()).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'blocks an external %s subresource before continuation',
    async (method) => {
      await expect(applyDiagnosticRoute(requestFixture({
        method,
        url: 'https://external.invalid/collect',
      }))).resolves.toEqual({
        outcome: 'aborted',
        blockedReasons: ['blocked_external_origin'],
      });
    },
  );

  it('blocks an external main-frame redirect before continuation', async () => {
    await expect(applyDiagnosticRoute(requestFixture({
      url: 'https://external.invalid/redirected',
      navigation: true,
      mainFrame: true,
    }))).resolves.toEqual({
      outcome: 'aborted',
      blockedReasons: ['blocked_external_origin'],
    });
  });

  it.each([
    ['http://user:secret@127.0.0.1:3300/app.js', 'blocked_credentials'],
  ])('blocks credential-bearing local subresource %s with a fixed reason', async (
    url,
    reason,
  ) => {
    await expect(applyDiagnosticRoute(requestFixture({ url }))).resolves.toEqual({
      outcome: 'aborted',
      blockedReasons: [reason],
    });
  });

  it.each([
    'http://127.0.0.1:3300/?_rsc=abc123',
    'http://127.0.0.1:3300/login?_rsc=abc123',
  ])('allows an exact-origin non-navigation RSC request %s', async (url) => {
    await expect(applyDiagnosticRoute(requestFixture({ url }))).resolves.toEqual({
      outcome: 'continued',
      blockedReasons: [],
    });
  });

  it.each([
    ['http://127.0.0.1:3300/login?state=1', 'blocked_query'],
    ['http://127.0.0.1:3300/login#state', 'blocked_fragment'],
  ])('blocks stateful main-frame navigation %s with a fixed reason', async (
    url,
    reason,
  ) => {
    await expect(applyDiagnosticRoute(requestFixture({
      url,
      navigation: true,
      mainFrame: true,
    }))).resolves.toEqual({
      outcome: 'aborted',
      blockedReasons: [reason],
    });
  });

  it('allows only approved main-frame paths on the exact loopback origin', async () => {
    await expect(applyDiagnosticRoute(requestFixture({
      url: 'http://127.0.0.1:3300/login',
      navigation: true,
      mainFrame: true,
    }))).resolves.toEqual({
      outcome: 'continued',
      blockedReasons: [],
    });
    await expect(applyDiagnosticRoute(requestFixture({
      url: 'http://127.0.0.1:3300/private',
      navigation: true,
      mainFrame: true,
    }))).resolves.toEqual({
      outcome: 'aborted',
      blockedReasons: ['blocked_main_frame_path'],
    });
  });

  it('allows read-only preflight but rejects mutating methods', () => {
    expect(isDiagnosticReadOnlyMethod('GET')).toBe(true);
    expect(isDiagnosticReadOnlyMethod('HEAD')).toBe(true);
    expect(isDiagnosticReadOnlyMethod('OPTIONS')).toBe(true);
    expect(isDiagnosticReadOnlyMethod('POST')).toBe(false);
    expect(isDiagnosticReadOnlyMethod('DELETE')).toBe(false);
  });

  it('accepts only credential-free loopback HTTP targets without query state', () => {
    expect(validatedLoopbackTarget('http://127.0.0.1:3300/').toString())
      .toBe('http://127.0.0.1:3300/');
    expect(validatedLoopbackTarget('http://127.0.0.1:3300/login').toString())
      .toBe('http://127.0.0.1:3300/login');

    expect(() => validatedLoopbackTarget('https://trophe.app')).toThrow(/loopback/i);
    expect(() => validatedLoopbackTarget('http://user:secret@127.0.0.1:3300'))
      .toThrow(/credentials/i);
    expect(() => validatedLoopbackTarget('http://127.0.0.1:3300/?mode=write'))
      .toThrow(/query|fragment/i);
    expect(() => validatedLoopbackTarget('file:///tmp/page.html')).toThrow(/loopback/i);
  });

  it('restricts diagnostic output to a unique temporary trace directory', () => {
    expect(validatedDiagnosticOutputPath(
      '/tmp/trophe-bottleneck-trace.Ab12/local-bottlenecks.json',
    )).toBe('/tmp/trophe-bottleneck-trace.Ab12/local-bottlenecks.json');

    expect(() => validatedDiagnosticOutputPath(
      '/tmp/local-bottlenecks.json',
    )).toThrow(/trace directory/i);
    expect(() => validatedDiagnosticOutputPath(
      'docs/quality/performance-local-baseline.json',
    )).toThrow(/trace directory/i);
    expect(() => validatedDiagnosticOutputPath(
      '/tmp/trophe-bottleneck-trace.Ab12/../escape.json',
    )).toThrow(/trace directory/i);
  });

  it('creates output exclusively and preserves the first report', async () => {
    const directory = await mkdtemp('/tmp/trophe-bottleneck-trace.');
    const output = `${directory}/report.json`;
    try {
      await writeDiagnosticOutput(output, 'first report\n');
      await expect(writeDiagnosticOutput(output, 'second report\n'))
        .rejects.toThrow(/exist|exclusive/i);
      await expect(readFile(output, 'utf8')).resolves.toBe('first report\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a symlink trace directory before opening output', async () => {
    const realDirectory = await mkdtemp('/tmp/trophe-bottleneck-real.');
    const linkDirectory = `/tmp/trophe-bottleneck-trace.Link${process.pid}${Date.now()}`;
    await symlink(realDirectory, linkDirectory, 'dir');
    try {
      await expect(writeDiagnosticOutput(
        `${linkDirectory}/report.json`,
        'report\n',
      )).rejects.toThrow(/symlink/i);
    } finally {
      await rm(linkDirectory, { force: true });
      await rm(realDirectory, { recursive: true, force: true });
    }
  });

  it('rejects an existing symlink output without touching its target', async () => {
    const directory = await mkdtemp('/tmp/trophe-bottleneck-trace.');
    const external = `/tmp/trophe-bottleneck-target.${process.pid}.${Date.now()}.json`;
    const output = `${directory}/report.json`;
    await writeFile(external, 'external sentinel\n');
    await symlink(external, output);
    try {
      await expect(writeDiagnosticOutput(output, 'report\n'))
        .rejects.toThrow(/symlink|exist|exclusive/i);
      await expect(readFile(external, 'utf8')).resolves
        .toBe('external sentinel\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(external, { force: true });
    }
  });

  it('validates CLI target, output, and sample bounds before browser creation', () => {
    expect(parseDiagnosticCliArgs([
      '--url', 'http://127.0.0.1:3300',
      '--output', '/tmp/trophe-bottleneck-trace.Ab12/local.json',
      '--samples', '3',
    ])).toEqual({
      baseUrl: 'http://127.0.0.1:3300/',
      output: '/tmp/trophe-bottleneck-trace.Ab12/local.json',
      samples: 3,
    });

    expect(() => parseDiagnosticCliArgs([
      '--url', 'http://127.0.0.1:3300',
      '--output', '/tmp/trophe-bottleneck-trace.Ab12/local.json',
      '--samples', '0',
    ])).toThrow(/samples/i);
    expect(() => parseDiagnosticCliArgs([
      '--url', 'http://127.0.0.1:3300',
      '--output', '/tmp/trophe-bottleneck-trace.Ab12/local.json',
      '--samples', '3',
      '--click-login',
    ])).toThrow(/unknown/i);
  });
});
