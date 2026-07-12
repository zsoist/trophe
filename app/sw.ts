/**
 * Self-destructing service worker (2026-07-12).
 *
 * Why: two test iPhones loaded trophe.app in ~1 minute while every Chromium /
 * curl / edge measurement showed <1s. The one variable that differs is the
 * service worker — iOS Safari's SW engine is the notorious quirk zone, and both
 * testers' phones have a worker installed (it controls the whole origin, so even
 * the logged-out landing routes through it). Trophē is an ONLINE app: navigations
 * were already NetworkOnly and /_next/static assets are immutable + long-cached
 * by the browser's own HTTP cache, so the worker added near-zero benefit at real
 * iOS risk (stale/stuck workers, preload edge-cases).
 *
 * This worker takes over immediately, purges every Cache Storage entry, and
 * unregisters itself — returning the origin to pure static + network delivery
 * (measured fast). Any device that loads the page (including phones stuck on an
 * old worker) heals on the next visit. Fully reversible: a caching worker can be
 * reintroduced later once the iOS behaviour is understood and validated on-device.
 */
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST?: unknown };

// The @serwist/next build injects __SW_MANIFEST; reference it so the bundle is
// satisfied even though this worker precaches nothing.
void self.__SW_MANIFEST;

self.addEventListener('install', () => {
  // Skip the waiting phase so this worker replaces any predecessor immediately.
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) Purge every cache the old worker created.
      try {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      } catch {
        /* best-effort — a failed purge must not block unregistration */
      }

      // 2) Remove this worker from the origin entirely.
      try {
        await self.registration.unregister();
      } catch {
        /* noop */
      }

      // 3) Reload any controlled tabs once so they continue with NO worker.
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          const windowClient = client as WindowClient;
          windowClient.navigate(windowClient.url).catch(() => {});
        }
      } catch {
        /* noop */
      }
    })(),
  );
});
