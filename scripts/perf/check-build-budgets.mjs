import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIB = 1024;

// Measurement method (identical for every route): parse the route's
// `page_client-reference-manifest.js`, collect the unique `.js` chunks that any
// client module in the route tree references, and sum their raw on-disk bytes.
// This counts every client chunk the route can pull in (layouts, dialogs, and
// `next/dynamic` islands included) and is stable across hashed file names.
// It is NOT transfer size: `.next/server/app/<route>.html` first-load gzip is
// roughly 0.3x of these numbers (see docs/quality/performance-*.md).
//
// Baselines are the raw byte sums from `npm run build` on the day the route was
// added to the guard; each route may grow at most 10% before `perf:budget`
// fails. Re-baseline deliberately, in its own commit, with the new figure and
// the reason. Authenticated routes were added 2026-09-03 (Next 16.2.12).
export const ROUTE_BUDGETS = [
  {
    route: '/',
    routeKey: '/page',
    manifest: '.next/server/app/page_client-reference-manifest.js',
    baselineBytes: 18_283,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 50 * KIB,
  },
  {
    route: '/login',
    routeKey: '/login/page',
    manifest: '.next/server/app/login/page_client-reference-manifest.js',
    baselineBytes: 271_430,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 50 * KIB,
  },
  {
    // 2026-09-03: 841.7 KiB raw (243.4 KiB gzip by this method; 404.9 KiB gzip
    // of every script tag in dashboard.html). The page chunk was already
    // 52.6 KiB when the guard landed, so its per-chunk cap is 60 KiB: hold the
    // line, shrink it in the lazy-loading follow-up, then tighten to 50 KiB.
    route: '/dashboard',
    routeKey: '/dashboard/page',
    manifest: '.next/server/app/dashboard/page_client-reference-manifest.js',
    baselineBytes: 861_880,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 60 * KIB,
  },
  {
    // 2026-09-03: 960.3 KiB raw (277.5 KiB gzip; 407.3 KiB gzip HTML scripts).
    route: '/dashboard/workout',
    routeKey: '/dashboard/workout/page',
    manifest: '.next/server/app/dashboard/workout/page_client-reference-manifest.js',
    baselineBytes: 983_396,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 50 * KIB,
  },
  {
    // 2026-09-03: 1039.1 KiB raw (299.8 KiB gzip; 420.9 KiB gzip HTML scripts).
    route: '/dashboard/workout/live',
    routeKey: '/dashboard/workout/live/page',
    manifest: '.next/server/app/dashboard/workout/live/page_client-reference-manifest.js',
    baselineBytes: 1_063_989,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 50 * KIB,
  },
  {
    // 2026-09-03: 989.2 KiB raw (286.3 KiB gzip; 394.8 KiB gzip HTML scripts).
    route: '/dashboard/workout/build',
    routeKey: '/dashboard/workout/build/page',
    manifest: '.next/server/app/dashboard/workout/build/page_client-reference-manifest.js',
    baselineBytes: 1_012_948,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 50 * KIB,
  },
  {
    // 2026-09-03: 983.7 KiB raw (284.6 KiB gzip; 393.1 KiB gzip HTML scripts).
    route: '/dashboard/workout/history',
    routeKey: '/dashboard/workout/history/page',
    manifest: '.next/server/app/dashboard/workout/history/page_client-reference-manifest.js',
    baselineBytes: 1_007_259,
    maxGrowthRatio: 0.1,
    maxRouteChunkBytes: 50 * KIB,
  },
];

