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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Phase 2: removed 'unsafe-eval' (closes codex HIGH #3).
              // Next.js 15+ no longer needs unsafe-eval in production builds.
              // 'unsafe-inline' kept for React hydration inline scripts; a
              // nonce-based CSP is the Phase 8 follow-up when we own all
              // script tags in the new UI.
              "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
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
