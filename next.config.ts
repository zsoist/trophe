import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Dev: 'unsafe-eval' is required by React dev tools to reconstruct
              // component callstacks. Omitted in production (closes codex HIGH #3).
              // 'unsafe-inline' kept for React hydration inline scripts; nonce-based
              // CSP is the Phase 8 follow-up.
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net"
                : "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://iwbpzwmidzvpiofnqexd.supabase.co https://api.nal.usda.gov https://generativelanguage.googleapis.com https://api.anthropic.com",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
