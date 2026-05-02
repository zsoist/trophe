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

// --- Config ---
const AUTH_LIMIT = 60;     // requests per window for authenticated users
const WINDOW_MS = 15 * 60 * 1_000; // 15 minutes

// In-memory map — resets on Vercel cold start (acceptable for abuse prevention)
const authMap = new Map<string, { n: number; resetAt: number }>();

export type AiRouteGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

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

export async function guardAiRoute(req: NextRequest): Promise<AiRouteGuardResult> {
  const token = extractBearerToken(req);
  if (!token) return unauthorized();

  const userId = await verifySupabaseUser(token);
  if (!userId) {
    return unauthorized();
  }

  const rateLimit = checkLimit(authMap, userId, AUTH_LIMIT);
  if (rateLimit) return { ok: false, response: rateLimit };

  return { ok: true, userId };
}
