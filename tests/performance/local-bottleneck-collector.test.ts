import { describe, expect, it } from 'vitest';
import {
  isDiagnosticReadOnlyMethod,
  mergedDurationMs,
  parseDiagnosticCliArgs,
  selectCriticalRequestChain,
  selectRepresentativeSample,
  summarizeResourceTransfers,
  validatedDiagnosticOutputPath,
  validatedLoopbackTarget,
} from '../../scripts/perf/collect-local-bottlenecks.mjs';

describe('local bottleneck collector reducers', () => {
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
});

describe('local bottleneck collector safety boundaries', () => {
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
