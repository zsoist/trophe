import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* TypeScript and ESLint errors are now caught at build time.
     ignoreBuildErrors was removed 2026-04-07 — build passes clean. */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // CSP removed 2026-04-15: was blocking Supabase fetch on mobile browsers.
          // Wildcard *.supabase.co not reliably supported across all mobile browsers.
          // Keep the other security headers. Re-add CSP with explicit domain after testing.
        ],
      },
    ];
  },
};

export default nextConfig;
