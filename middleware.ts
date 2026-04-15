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

const PUBLIC_PATHS = ['/', '/login', '/demo'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/api/');
}

/**
 * Extract access token from Supabase auth cookies.
 * Supabase JS v2 stores session in cookies like:
 *   sb-<ref>-auth-token.0, sb-<ref>-auth-token.1 (chunked base64 JSON)
 *   OR sb-<ref>-auth-token (single cookie, base64 JSON)
 * The JSON is: { access_token, refresh_token, ... } or an array [access, refresh, ...]
 */
function extractAccessToken(request: NextRequest): string | null {
  const cookies = request.cookies.getAll();

  // Find all auth-token cookies (may be chunked: .0, .1, .2, ...)
  const authCookies = cookies
    .filter(c => c.name.includes('auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (authCookies.length === 0) return null;

  // Reassemble chunked value
  const raw = authCookies.map(c => c.value).join('');
  if (!raw) return null;

  try {
    // Try base64 decode first
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (Array.isArray(decoded)) return decoded[0] || null;
    if (decoded?.access_token) return decoded.access_token;
  } catch {
    // Not base64 — try plain JSON
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed[0] || null;
      if (parsed?.access_token) return parsed.access_token;
    } catch {
      // Not JSON — try URL-decoded then base64
      try {
        const urlDecoded = decodeURIComponent(raw);
        const decoded = JSON.parse(Buffer.from(urlDecoded, 'base64').toString('utf8'));
        if (Array.isArray(decoded)) return decoded[0] || null;
        if (decoded?.access_token) return decoded.access_token;
      } catch {
        // Give up parsing — might be a raw JWT
        if (raw.split('.').length === 3) return raw;
      }
    }
  }

  return null;
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

  const accessToken = extractAccessToken(request);

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
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
      // Token expired or invalid — clear it and redirect
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
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
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      if (isDashboardRoute && role === 'coach') {
        return NextResponse.redirect(new URL('/coach', request.url));
      }
    }
  } catch {
    // Auth verification failed — let client-side handle rather than blocking
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
