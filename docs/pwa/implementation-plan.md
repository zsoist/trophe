# Trophē PWA — Implementation Plan (frontier 2026, researched)

> **HISTORICAL / point-in-time planning record (pre-build).** The PWA is now SHIPPED & LIVE — installable on iOS + Android as of 2026-06-15. Read this as the planned approach, not current state. Current state: docs/audits/remediation-status-2026-06-15.md + README.md.

Goal: premium, installable PWA from the existing Next.js 16 app. Clients install to
home screen + offline + push-ready; coaches use desktop. Cheapest path to "a real app".

## Stack decision
- **Serwist `@serwist/next` v9.5.x** (maintained successor to next-pwa, Workbox-based, App Router native).
- ⚠️ **CRITICAL GOTCHA**: Next.js 16 defaults to **Turbopack**, but Serwist's SW compile needs **webpack**.
  Production build MUST be `next build --webpack`. Dev stays `--turbopack` + `SERWIST_SUPPRESS_TURBOPACK_WARNING=1`.
  This changes vercel.json buildCommand → verify the build still passes before shipping.
- ⚠️ `/sw.js` MUST have `Cache-Control: no-cache` (next.config headers) + `updateViaCache:'none'` on register,
  or users get stuck on an old SW forever.

## Pieces
1. `app/manifest.ts` (Next 16 native → /manifest.webmanifest): id, name/short_name, start_url `/dashboard?source=pwa`,
   display standalone + display_override [window-controls-overlay (desktop coach), standalone], theme #D4A853,
   background #0a0a0a, categories [health,fitness,food], icons 192/512/maskable/monochrome, **shortcuts** (Log food, Today),
   **screenshots** (narrow+wide for richer Android/desktop install UI).
2. **Icons + iOS splash**: generate from brand mark via `pwa-asset-generator` (192/512/maskable/apple-touch-180 + iOS splash set).
3. **iOS meta** (layout.tsx metadata.appleWebApp: capable, black-translucent, title; viewport-fit=cover; apple-touch-icon).
   iOS: NO beforeinstallprompt → must show "Share → Add to Home Screen" instructions. Push needs home-screen install + permission (16.4+).
4. **src/sw.ts** (Serwist): NetworkFirst(3s) for navigations, CacheFirst for /_next/static + images, SWR for fonts,
   **NetworkOnly for ALL /api/* + Supabase** (never cache authed/AI responses — leak risk), offline fallback /offline.
   skipWaiting + clientsClaim + navigationPreload.
5. **Custom install UX**: useInstallPrompt hook (capture beforeinstallprompt on Android, detect standalone, detect iOS),
   premium gold/dark InstallCard; show AFTER first food log or 2nd visit (not first load); localStorage 7-day cooldown.
6. **app/offline/page.tsx** branded offline page; precache it.
7. **CSS polish** (globals): overscroll-behavior contain (no pull-refresh bounce), env(safe-area-inset-*) for notch/home-indicator,
   inputs font-size max(16px,1rem) (no iOS zoom), -webkit-tap-highlight-color transparent, @media (display-mode: standalone) hide browser-only.
8. **Offline food-log queue** (progressive enhancement): IndexedDB outbox + Background Sync (Chrome) + `online`-event fallback (iOS). Worth it for gym/cafe connectivity.
9. **Auth/cache safety**: NetworkOnly for SSR-authed pages (no cross-user HTML leak); clear caches on Supabase signOut; update-available toast.

## 5 pitfalls
1. Turbopack breaks Serwist build → must `--webpack`. 2. Caching authed HTML leaks user data → NetworkOnly for authed routes.
3. Not setting no-cache on sw.js → stuck on old SW. 4. iOS: no beforeinstallprompt / no Background Sync / 7-day cache eviction.
5. iOS push needs home-screen install + explicit permission (not Safari tab).

## Phasing (≈3 days)
P1 foundation (Serwist + manifest + icons + iOS meta) → P2 offline (SW + /offline + queue) → P3 install UX (hook + card) → P4 polish + Lighthouse PWA 100 + device test.

Full research brief: this session's research agent output (cited: Next.js 16 docs, Serwist 9.5.11, web.dev, MagicBell iOS-limits, Aurora Scharff icons guide).
