import { describe, expect, it } from 'vitest';
import {
  analyzeRouteChunks,
  evaluateRouteBudget,
  parseClientReferenceManifest,
} from '../../scripts/perf/check-build-budgets.mjs';

const fixtureManifest = {
  clientModules: {
    '/repo/app/layout.tsx': {
      chunks: ['static/chunks/framework-a1.js', 'static/chunks/app/layout-b2.js'],
    },
    '/repo/app/login/page.tsx': {
      chunks: [
        'static/chunks/framework-a1.js',
        'static/chunks/app/login/page-c3.js',
      ],
    },
  },
};

const fixtureSource = `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/login/page"]=${JSON.stringify(fixtureManifest)};`;

describe('public route build budgets', () => {
  it('parses a generated client-reference manifest without relying on hashes', () => {
    expect(parseClientReferenceManifest(fixtureSource, '/login/page')).toEqual(fixtureManifest);
  });

  it('reports unique shared and route-specific JavaScript bytes', () => {
    const report = analyzeRouteChunks({
      route: '/login',
      routeKey: '/login/page',
      manifestSource: fixtureSource,
      fileSizes: new Map([
        ['static/chunks/framework-a1.js', 40_000],
        ['static/chunks/app/layout-b2.js', 10_000],
        ['static/chunks/app/login/page-c3.js', 12_000],
      ]),
    });

    expect(report.totalBytes).toBe(62_000);
    expect(report.routeSpecificBytes).toBe(12_000);
    expect(report.sharedBytes).toBe(50_000);
    expect(report.largestChunks[0]).toEqual({
      file: 'static/chunks/framework-a1.js',
      bytes: 40_000,
      routeSpecific: false,
    });
  });

  it('fails total growth above 10 percent', () => {
    const result = evaluateRouteBudget(
      {
        route: '/',
        totalBytes: 111_001,
        sharedBytes: 60_000,
        routeSpecificBytes: 51_001,
        largestChunks: [],
      },
      { baselineBytes: 100_000, maxGrowthRatio: 0.1, maxRouteChunkBytes: 60_000 },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('total_bytes_exceeded');
  });

  it('fails a new page-specific chunk above 50 KiB', () => {
    const result = evaluateRouteBudget(
      {
        route: '/login',
        totalBytes: 100_000,
        sharedBytes: 40_000,
        routeSpecificBytes: 60_000,
        largestChunks: [
          {
            file: 'static/chunks/app/login/page-c3.js',
            bytes: 50 * 1024 + 1,
            routeSpecific: true,
          },
        ],
      },
      { baselineBytes: 100_000, maxGrowthRatio: 0.1, maxRouteChunkBytes: 50 * 1024 },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('route_chunk_exceeded');
  });
});
