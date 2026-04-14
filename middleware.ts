import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Trophē middleware — server-side auth gate + role routing.
 *
 * 1. Protected routes (/dashboard/*, /coach/*, /onboarding) require valid JWT
 * 2. Coach routes (/coach/*) require role = 'coach' or 'both'
 * 3. Dashboard routes (/dashboard/*) require role = 'client' or 'both'
 *
 * Uses Supabase Admin API to verify the JWT — not just cookie presence.
 */

const PUBLIC_PATHS = ['/', '/login', '/demo', '/api/'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith('/api/'));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth needed
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Extract access token from Supabase auth cookie
  // Supabase stores auth in cookies named like sb-<project-ref>-auth-token
  const cookies = request.cookies.getAll();
  const authCookie = cookies.find(c => c.name.includes('auth-token'));

  if (!authCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Parse the cookie value — Supabase stores it as base64-encoded JSON with access_token
  let accessToken: string | null = null;
  try {
    // Cookie format: base64(JSON([access_token, refresh_token, ...]))
    const decoded = JSON.parse(
      Buffer.from(authCookie.value, 'base64').toString('utf8')
    );
    accessToken = Array.isArray(decoded) ? decoded[0] : decoded?.access_token;
  } catch {
    // Try as plain token
    accessToken = authCookie.value;
  }

  if (!accessToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Verify the JWT by calling Supabase auth endpoint
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next(); // Can't verify — let client-side handle
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Role-based routing
    const isCoachRoute = pathname.startsWith('/coach');
    const isDashboardRoute = pathname.startsWith('/dashboard');

    if (isCoachRoute || isDashboardRoute) {
      // Fetch profile to check role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = profile?.role || 'client';

      if (isCoachRoute && role === 'client') {
        // Clients cannot access coach pages
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      if (isDashboardRoute && role === 'coach') {
        // Pure coaches redirect to coach dashboard
        return NextResponse.redirect(new URL('/coach', request.url));
      }
    }
  } catch {
    // Auth verification failed — redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and API
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
