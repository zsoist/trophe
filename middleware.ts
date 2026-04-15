import { NextRequest, NextResponse } from 'next/server';

/**
 * Trophē middleware — security headers only.
 *
 * Auth + role gating is handled CLIENT-SIDE because Supabase JS v2
 * stores sessions in localStorage (not cookies). Without @supabase/ssr,
 * the middleware has no access to the auth token.
 *
 * Each page checks auth via supabase.auth.getUser() in useEffect.
 * Role guards are added to coach pages (redirect clients → /dashboard)
 * and dashboard pages (redirect pure coaches → /coach).
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers (applied to all routes)
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
