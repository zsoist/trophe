/**
 * Trophē v0.3 — tRPC context (Phase 7).
 *
 * Created per-request in the App Router handler.
 * Reads the Supabase SSR session and loads the user's profile row.
 *
 * Available in every procedure via `ctx`:
 *   ctx.user    — Supabase auth user (null if unauthenticated)
 *   ctx.profile — profiles row with role (null if unauthenticated)
 *   ctx.db      — Drizzle db client
 *
 * Why load profile here (not in middleware):
 *   Every protected procedure needs the role for authorization.
 *   Loading it once in context avoids N profile fetches across chained procedures.
 *   Cached per-request (context is created once per tRPC call batch).
 */

import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { createServerClient } from '@supabase/ssr';
import { db } from '@/db/client';
import { profiles } from '@/db/schema/profiles';
import { eq } from 'drizzle-orm';
import type { User } from '@supabase/supabase-js';
import type { UserRole } from '@/lib/auth/get-session';

// ── Context type ───────────────────────────────────────────────────────────

export interface Context {
  user: User | null;
  profile: { id: string; role: UserRole; fullName: string; email: string } | null;
  db: typeof db;
  /** Raw request headers — available for logging/tracing. */
  headers: Headers;
}

// ── Context factory ────────────────────────────────────────────────────────

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<Context> {
  const { req } = opts;

  // Parse cookies from the request headers for SSR auth
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookieMap = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }),
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => Object.entries(cookieMap).map(([name, value]) => ({ name, value })),
        setAll: () => { /* read-only in tRPC context */ },
      },
    },
  );

  // getUser() validates the JWT server-side (not just decodes it)
  const { data: { user } } = await supabase.auth.getUser();

  let profile: Context['profile'] = null;
  if (user) {
    const [row] = await db
      .select({
        id: profiles.id,
        role: profiles.role,
        fullName: profiles.fullName,
        email: profiles.email,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    profile = row ? { ...row, role: row.role as UserRole } : null;
  }

  return {
    user,
    profile,
    db,
    headers: req.headers,
  };
}
