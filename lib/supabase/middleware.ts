import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware Supabase client factory — Phase 2.
 *
 * Creates a `@supabase/ssr` client that reads/writes cookies from the incoming
 * Next.js request. The middleware's job is to:
 *   1. Refresh the access token if it has expired (writes updated cookies)
 *   2. Return the (possibly refreshed) response so cookies propagate downstream
 *
 * The returned `{ supabase, response }` pair MUST be used together — always
 * return `response` from middleware so the refreshed cookie is sent to the browser.
 *
 * Usage (see middleware.ts at project root):
 *   const { supabase, response } = createSupabaseMiddlewareClient(request);
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  // Start with a plain NextResponse.next() that we'll attach cookie mutations to.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies to both the request (for downstream middleware) and
          // the response (to propagate to the browser).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  return { supabase, response };
}
