import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

function redirectWithSessionCookies(
  url: URL,
  sessionResponse: NextResponse,
): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return applySecurityHeaders(redirect);
}

/**
 * Trophē proxy — Phase 2.
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
 *   /api/admin/*    → must be authenticated (role check inside route handler)
 *   /api/seed/*     → must be authenticated (role check inside route handler)
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

  // PERF: a request with no Supabase cookies has no session to validate OR
  // refresh — skip getUser() entirely. This removes the auth round-trip from
  // every anonymous page view (landing, pricing, trust), which was adding
  // latency to exactly the pages that must feel instant. Protected paths
  // still fail closed: user stays null → redirect to /login below.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));

  // When cookies exist, always call getUser() — this is what triggers the
  // cookie refresh. Do NOT use getSession() here (stale cookie risk).
  //
  // Resilience: if the auth backend is unreachable (Supabase outage, CI
  // without a local Supabase), treat the request as anonymous instead of
  // letting the fetch error 500 every page. Public pages stay up; protected
  // paths still fail closed (anonymous → redirect to /login).
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  if (hasAuthCookie) {
    try {
      ({ data: { user } } = await supabase.auth.getUser());
    } catch (err) {
      console.error('[proxy] auth backend unreachable, treating as anonymous:', err instanceof Error ? err.message : err);
    }
  }

  const { pathname } = request.nextUrl;

  // ─── Protected paths ────────────────────────────────────────────────────────
  const isProtected =
    pathname.startsWith('/coach') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/seed') ||
    pathname.startsWith('/super') ||
    pathname.startsWith('/dashboard') ||
    pathname === '/onboarding';

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return redirectWithSessionCookies(loginUrl, response);
  }

  // ─── Auth pages — redirect authenticated users away ─────────────────────────
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  if (isAuthPage && user) {
    return redirectWithSessionCookies(new URL('/dashboard', request.url), response);
  }

  // ─── Security headers (applied to all responses) ────────────────────────────
  return applySecurityHeaders(response);
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
