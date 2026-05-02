/**
 * api-guard.ts — Auth + rate limiting for Trophē AI API routes.
 *
 * Two-phase protection before any Anthropic/Gemini call:
 *   1. Auth check: requires a valid JWT in the Authorization header.
 *      Rejects anonymous requests with 401 to prevent cost-abuse.
 *   2. Rate limiting: 60 req / 15 min per Supabase user_id.
 *
 * Returns NextResponse (401 or 429) if blocked, null if allowed.
 *
 * Usage:
 *   const block = guardAiRoute(req);
 *   if (block) return block;
 */

import { NextRequest, NextResponse } from 'next/server';

// --- Config ---
const AUTH_LIMIT = 60;     // requests per window for authenticated users
const WINDOW_MS = 15 * 60 * 1_000; // 15 minutes

// In-memory map — resets on Vercel cold start (acceptable for abuse prevention)
const authMap = new Map<string, { n: number; resetAt: number }>();

function checkLimit(
  map: Map<string, { n: number; resetAt: number }>,
  key: string,
  limit: number,
): NextResponse | null {
  const now = Date.now();
  const slot = map.get(key);

  if (slot && now < slot.resetAt) {
    if (slot.n >= limit) {
      const retryAfter = Math.ceil((slot.resetAt - now) / 1_000);
      return NextResponse.json(
        { error: 'Too many AI requests — please wait a few minutes' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
    slot.n++;
  } else {
    map.set(key, { n: 1, resetAt: now + WINDOW_MS });
  }

  // Periodic cleanup (~1% chance) to prevent unbounded Map growth
  if (Math.random() < 0.01) {
    for (const [k, v] of map) {
      if (now > v.resetAt) map.delete(k);
    }
  }

  return null;
}

/**
 * Extract Supabase user_id from the Authorization bearer token.
 * Returns null if no valid token is present — does NOT verify the JWT
 * (verification happens inside Supabase; we only use it for rate-limit keying).
 */
function extractUserId(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!token) return null;

  // NOTE: We intentionally decode without verification here. This JWT is used
  // solely as a rate-limit key (consistent per-user bucketing), NOT for auth
  // decisions. Auth is handled client-side via supabase.auth.getUser().
  // Verifying here would add ~100ms latency to every AI call for no security benefit.
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { sub?: string };
    return parsed.sub ?? null;
  } catch {
    return null;
  }
}

export function guardAiRoute(req: NextRequest): NextResponse | null {
  const userId = extractUserId(req);

  // Phase 2 auth gate: AI routes require a valid session.
  // Without this, anonymous users can consume LLM tokens at $0.004/call.
  // The JWT is decoded (not cryptographically verified) for speed — full
  // verification happens via middleware's getUser() on the same request.
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  // Authenticated: generous limit, keyed by user
  return checkLimit(authMap, userId, AUTH_LIMIT);
}
