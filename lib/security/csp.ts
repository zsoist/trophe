/**
 * Content-Security-Policy for every Trophē response.
 *
 * Kept as a pure function so tests can assert the exact directives without
 * importing `next.config.ts` (which pulls in Serwist and reads build files).
 *
 * Design notes:
 * - AI provider endpoints (Anthropic/Gemini/DeepSeek) are called server-side
 *   only — they are deliberately NOT in `connect-src`, so an XSS cannot use
 *   them as an exfiltration side channel (audit 2026-06-13).
 * - AI Form Check runs MediaPipe Pose in the browser. The WASM runtime is
 *   served by jsDelivr and the pose model by Google Cloud Storage; both are
 *   fetched with `fetch()` (governed by `connect-src`), and instantiating the
 *   WASM needs `'wasm-unsafe-eval'` in `script-src`. `'wasm-unsafe-eval'`
 *   allows WebAssembly only — it does not re-enable `eval()` (owner review
 *   2026-09-03, SEC-1).
 * - `'unsafe-eval'` is dev-only (React dev tools). `'unsafe-inline'` remains
 *   for React hydration scripts; nonce-based CSP is the Phase 8 follow-up.
 */

export const MEDIAPIPE_WASM_ORIGIN = 'https://cdn.jsdelivr.net';
export const MEDIAPIPE_MODEL_ORIGIN = 'https://storage.googleapis.com';
export const USDA_API_ORIGIN = 'https://api.nal.usda.gov';

export type CspOptions = {
  isDev: boolean;
  supabaseOrigin: string;
};

export function buildContentSecurityPolicy({ isDev, supabaseOrigin }: CspOptions): string {
  const supabaseWs = supabaseOrigin.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${MEDIAPIPE_WASM_ORIGIN}`
    : `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${MEDIAPIPE_WASM_ORIGIN}`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${USDA_API_ORIGIN} ${MEDIAPIPE_WASM_ORIGIN} ${MEDIAPIPE_MODEL_ORIGIN}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * True when the policy grants classic `eval()` (the `'unsafe-eval'` token).
 * `'wasm-unsafe-eval'` contains the same letters but only permits WebAssembly,
 * so a plain substring check would produce false positives — use this instead.
 */
export function cspAllowsClassicEval(csp: string): boolean {
  return /(^|[\s;])'unsafe-eval'(?=[\s;]|$)/.test(csp);
}
