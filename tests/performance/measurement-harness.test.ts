import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateCls,
  calculateReport,
  calculateThemePerformanceReport,
  collectSample,
  createTransferAccumulator,
  MAX_THEME_NAVIGATION_REGRESSION_RATIO,
  isReadOnlyMethod,
  MAX_SETTLE_MS,
  measureUrl,
  parseCliArgs,
  runMeasurements,
  runThemeMeasurements,
  sanitizeFailureUrl,
  summarizeNavigationDistribution,
  SETTLE_QUIET_MS,
  VIEWPORTS,
  writeReport,
} from '../../scripts/perf/measure-web.mjs';
import {
  isAllowedAuthenticationRequest,
  isPaidProviderRoute,
  parseCanaryConfig,
} from '../../scripts/ops/canary-theme-readonly.mjs';

const samples = [
  {
    metrics: {
      ttfb: 100,
      fcp: 200,
      lcp: 400,
      cls: 0.01,
      load: 700,
      requestCount: 10,
      transferredBytes: 1_000,
      longTasks: 1,
    },
    consoleErrors: [],
    networkErrors: [],
  },
  {
    metrics: {
      ttfb: 200,
      fcp: 300,
      lcp: 500,
      cls: 0.03,
      load: 800,
      requestCount: 12,
      transferredBytes: 2_000,
      longTasks: 2,
    },
    consoleErrors: [{ message: 'render failed https://user:secret@example.test/?token=private' }],
    networkErrors: [{ url: 'https://example.test/api?token=private#fragment', reason: '500' }],
  },
  {
    metrics: {
      ttfb: 300,
      fcp: 500,
      lcp: 900,
      cls: 0.09,
      load: 1_100,
      requestCount: 15,
      transferredBytes: 3_000,
      longTasks: 4,
    },
    consoleErrors: [],
    networkErrors: [{ url: 'https://user:secret@example.test/fail?key=hidden', reason: 'aborted' }],
  },
];

function createCleanupFixture({
  navigationError,
  evaluationError,
  detachError,
}: {
  navigationError?: Error;
  evaluationError?: Error;
  detachError?: Error;
}) {
  let elapsed = 0;
  let contextClosed = false;
  const page = {
    addInitScript: async () => {},
    route: async () => {},
    on: () => {},
    goto: async () => {
      if (navigationError) throw navigationError;
    },
    waitForTimeout: async (milliseconds: number) => { elapsed += milliseconds; },
    evaluate: async () => {
      if (evaluationError) throw evaluationError;
      return { ttfb: 1, fcp: 2, lcp: 3, layoutShifts: [], load: 4, longTasks: 0 };
    },
  };
  const context = {
    newPage: async () => page,
    newCDPSession: async () => ({
      send: async () => {},
      on: () => {},
      detach: async () => {
        if (detachError) throw detachError;
      },
    }),
    route: async () => {},
    routeWebSocket: async () => {},
    close: async () => { contextClosed = true; },
  };
  return {
    browser: { newContext: async () => context },
    now: () => elapsed,
    contextClosed: () => contextClosed,
  };
}

