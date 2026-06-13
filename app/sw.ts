import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

// TypeScript: tell the compiler about the Serwist globals injected at build time
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // ── NEVER cache authenticated API routes or Supabase ──────────────────
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/") ||
        url.hostname.endsWith(".supabase.co") ||
        url.hostname.endsWith(".supabase.in"),
      handler: new NetworkOnly(),
    },

    // ── Next.js static assets: CacheFirst, long TTL ───────────────────────
    {
      matcher: ({ request, url }) =>
        url.pathname.startsWith("/_next/static/") ||
        request.destination === "script" ||
        request.destination === "style",
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },

    // ── App icons & public images: CacheFirst ────────────────────────────
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/icons/") ||
        url.pathname.startsWith("/images/") ||
        url.pathname === "/favicon.svg" ||
        url.pathname === "/apple-touch-icon.png",
      handler: new CacheFirst({
        cacheName: "app-images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 365 * 24 * 60 * 60 }),
        ],
      }),
    },

    // ── Google Fonts: StaleWhileRevalidate ───────────────────────────────
    {
      matcher: ({ url }) =>
        url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
      handler: new StaleWhileRevalidate({
        cacheName: "google-fonts",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 365 * 24 * 60 * 60 }),
        ],
      }),
    },

    // ── Navigation (HTML pages): NetworkFirst, 3s timeout ────────────────
    // Authenticated routes excluded — SW must not serve stale authed HTML
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
        ],
      }),
    },

    // ── Default: use Serwist's built-in defaults ─────────────────────────
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.mode === "navigate" }],
  },
});

serwist.addEventListeners();
