/**
 * api-guard.ts — Auth + rate limiting for Trophē AI API routes.
 *
 * Two-phase protection before any Anthropic/Gemini call:
 *   1. Auth check: requires a valid JWT in the Authorization header.
 *      Rejects anonymous requests with 401 to prevent cost-abuse.
 *   2. Rate limiting: 60 req / 15 min per Supabase user_id.
 *
 * Returns `{ ok: false, response }` (401 or 429) if blocked, otherwise
 * `{ ok: true, userId }` with the verified Supabase user id.
 *
 * Usage:
 *   const guard = await guardAiRoute(req);
 *   if (!guard.ok) return guard.response;
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';

// --- Config ---
const AUTH_LIMIT = 60;     // requests per window for authenticated users
const WINDOW_MS = 15 * 60 * 1_000; // 15 minutes

/**
 * User IDs that bypass the per-user rate limit.
 * Used exclusively for automated eval runs that exceed 60 req / 15 min.
 * Adding/removing requires a code change + deploy (intentional).
 */
const RATE_LIMIT_BYPASS_USER_IDS = new Set([
  '7dbb5644-6a38-4f48-a512-d8be68e97ab7', // eval-tester-2026@trophe.app
  'f7f6350f-b210-46ea-88ce-409d03e9eaa7', // eval-tester-2026@trophe.app (current)
]);

export type AiRouteGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

async function checkLimit(key: string, limit: number): Promise<NextResponse | null> {
  const result = await consumeRateLimit(`ai:${key}`, limit, WINDOW_MS / 1_000);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: 'Too many AI requests — please wait a few minutes' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  );
}

function unauthorized(): AiRouteGuardResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    ),
  };
}

function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  return token.trim() || null;
}

async function verifySupabaseUser(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

/**
 * Try cookie-based auth via @supabase/ssr (v0.3 browser sessions).
 * Uses the same pattern as lib/supabase/server.ts — reads HTTP-only
 * cookies set by the middleware + browser client.
 */
async function getUserFromCookie(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.id) return null;
    return user.id;
  } catch {
    // cookies() can throw in edge cases — treat as unauthenticated
    return null;
  }
}

export async function guardAiRoute(req: NextRequest): Promise<AiRouteGuardResult> {
  // Path 1: Bearer token (eval runner, server-to-server, legacy clients)
  const token = extractBearerToken(req);
  if (token) {
    const userId = await verifySupabaseUser(token);
    if (userId) {
      if (!RATE_LIMIT_BYPASS_USER_IDS.has(userId)) {
        const rateLimit = await checkLimit(userId, AUTH_LIMIT);
        if (rateLimit) return { ok: false, response: rateLimit };
      }
      return { ok: true, userId };
    }
    // Invalid Bearer token — fall through to cookie check
  }

  // Path 2: Cookie-based auth (browser sessions via @supabase/ssr)
  const cookieUserId = await getUserFromCookie();
  if (cookieUserId) {
    if (!RATE_LIMIT_BYPASS_USER_IDS.has(cookieUserId)) {
      const rateLimit = await checkLimit(cookieUserId, AUTH_LIMIT);
      if (rateLimit) return { ok: false, response: rateLimit };
    }
    return { ok: true, userId: cookieUserId };
  }

  return unauthorized();
}