export function parseClientReferenceManifest(source, routeKey) {
  const marker = `globalThis.__RSC_MANIFEST[${JSON.stringify(routeKey)}]=`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Client reference manifest does not contain route ${routeKey}`);
  }

  const jsonStart = start + marker.length;
  const jsonEnd = source.indexOf(';', jsonStart);
  if (jsonEnd === -1) {
    throw new Error(`Client reference manifest for ${routeKey} is truncated`);
  }

  return JSON.parse(source.slice(jsonStart, jsonEnd));
}

function routeChunkPrefix(route) {
  return route === '/'
    ? 'static/chunks/app/page-'
    : `static/chunks/app${route}/page-`;
}

export function analyzeRouteChunks({
  route,
  routeKey,
  manifestSource,
  fileSizes,
}) {
  const manifest = parseClientReferenceManifest(manifestSource, routeKey);
  const chunkNames = [
    ...new Set(
      Object.values(manifest.clientModules ?? {})
        .flatMap((entry) => entry.chunks ?? [])
        .filter((file) => file.endsWith('.js')),
    ),
  ];
  const prefix = routeChunkPrefix(route);
  const largestChunks = chunkNames
    .map((file) => {
      const bytes = fileSizes.get(file);
      if (!Number.isFinite(bytes)) {
        throw new Error(`Missing size for referenced client chunk ${file}`);
      }
      return {
        file,
        bytes,
        routeSpecific: file.startsWith(prefix),
      };
    })
    .sort((left, right) => right.bytes - left.bytes);

  const totalBytes = largestChunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const routeSpecificBytes = largestChunks
    .filter((chunk) => chunk.routeSpecific)
    .reduce((sum, chunk) => sum + chunk.bytes, 0);

  return {
    route,
    totalBytes,
    sharedBytes: totalBytes - routeSpecificBytes,
    routeSpecificBytes,
    largestChunks,
  };
}

export function evaluateRouteBudget(report, budget) {
  const allowedTotalBytes = Math.floor(
    budget.baselineBytes * (1 + budget.maxGrowthRatio),
  );
  const failures = [];

  if (report.totalBytes > allowedTotalBytes) {
    failures.push('total_bytes_exceeded');
  }
  if (
    report.largestChunks.some(
      (chunk) => chunk.routeSpecific && chunk.bytes > budget.maxRouteChunkBytes,
    )
  ) {
    failures.push('route_chunk_exceeded');
  }

  return {
    ...report,
    baselineBytes: budget.baselineBytes,
    allowedTotalBytes,
    deltaBytes: report.totalBytes - budget.baselineBytes,
    deltaPercent:
      ((report.totalBytes - budget.baselineBytes) / budget.baselineBytes) * 100,
    failures,
    ok: failures.length === 0,
  };
}

function inspectBuild(root) {
  return ROUTE_BUDGETS.map((budget) => {
    const manifestSource = readFileSync(join(root, budget.manifest), 'utf8');
    const manifest = parseClientReferenceManifest(manifestSource, budget.routeKey);
    const chunkNames = [
      ...new Set(
        Object.values(manifest.clientModules ?? {})
          .flatMap((entry) => entry.chunks ?? [])
          .filter((file) => file.endsWith('.js')),
      ),
    ];
    const fileSizes = new Map(
      chunkNames.map((file) => [file, statSync(join(root, '.next', file)).size]),
    );
    const report = analyzeRouteChunks({
      route: budget.route,
      routeKey: budget.routeKey,
      manifestSource,
      fileSizes,
    });

    return evaluateRouteBudget(report, budget);
  });
}

function formatBytes(bytes) {
  return `${(bytes / KIB).toFixed(1)} KiB`;
}

function main() {
  const root = process.cwd();
  const results = inspectBuild(root);

  for (const result of results) {
    const delta = `${result.deltaPercent >= 0 ? '+' : ''}${result.deltaPercent.toFixed(1)}%`;
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'} ${result.route}: ${formatBytes(result.totalBytes)} `
      + `(baseline ${formatBytes(result.baselineBytes)}, ${delta}; `
      + `route-specific ${formatBytes(result.routeSpecificBytes)})`,
    );
    for (const chunk of result.largestChunks.slice(0, 5)) {
      console.log(
        `  ${chunk.routeSpecific ? 'route ' : 'shared'} ${formatBytes(chunk.bytes)} ${chunk.file}`,
      );
    }
    for (const failure of result.failures) {
      console.error(`  budget failure: ${failure}`);
    }
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFile === fileURLToPath(pathToFileURL(process.argv[1]))) {
  main();
}
