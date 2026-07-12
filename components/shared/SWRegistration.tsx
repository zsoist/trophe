"use client";

/**
 * Service-worker registration is intentionally retired (2026-07-12).
 *
 * The prior runtime-caching worker was the leading suspect for ~1-minute first
 * loads on iOS Safari, so app/sw.ts is now a self-destructing worker that
 * unregisters itself and purges Cache Storage. We therefore no longer register a
 * worker from the app: devices that already have one heal automatically (the
 * browser re-fetches /sw.js on navigation and applies the self-destruct worker),
 * and fresh visitors simply never get one — the site is static + immutable-cached
 * and measured fast without it.
 *
 * Kept as a no-op export so the Providers tree is unchanged. Restore a real
 * registration + update-prompt here if a caching worker is reintroduced later.
 */
export function SWRegistration() {
  return null;
}
