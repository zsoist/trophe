import { describe, expect, it } from 'vitest';
import {
  calculateReport,
  parseCliArgs,
  sanitizeFailureUrl,
  VIEWPORTS,
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
    consoleErrors: [{ message: 'render failed' }],
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
});