describe('web performance measurement harness', () => {
  it('summarizes twenty CSS-only theme toggles and rejects navigation, data, provider, and navigation-regression failures', () => {
    const report = calculateThemePerformanceReport({
      route: '/dashboard',
      toggleDurationsMs: Array.from({ length: 20 }, (_, index) => 10 + index),
      navigationCount: 0,
      supabaseRefetchCount: 0,
      providerRemountCount: 0,
      baselineNavigationMs: [900, 1_000, 1_100],
      postToggleNavigationMs: [945, 1_050, 1_155],
    });

    expect(report).toMatchObject({
      route: '/dashboard',
      toggleCount: 20,
      medianMs: 19.5,
      p95Ms: 28,
      navigationRegressionRatio: 0.05,
      navigationRegressionMeasurement: 'separate_page_reload_excluded_from_toggle_navigation_count',
      ok: true,
    });
    expect(MAX_THEME_NAVIGATION_REGRESSION_RATIO).toBe(0.05);
    expect(calculateThemePerformanceReport({
      route: '/dashboard',
      baselineNavigationMs: 1_000,
      postToggleNavigationMs: 1_050,
      toggleDurationsMs: Array(20).fill(10),
      navigationCount: 0,
      supabaseRefetchCount: 0,
      providerRemountCount: 0,
    }).ok).toBe(true);
    expect(calculateThemePerformanceReport({
      route: '/dashboard',
      baselineNavigationMs: 1_000,
      toggleDurationsMs: Array(20).fill(10),
      navigationCount: 1,
      supabaseRefetchCount: 1,
      providerRemountCount: 1,
      postToggleNavigationMs: 1_051,
    }).failures).toEqual([
      'navigation_detected',
      'supabase_refetch_detected',
      'provider_remount_detected',
      'navigation_regression_exceeded',
    ]);
  });

  it('compares median and p95 navigation distributions instead of a single reload', () => {
    expect(summarizeNavigationDistribution([900, 1_000, 1_100])).toEqual({ medianMs: 1_000, p95Ms: 1_100 });
    expect(calculateThemePerformanceReport({
      route: '/login',
      baselineNavigationMs: [900, 1_000, 1_100],
      postToggleNavigationMs: [945, 1_050, 1_155],
      toggleDurationsMs: Array(20).fill(5),
      navigationCount: 0,
      supabaseRefetchCount: 0,
      providerRemountCount: 0,
    })).toMatchObject({
      baselineNavigation: { medianMs: 1_000, p95Ms: 1_100 },
      postToggleNavigation: { medianMs: 1_050, p95Ms: 1_155 },
      navigationRegressionRatio: 0.05,
      navigationP95RegressionRatio: 0.05,
      ok: true,
    });
  });

  it('keeps failed navigation distributions in the operator-visible error evidence', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/perf/measure-web.mjs'),
      'utf8',
    );

    expect(source).toContain('baseline median=');
    expect(source).toContain('post-toggle median=');
  });

  it('requires every theme-canary role credential and blocks paid-provider route families', () => {
    expect(isPaidProviderRoute('https://trophe.app/api/ai/meal-suggest')).toBe(true);
    expect(isPaidProviderRoute('https://trophe.app/api/food/parse')).toBe(true);
    expect(isPaidProviderRoute('https://trophe.app/api/food/recipe-analyze')).toBe(true);
    expect(isPaidProviderRoute('https://trophe.app/api/coach/shopping-list')).toBe(true);
    expect(isPaidProviderRoute('https://trophe.app/api/coach/meal-plan-macros')).toBe(true);
    expect(isPaidProviderRoute('https://api.openai.com/v1/responses')).toBe(true);
    expect(isPaidProviderRoute('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isPaidProviderRoute('https://generativelanguage.googleapis.com/v1/models')).toBe(true);
    expect(isPaidProviderRoute('https://api.voyageai.com/v1/embeddings')).toBe(true);
    expect(isPaidProviderRoute('https://api.deepseek.com/v1/chat/completions')).toBe(true);
    expect(isPaidProviderRoute('https://api.mistral.ai/v1/chat/completions')).toBe(true);
    expect(isPaidProviderRoute('https://trophe.app/api/food/parse/')).toBe(true);
    expect(isPaidProviderRoute('https://trophe.app/api/coach/shopping-list/')).toBe(true);
    expect(isPaidProviderRoute('https://api.openai.com.attacker.test/v1/responses')).toBe(false);
    expect(isPaidProviderRoute('https://project.supabase.co/rest/v1/profiles')).toBe(false);
    expect(isPaidProviderRoute('https://trophe.app/api/food/local-search')).toBe(false);
    expect(isPaidProviderRoute('https://trophe.app/dashboard')).toBe(false);

    expect(() => parseCanaryConfig({
      PLAYWRIGHT_BASE_URL: 'https://trophe.app',
      THEME_CANARY_SUPABASE_URL: 'https://project.supabase.co',
      THEME_CANARY_CLIENT_EMAIL: 'client@example.test',
      THEME_CANARY_CLIENT_PASSWORD: 'client-password',
    })).toThrow('THEME_CANARY_COACH_EMAIL');
    expect(parseCanaryConfig({
      PLAYWRIGHT_BASE_URL: 'https://trophe.app',
      THEME_CANARY_SUPABASE_URL: 'https://project.supabase.co',
      THEME_CANARY_CLIENT_EMAIL: 'client@example.test',
      THEME_CANARY_CLIENT_PASSWORD: 'client-password',
      THEME_CANARY_COACH_EMAIL: 'coach@example.test',
      THEME_CANARY_COACH_PASSWORD: 'coach-password',
      THEME_CANARY_ADMIN_EMAIL: 'admin@example.test',
      THEME_CANARY_ADMIN_PASSWORD: 'admin-password',
      THEME_CANARY_SUPER_EMAIL: 'super@example.test',
      THEME_CANARY_SUPER_PASSWORD: 'super-password',
    })).toMatchObject({
      baseUrl: 'https://trophe.app/',
      supabaseAuthOrigin: 'https://project.supabase.co',
      roles: expect.objectContaining({
        client: expect.objectContaining({ route: '/dashboard', loadedState: /good (morning|afternoon|evening|night)|today/i }),
        coach: expect.objectContaining({ route: '/coach', loadedState: /client|roster/i }),
        admin: expect.objectContaining({ route: '/admin/orgs', loadedState: /organization/i }),
        super: expect.objectContaining({ route: '/super', loadedState: /command center|overview/i }),
      }),
    });
  });

  it('allows only POST auth-token requests to the configured Supabase origin', () => {
    const supabaseAuthOrigin = 'https://project.supabase.co';
    expect(isAllowedAuthenticationRequest('POST', 'https://project.supabase.co/auth/v1/token?grant_type=password', supabaseAuthOrigin)).toBe(true);
    expect(isAllowedAuthenticationRequest('GET', 'https://project.supabase.co/auth/v1/token', supabaseAuthOrigin)).toBe(false);
    expect(isAllowedAuthenticationRequest('POST', 'https://attacker.test/auth/v1/token', supabaseAuthOrigin)).toBe(false);
    expect(isAllowedAuthenticationRequest('POST', 'https://project.supabase.co/auth/v1/token/other', supabaseAuthOrigin)).toBe(false);
  });

  it('rejects missing local theme-measurement credentials before starting a browser or network request', async () => {
    let browserCreated = false;
    await expect(runThemeMeasurements({
      env: { PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3300' },
      browserFactory: async () => {
        browserCreated = true;
        throw new Error('browser must not be created');
      },
    })).rejects.toThrow('THEME_PERF_CLIENT_EMAIL');
    expect(browserCreated).toBe(false);
  });

  it('collects mobile before desktop with the committed viewports', () => {
    expect(VIEWPORTS).toEqual([
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1440, height: 900 },
    ]);
  });

  it('calculates median and worst values from three samples', () => {
    const report = calculateReport({
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      samples,
    });

    expect(report.median).toEqual({
      ttfb: 200,
      fcp: 300,
      lcp: 500,
      cls: 0.03,
      load: 800,
      requestCount: 12,
      transferredBytes: 2_000,
      longTasks: 2,
    });
    expect(report.worst).toEqual({
      ttfb: 300,
      fcp: 500,
      lcp: 900,
      cls: 0.09,
      load: 1_100,
      requestCount: 15,
      transferredBytes: 3_000,
      longTasks: 4,
    });
  });

  it('redacts credentials, query strings, and fragments from failing request URLs', () => {
    expect(sanitizeFailureUrl('https://user:secret@example.test/fail?key=hidden#fragment'))
      .toBe('https://example.test/fail');

    const report = calculateReport({
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      samples,
    });
    expect(report.networkErrors).toEqual([
      { url: 'https://example.test/api', reason: '500' },
      { url: 'https://example.test/fail', reason: 'aborted' },
    ]);
    expect(report.samples[2].networkErrors).toEqual([
      { url: 'https://example.test/fail', reason: 'aborted' },
    ]);
    expect(sanitizeFailureUrl('data:text/plain,top-secret-payload')).toBe('non-http-url');
    expect(JSON.stringify(calculateReport({
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      samples: [{
        metrics: samples[0].metrics,
        consoleErrors: [],
        networkErrors: [{ url: 'data:text/plain,top-secret-payload', reason: 'request_failed' }],
      }],
    }))).not.toContain('top-secret-payload');
  });

  it('accepts only safe HTTP measurement inputs and report paths', () => {
    expect(parseCliArgs([
      '--url', 'https://example.test/login',
      '--samples', '3',
      '--output', 'docs/quality/performance-production-baseline.json',
    ])).toEqual({
      url: 'https://example.test/login',
      samples: 3,
      output: 'docs/quality/performance-production-baseline.json',
    });

    expect(() => parseCliArgs(['--url', 'ftp://example.test'])).toThrow('http or https');
    expect(() => parseCliArgs(['--url', 'https://user:secret@example.test'])).toThrow('credentials');
    expect(() => parseCliArgs(['--url', 'https://example.test', '--samples', '0'])).toThrow('samples');
    expect(() => parseCliArgs(['--url', 'https://example.test', '--output', '../report.json'])).toThrow('output');
  });

  it('uses the maximum CLS session window instead of lifetime layout-shift sum', () => {
    expect(calculateCls([
      { startTime: 0, value: 0.1, hadRecentInput: false },
      { startTime: 500, value: 0.2, hadRecentInput: false },
      { startTime: 1_700, value: 0.4, hadRecentInput: false },
      { startTime: 2_000, value: 0.1, hadRecentInput: false },
      { startTime: 7_100, value: 0.6, hadRecentInput: false },
      { startTime: 7_200, value: 4, hadRecentInput: true },
    ])).toBeCloseTo(0.6);
  });

  it('starts a new CLS session at the exact one- and five-second boundaries', () => {
    expect(calculateCls([
      { startTime: 0, value: 0.4, hadRecentInput: false },
      { startTime: 1_000, value: 0.4, hadRecentInput: false },
    ])).toBe(0.4);
    expect(calculateCls([
      { startTime: 0, value: 0.3, hadRecentInput: false },
      { startTime: 900, value: 0.3, hadRecentInput: false },
      { startTime: 5_000, value: 0.5, hadRecentInput: false },
    ])).toBe(0.6);
  });

  it('uses a bounded quiet window long enough to observe post-load vitals', () => {
    expect(SETTLE_QUIET_MS).toBeGreaterThan(250);
    expect(MAX_SETTLE_MS).toBeGreaterThanOrEqual(SETTLE_QUIET_MS);
    expect(MAX_SETTLE_MS).toBeLessThanOrEqual(10_000);
  });

  it('collects late LCP/CLS and CDP bytes in a deterministic browser fixture', async () => {
    let elapsed = 0;
    let transferFinished = false;
    let navigatedUrl: string | undefined;
    const pageHandlers = new Map<string, (value: unknown) => void>();
    const cdpHandlers = new Map<string, (value: unknown) => void>();
    let contextOptions: Record<string, unknown> | undefined;
    let webSocketClosed = false;
    let webSocketConnected = false;
    let webSocketHandler: ((socket: {
      close: (options: unknown) => void;
      connectToServer: () => void;
    }) => void) | undefined;
    const request = {
      method: () => 'GET',
      url: () => 'https://cdn.example.test/font.woff2?signature=private',
      failure: () => null,
    };
    const page = {
      addInitScript: async () => {},
      route: async () => {},
      on: (event: string, handler: (value: unknown) => void) => pageHandlers.set(event, handler),
      goto: async (target: string) => {
        navigatedUrl = target;
        pageHandlers.get('request')?.(request);
        cdpHandlers.get('Network.requestWillBeSent')?.({ requestId: 'cross-origin' });
        webSocketHandler?.({
          close: () => { webSocketClosed = true; },
          connectToServer: () => { webSocketConnected = true; },
        });
      },
      waitForTimeout: async (milliseconds: number) => {
        elapsed += milliseconds;
        if (!transferFinished && elapsed >= 1_500) {
          transferFinished = true;
          cdpHandlers.get('Network.loadingFinished')?.({ requestId: 'cross-origin', encodedDataLength: 777 });
        }
      },
      evaluate: async () => ({
        ttfb: 100,
        fcp: 200,
        lcp: elapsed >= 1_500 ? 800 : 150,
        layoutShifts: elapsed >= 1_500
          ? [
              { startTime: 300, value: 0.1, hadRecentInput: false },
              { startTime: 1_500, value: 0.3, hadRecentInput: false },
            ]
          : [],
        load: 900,
        longTasks: 1,
      }),
    };
    const cdp = {
      send: async () => {},
      on: (event: string, handler: (value: unknown) => void) => cdpHandlers.set(event, handler),
      detach: async () => {},
    };
    const context = {
      newPage: async () => page,
      newCDPSession: async () => cdp,
      route: async () => {},
      routeWebSocket: async (_pattern: string, handler: typeof webSocketHandler) => { webSocketHandler = handler; },
      close: async () => {},
    };
    const browser = {
      newContext: async (options: Record<string, unknown>) => {
        contextOptions = options;
        return context;
      },
    };

    const result = await collectSample({
      browser,
      url: 'https://example.test/?secret=hidden#fragment',
      viewport: VIEWPORTS[0],
      now: () => elapsed,
    });

    expect(elapsed).toBeGreaterThanOrEqual(SETTLE_QUIET_MS + 1_500);
    expect(navigatedUrl).toBe('https://example.test/');
    expect(contextOptions).toMatchObject({ serviceWorkers: 'block' });
    expect(webSocketClosed).toBe(true);
    expect(webSocketConnected).toBe(false);
    expect(result.settlement).toMatchObject({
      reason: 'network_quiet',
      remainingInFlightCount: 0,
    });
    expect(result.metrics).toMatchObject({
      lcp: 800,
      cls: 0.3,
      requestCount: 1,
      transferredBytes: 777,
    });
  });

  it('starts the quiet window after load completes and captures later vitals', async () => {
    let elapsed = 0;
    const pageHandlers = new Map<string, (value: unknown) => void>();
    const cdpHandlers = new Map<string, (value: unknown) => void>();
    const request = {
      method: () => 'GET',
      url: () => 'https://example.test/app.js',
      failure: () => null,
    };
    const page = {
      addInitScript: async () => {},
      route: async () => {},
      on: (event: string, handler: (value: unknown) => void) => pageHandlers.set(event, handler),
      goto: async () => {
        pageHandlers.get('request')?.(request);
        cdpHandlers.get('Network.requestWillBeSent')?.({ requestId: 'before-load' });
        elapsed = 500;
        cdpHandlers.get('Network.loadingFinished')?.({
          requestId: 'before-load',
          encodedDataLength: 250,
        });
        elapsed = 2_000;
      },
      waitForTimeout: async (milliseconds: number) => { elapsed += milliseconds; },
      evaluate: async () => ({
        ttfb: 100,
        fcp: 200,
        lcp: elapsed >= 3_000 ? 900 : 300,
        layoutShifts: elapsed >= 3_000
          ? [{ startTime: 2_500, value: 0.25, hadRecentInput: false }]
          : [],
        load: 2_000,
        longTasks: 0,
      }),
    };
    const context = {
      newPage: async () => page,
      newCDPSession: async () => ({
        send: async () => {},
        on: (event: string, handler: (value: unknown) => void) => cdpHandlers.set(event, handler),
        detach: async () => {},
      }),
      route: async () => {},
      routeWebSocket: async () => {},
      close: async () => {},
    };

    const result = await collectSample({
      browser: { newContext: async () => context },
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: () => elapsed,
    });

    expect(elapsed).toBe(3_000);
    expect(result.valid).toBe(true);
    expect(result.settlement).toEqual({
      reason: 'network_quiet',
      durationMs: SETTLE_QUIET_MS,
      remainingInFlightCount: 0,
    });
    expect(result.metrics).toMatchObject({
      lcp: 900,
      cls: 0.25,
      transferredBytes: 250,
    });
  });

  it('accounts CDP bytes once and exposes cache and failure outcomes', () => {
    const transfers = createTransferAccumulator();
    transfers.requestWillBeSent({ requestId: 'cross' });
    transfers.loadingFinished({ requestId: 'cross', encodedDataLength: 512 });
    transfers.loadingFinished({ requestId: 'cross', encodedDataLength: 512 });
    transfers.requestServedFromCache({ requestId: 'cache' });
    transfers.loadingFinished({ requestId: 'cache', encodedDataLength: 0 });
    transfers.loadingFailed({ requestId: 'failed' });

    expect(transfers.snapshot()).toEqual({
      transferredBytes: 512,
      completedCount: 1,
      cachedCount: 1,
      failedCount: 1,
      inFlightCount: 0,
    });
  });

  it('counts redirect hops and partial failures once without terminal double-counting', () => {
    const transfers = createTransferAccumulator();
    transfers.requestWillBeSent({ requestId: 'redirect' });
    transfers.dataReceived({ requestId: 'redirect', encodedDataLength: 80 });
    transfers.requestWillBeSent({
      requestId: 'redirect',
      redirectResponse: { encodedDataLength: 100 },
    });
    transfers.dataReceived({ requestId: 'redirect', encodedDataLength: 150 });
    transfers.loadingFinished({ requestId: 'redirect', encodedDataLength: 200 });

    transfers.requestWillBeSent({ requestId: 'partial' });
    transfers.dataReceived({ requestId: 'partial', encodedDataLength: 50 });
    transfers.dataReceived({ requestId: 'partial', encodedDataLength: 70 });
    transfers.loadingFailed({ requestId: 'partial' });

    expect(transfers.snapshot()).toMatchObject({
      transferredBytes: 420,
      completedCount: 1,
      failedCount: 1,
      inFlightCount: 0,
    });
  });

  it('resets cached redirect state before a network final hop reuses the request id', () => {
    const transfers = createTransferAccumulator();
    transfers.requestWillBeSent({ requestId: 'cached-redirect' });
    transfers.requestServedFromCache({ requestId: 'cached-redirect' });
    transfers.requestWillBeSent({
      requestId: 'cached-redirect',
      redirectResponse: { encodedDataLength: 0 },
    });
    transfers.dataReceived({ requestId: 'cached-redirect', encodedDataLength: 200 });
    transfers.loadingFinished({ requestId: 'cached-redirect', encodedDataLength: 250 });

    expect(transfers.snapshot()).toEqual({
      transferredBytes: 250,
      completedCount: 1,
      cachedCount: 1,
      failedCount: 0,
      inFlightCount: 0,
    });
  });

  it('scopes cache state to the final hop of a network-to-cached redirect', () => {
    const transfers = createTransferAccumulator();
    transfers.requestWillBeSent({ requestId: 'network-redirect' });
    transfers.dataReceived({ requestId: 'network-redirect', encodedDataLength: 80 });
    transfers.requestWillBeSent({
      requestId: 'network-redirect',
      redirectResponse: { encodedDataLength: 100 },
    });
    transfers.requestServedFromCache({ requestId: 'network-redirect' });
    transfers.loadingFinished({ requestId: 'network-redirect', encodedDataLength: 0 });

    expect(transfers.snapshot()).toEqual({
      transferredBytes: 100,
      completedCount: 0,
      cachedCount: 1,
      failedCount: 0,
      inFlightCount: 0,
    });
  });

  it('marks a max-settle snapshot invalid with remaining in-flight work', async () => {
    let elapsed = 0;
    const pageHandlers = new Map<string, (value: unknown) => void>();
    const cdpHandlers = new Map<string, (value: unknown) => void>();
    const request = {
      method: () => 'GET',
      url: () => 'https://slow.example.test/resource',
      failure: () => null,
    };
    const page = {
      addInitScript: async () => {},
      route: async () => {},
      on: (event: string, handler: (value: unknown) => void) => pageHandlers.set(event, handler),
      goto: async () => {
        pageHandlers.get('request')?.(request);
        cdpHandlers.get('Network.requestWillBeSent')?.({ requestId: 'never-finishes' });
        elapsed = 2_000;
      },
      waitForTimeout: async (milliseconds: number) => { elapsed += milliseconds; },
      evaluate: async () => ({
        ttfb: 1, fcp: 2, lcp: 3, layoutShifts: [], load: 4, longTasks: 0,
      }),
    };
    const context = {
      newPage: async () => page,
      newCDPSession: async () => ({
        send: async () => {},
        on: (event: string, handler: (value: unknown) => void) => cdpHandlers.set(event, handler),
        detach: async () => {},
      }),
      route: async () => {},
      routeWebSocket: async () => {},
      close: async () => {},
    };

    const result = await collectSample({
      browser: { newContext: async () => context },
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: () => elapsed,
    });

    expect(elapsed).toBe(2_000 + MAX_SETTLE_MS);
    expect(result.valid).toBe(false);
    expect(result.invalidReasons).toContain('max_settle_reached');
    expect(result.settlement).toEqual({
      reason: 'max_settle_reached',
      durationMs: MAX_SETTLE_MS,
      remainingInFlightCount: 1,
    });
  });

  it('allows safe OPTIONS and counts blocked attempts only once as failures', async () => {
    expect(['GET', 'HEAD', 'OPTIONS'].every(isReadOnlyMethod)).toBe(true);
    expect(['POST', 'PUT', 'PATCH', 'DELETE'].some(isReadOnlyMethod)).toBe(false);

    let elapsed = 0;
    const pageHandlers = new Map<string, (value: unknown) => void>();
    const blockedRequest = {
      method: () => 'POST',
      url: () => 'https://example.test/submit?secret=hidden',
      failure: () => ({ errorText: 'net::ERR_BLOCKED_BY_CLIENT' }),
    };
    type FakeRoute = {
      request: () => typeof blockedRequest;
      abort: () => Promise<void>;
      continue: () => Promise<void>;
    };
    let routeHandler: ((route: FakeRoute) => Promise<void>) | undefined;
    const page = {
      addInitScript: async () => {},
      route: async (_pattern: string, handler: (route: FakeRoute) => Promise<void>) => { routeHandler = handler; },
      on: (event: string, handler: (value: unknown) => void) => pageHandlers.set(event, handler),
      goto: async () => {
        pageHandlers.get('request')?.(blockedRequest);
        await routeHandler?.({
          request: () => blockedRequest,
          abort: async () => pageHandlers.get('requestfailed')?.(blockedRequest),
          continue: async () => {},
        });
      },
      waitForTimeout: async (milliseconds: number) => { elapsed += milliseconds; },
      evaluate: async () => ({
        ttfb: 1, fcp: 2, lcp: 3, layoutShifts: [], load: 4, longTasks: 0,
      }),
    };
    const context = {
      newPage: async () => page,
      newCDPSession: async () => ({ send: async () => {}, on: () => {}, detach: async () => {} }),
      route: async (_pattern: string, handler: (route: FakeRoute) => Promise<void>) => { routeHandler = handler; },
      routeWebSocket: async () => {},
      close: async () => {},
    };

    const result = await collectSample({
      browser: { newContext: async () => context },
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: () => elapsed,
    });

    expect(result.metrics).toMatchObject({ requestCount: 1, blockedRequestCount: 1 });
    expect(result.valid).toBe(false);
    expect(result.networkErrors).toEqual([
      { url: 'https://example.test/submit', reason: 'blocked_post' },
    ]);
  });

  it('rejects an unsafe low-level collector URL before creating a context', async () => {
    let contextCreated = false;
    await expect(collectSample({
      browser: {
        newContext: async () => {
          contextCreated = true;
          throw new Error('context must not be created');
        },
      },
      url: 'file:///tmp/offline-proof',
      viewport: VIEWPORTS[0],
    })).rejects.toThrow('http or https');
    expect(contextCreated).toBe(false);
  });

  it('fails safely before navigation when WebSocket routing is unavailable', async () => {
    let navigated = false;
    let contextClosed = false;
    const context = {
      newPage: async () => ({
        addInitScript: async () => {},
        on: () => {},
        goto: async () => { navigated = true; },
      }),
      newCDPSession: async () => ({ send: async () => {}, on: () => {}, detach: async () => {} }),
      route: async () => {},
      close: async () => { contextClosed = true; },
    };

    await expect(collectSample({
      browser: { newContext: async () => context },
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
    })).rejects.toThrow('WebSocket');
    expect(navigated).toBe(false);
    expect(contextClosed).toBe(true);
  });

  it('validates exported measurement entry points before browser creation', async () => {
    let browserCreated = false;
    const browserFactory = async () => {
      browserCreated = true;
      throw new Error('browser must not be created');
    };

    await expect(measureUrl({
      url: 'file:///etc/passwd', viewport: VIEWPORTS[0], samples: 1, browserFactory,
    })).rejects.toThrow('http or https');
    await expect(runMeasurements({
      url: 'https://user:secret@example.test/', samples: 1, browserFactory,
    })).rejects.toThrow('credentials');
    expect(browserCreated).toBe(false);
  });

  it('excludes invalid samples from headline metrics and reports validity', () => {
    const report = calculateReport({
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      samples: [
        { ...samples[0], valid: true, invalidReasons: [] },
        {
          ...samples[2],
          valid: false,
          invalidReasons: ['blocked_requests'],
          metrics: { ...samples[2].metrics, lcp: 9_999 },
        },
      ],
    });

    expect(report).toMatchObject({
      valid: false,
      validSampleCount: 1,
      invalidSampleCount: 1,
      invalidReasons: ['blocked_requests'],
    });
    expect(report.median?.lcp).toBe(400);
    expect(report.worst?.lcp).toBe(400);
  });

  it('returns null headline metrics when every sample is invalid', () => {
    const report = calculateReport({
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      samples: [{
        ...samples[2],
        valid: false,
        invalidReasons: ['max_settle_reached'],
      }],
    });

    expect(report).toMatchObject({
      valid: false,
      validSampleCount: 0,
      invalidSampleCount: 1,
      invalidReasons: ['max_settle_reached'],
      median: null,
      worst: null,
    });
  });

  it('closes context and preserves navigation error when detach also fails', async () => {
    const fixture = createCleanupFixture({
      navigationError: new Error('navigation failed'),
      detachError: new Error('detach failed'),
    });
    await expect(collectSample({
      browser: fixture.browser,
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: fixture.now,
    })).rejects.toThrow('navigation failed');
    expect(fixture.contextClosed()).toBe(true);
  });

  it('closes context after evaluation failure', async () => {
    const fixture = createCleanupFixture({ evaluationError: new Error('evaluation failed') });
    await expect(collectSample({
      browser: fixture.browser,
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: fixture.now,
    })).rejects.toThrow('evaluation failed');
    expect(fixture.contextClosed()).toBe(true);
  });

  it('closes context when detach alone fails', async () => {
    const fixture = createCleanupFixture({ detachError: new Error('detach failed') });
    await expect(collectSample({
      browser: fixture.browser,
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: fixture.now,
    })).rejects.toThrow('detach failed');
    expect(fixture.contextClosed()).toBe(true);
  });

  it('persists bounded console categories without arbitrary error text', () => {
    const report = calculateReport({
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      samples: [{
        metrics: samples[0].metrics,
        consoleErrors: [{
          message: `failure https://user:secret@example.test/path?token=private ${'x'.repeat(20_000)}`,
        }],
        networkErrors: [],
      }],
    });

    expect(report.consoleErrors).toEqual([{ category: 'console_error' }]);
    expect(report.samples[0].consoleErrors).toEqual([{ category: 'console_error' }]);
    expect(JSON.stringify(report)).not.toContain('private');
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(JSON.stringify(report).length).toBeLessThan(25_000);
  });

  it('enforces the performance filename pattern at the write boundary', async () => {
    await expect(writeReport('docs/quality/other.json', {})).rejects.toThrow('output');
    await expect(writeReport('docs/quality/../quality/other.json', {})).rejects.toThrow('output');
  });
});
