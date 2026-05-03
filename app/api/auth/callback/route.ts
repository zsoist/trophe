import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * OAuth + magic-link callback handler — Phase 2.
 *
 * Supabase redirects here after:
 *   - Google / Apple OAuth (authorization code flow)
 *   - Magic-link email clicks
 *
 * Flow:
 *   1. Exchange the `code` query param for a session (PKCE)
 *   2. Write the session cookies via `@supabase/ssr`
 *   3. Redirect to `next` param (default: /dashboard)
 *
 * Supabase project settings → Auth → URL Configuration must include:
 *   http://localhost:3000/api/auth/callback  (dev)
 *   https://trophe-mu.vercel.app/api/auth/callback  (prod — Phase 9)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // OAuth error from provider (e.g. user cancelled)
  if (error) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', errorDescription ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', 'Auth code exchange failed. Please try again.');
      return NextResponse.redirect(loginUrl);
    }

    // Successful auth — redirect to intended destination.
    // Use a relative URL to avoid open-redirect attacks; validate `next`.
    const safeNext = next.startsWith('/') ? next : '/dashboard';
    return NextResponse.redirect(new URL(safeNext, origin));
  }

  // No code and no error — something unexpected. Send back to login.
  return NextResponse.redirect(new URL('/login', origin));
}
