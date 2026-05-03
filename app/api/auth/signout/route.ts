import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Sign-out — Phase 2.
 *
 * Clears the Supabase session cookie and redirects to /login.
 * POST (not GET) to prevent CSRF via <img> or prefetch tags.
 *
 * Usage from client:
 *   await fetch('/api/auth/signout', { method: 'POST' });
 *   router.push('/login');
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
