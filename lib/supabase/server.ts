import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client — Phase 2.
 *
 * Reads the session from HTTP-only cookies (set by the browser client and
 * refreshed by the middleware). Usable in:
 *   - Server Components
 *   - Route Handlers (app/api/*)
 *   - Server Actions
 *
 * ALWAYS call `getUser()` (not `getSession()`) — Supabase recommends this
 * because `getSession()` can return stale data from the cookie without
 * re-validating against the auth server.
 *
 * Usage:
 *   const supabase = await createSupabaseServerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` is called from Server Components where the cookies
            // header cannot be mutated — safe to ignore (middleware handles
            // the refresh).
          }
        },
      },
    },
  );
}

/**
 * Service-role client for server-only admin operations (bypasses RLS).
 * Only available in server contexts; never expose to the client.
 */
export function createSupabaseServiceClient() {
  // Import directly — this file is server-only (not bundled for browser).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
