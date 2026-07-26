import { describe, expect, it } from 'vitest';
import {
  calculateCls,
  calculateReport,
  collectSample,
  createTransferAccumulator,
  isReadOnlyMethod,
  MAX_SETTLE_MS,
  measureUrl,
  parseCliArgs,
  runMeasurements,
  sanitizeFailureUrl,
  SETTLE_QUIET_MS,
  VIEWPORTS,
  writeReport,
} from '../../scripts/perf/measure-web.mjs';

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

describe('web performance measurement harness', () => {
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

  it('uses a bounded quiet window long enough to observe post-load vitals', () => {
    expect(SETTLE_QUIET_MS).toBeGreaterThan(250);
    expect(MAX_SETTLE_MS).toBeGreaterThanOrEqual(SETTLE_QUIET_MS);
    expect(MAX_SETTLE_MS).toBeLessThanOrEqual(10_000);
  });

  it('collects late LCP/CLS and CDP bytes in a deterministic browser fixture', async () => {
    let elapsed = 0;
    let transferFinished = false;
    const pageHandlers = new Map<string, (value: unknown) => void>();
    const cdpHandlers = new Map<string, (value: unknown) => void>();
    const request = {
      method: () => 'GET',
      url: () => 'https://cdn.example.test/font.woff2?signature=private',
      failure: () => null,
    };
    const page = {
      addInitScript: async () => {},
      route: async () => {},
      on: (event: string, handler: (value: unknown) => void) => pageHandlers.set(event, handler),
      goto: async () => {
        pageHandlers.get('request')?.(request);
      },
      waitForTimeout: async (milliseconds: number) => {
        elapsed += milliseconds;
        if (!transferFinished && elapsed >= 400) {
          transferFinished = true;
          cdpHandlers.get('Network.loadingFinished')?.({ requestId: 'cross-origin', encodedDataLength: 777 });
        }
      },
      evaluate: async () => ({
        ttfb: 100,
        fcp: 200,
        lcp: elapsed > 250 ? 800 : 150,
        layoutShifts: elapsed > 250
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
      close: async () => {},
    };
    const browser = { newContext: async () => context };

    const result = await collectSample({
      browser,
      url: 'https://example.test/',
      viewport: VIEWPORTS[0],
      now: () => elapsed,
    });

    expect(elapsed).toBeGreaterThanOrEqual(SETTLE_QUIET_MS + 400);
    expect(result.metrics).toMatchObject({
      lcp: 800,
      cls: 0.3,
      requestCount: 1,
      transferredBytes: 777,
    });
  });

  it('accounts CDP bytes once and exposes cache and failure outcomes', () => {
    const transfers = createTransferAccumulator();
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
