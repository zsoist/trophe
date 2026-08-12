import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const isDev = process.env.NODE_ENV !== 'production';
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const offlineHtmlRevision = createHash('sha256')
  .update(readFileSync(join(process.cwd(), 'public/offline.html')))
  .digest('hex');

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  register: false,
  reloadOnOnline: false,
  exclude: [/.*/],
  additionalPrecacheEntries: [{ url: "/offline.html", revision: offlineHtmlRevision }],
});

export const nextConfig: NextConfig = {
  // Worktrees can sit beside another lockfile. Pin tracing to the checkout
  // actually being built so Next never guesses a parent/sibling workspace.
  outputFileTracingRoot: process.cwd(),
  // Serwist injects a webpack config; Next 16 (Turbopack default) errors on a
  // webpack config with no turbopack config. An empty turbopack config lets
  // `next dev` (Turbopack) run while production builds use `--webpack`.
  turbopack: {},
  experimental: {
    // Tree-shake barrel imports: without this, `import { motion } from 'framer-motion'`
    // and lucide icons pull far more of the package into shared chunks than is used.
    optimizePackageImports: ['framer-motion', 'lucide-react'],
  },
  /* TypeScript and ESLint errors are now caught at build time.
     ignoreBuildErrors was removed 2026-04-07 — build passes clean.
     Next 16 removed eslint config from NextConfig — lint parity is enforced
     via vercel.json buildCommand and CI --no-cache flag instead. */
  async headers() {
    return [
      {
        // SW cache-control: must not be cached by browser/CDN
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(self)' },
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
              // AI provider endpoints (Anthropic/Gemini/DeepSeek) are called
              // server-side only — they are NOT in connect-src so an XSS can't
              // exfiltrate to them as a side channel (audit 2026-06-13).
              `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')} https://api.nal.usda.gov`,
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
