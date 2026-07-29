import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIB = 1024;

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
