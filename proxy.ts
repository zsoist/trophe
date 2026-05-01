import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

/**
 * Trophē middleware — Phase 2.
 *
 * Two responsibilities:
 *   1. Session refresh: `@supabase/ssr` reads the access-token cookie, silently
 *      refreshes it if expired, and writes the new cookie to the response. This
 *      keeps Server Components from seeing a stale/expired session.
 *
 *   2. Coarse auth gate: unauthenticated requests to protected paths are
 *      redirected to /login. Fine-grained role checks happen inside the routes
 *      themselves via `requireRole()` / `requireAdmin()` — doing DB calls at the
 *      edge for every request would add too much latency.
 *
 * Route protection matrix:
 *   /coach/*        → must be authenticated (role check inside route/page)
 *   /admin/*        → must be authenticated (role check inside route/page)
 *   /super/*        → must be authenticated (role check inside route/page)
 *   /dashboard/*    → must be authenticated
 *   /onboarding     → must be authenticated
 *   /login, /signup → redirect to /dashboard if already authenticated
 *   everything else → public (marketing, API health, static assets)
 *
 * Closes codex HIGH #1: "middleware.ts admits auth is handled client-side".
 */
export async function proxy(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request);

  // Always call getUser() — this is what triggers the cookie refresh.
  // Do NOT use getSession() here (stale cookie risk).
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ─── Protected paths ────────────────────────────────────────────────────────
  const isProtected =
    pathname.startsWith('/coach') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/super') ||
    pathname.startsWith('/dashboard') ||
    pathname === '/onboarding';

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ─── Auth pages — redirect authenticated users away ─────────────────────────
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // ─── Security headers (applied to all responses) ────────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *  - _next/static (static files)
     *  - _next/image  (image optimisation)
     *  - favicon.ico
     *  - static image files
     * This keeps the middleware off hot asset paths where session checking
     * would add zero value but measurable overhead.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
