import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";
import { isPublicAssetRequest, isStaticAssetRequest, mustUseNetwork } from "../lib/pwa/sw-policy";

// TypeScript: tell the compiler about the Serwist globals injected at build time
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const CURRENT_SW_GENERATION_CACHE = "trophe-sw-v2-marker";

const RETIRED_RUNTIME_CACHES = new Set([
  "apis",
  "app-images",
  "cross-origin",
  "google-fonts",
  "google-fonts-stylesheets",
  "google-fonts-webfonts",
  "next-data",
  "next-image",
  "next-static",
  "next-static-js-assets",
  "others",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "static-audio-assets",
  "static-data-assets",
  "static-font-assets",
  "static-image-assets",
  "static-js-assets",
  "static-style-assets",
  "static-video-assets",
]);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never persist application documents, RSC payloads, APIs, or Supabase.
    {
      matcher: (context) => mustUseNetwork(context),
      handler: new NetworkOnly(),
    },

    // Cache only immutable, same-origin Next.js build assets.
    {
      matcher: (context) => isStaticAssetRequest(context),
      handler: new CacheFirst({
        cacheName: "trophe-static-v2",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },

    // Cache only explicitly public, same-origin brand assets.
    {
      matcher: (context) => isPublicAssetRequest(context),
      handler: new CacheFirst({
        cacheName: "trophe-images-v2",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 365 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline.html", matcher: ({ request }) => request.mode === "navigate" }],
  },
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.has(CURRENT_SW_GENERATION_CACHE).then((isCurrentGeneration) => {
      // Bridge only the legacy worker into v2 automatically. Once v2 has
      // activated, later releases return to the explicit update button.
      if (!isCurrentGeneration) return self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CURRENT_SW_GENERATION_CACHE),
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => RETIRED_RUNTIME_CACHES.has(cacheName))
          .map((cacheName) => caches.delete(cacheName)),
      )),
    ]),
  );
});

serwist.addEventListeners();
