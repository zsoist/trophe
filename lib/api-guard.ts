/**
 * api-guard.ts — Rate limiting for Trophē AI API routes.
 *
 * Applies two-tier rate limiting before any Anthropic/Gemini call:
 *   • Authenticated users: 60 req / 15 min per Supabase user_id
 *   • Anonymous (no JWT):  10 req / 15 min per IP — very strict
 *
 * Returns NextResponse (429) if rate-limited, null if allowed.
 *
 * Usage:
 *   const block = await guardAiRoute(req);
 *   if (block) return block;
 */

import { NextRequest, NextResponse } from 'next/server';

// --- Config ---
const AUTH_LIMIT = 60;     // requests per window for authenticated users
const ANON_LIMIT = 10;     // requests per window for anonymous (IP-based)
const WINDOW_MS = 15 * 60 * 1_000; // 15 minutes

// In-memory maps — reset on Vercel cold start (acceptable for abuse prevention)
const authMap = new Map<string, { n: number; resetAt: number }>();
const anonMap = new Map<string, { n: number; resetAt: number }>();

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

  // JWT payload is base64url in the middle segment — decode without verification
  // (we use it only as a rate-limit key, not for auth decisions)
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

  if (userId) {
    // Authenticated: generous limit, keyed by user
    return checkLimit(authMap, userId, AUTH_LIMIT);
  }

  // Anonymous: strict limit, keyed by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  return checkLimit(anonMap, ip, ANON_LIMIT);
}
