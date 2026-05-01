import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const MagicLinkBody = z.object({
  email: z.string().email('Invalid email address'),
  redirectTo: z.string().optional(),
});

/**
 * Magic-link email — Phase 2.
 *
 * Sends a one-time login link via Supabase Auth. The user clicks the link →
 * browser hits `/api/auth/callback?code=...` → session cookie is set.
 *
 * No password needed. Works with Supabase's built-in SMTP (dev/staging) or
 * a Resend sender configured in the Supabase project settings.
 *
 * POST /api/auth/magic-link
 * Body: { email: string, redirectTo?: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = MagicLinkBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    );
  }

  const { email, redirectTo } = parsed.data;

  // Safe redirect URL — must stay on the same origin.
  const callbackUrl = new URL('/api/auth/callback', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
  if (redirectTo?.startsWith('/')) {
    callbackUrl.searchParams.set('next', redirectTo);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      shouldCreateUser: false, // Only existing users; registration goes through /signup
    },
  });

  if (error) {
    // Don't leak whether the email exists; always return success to the client.
    // Log the real error server-side only.
    console.error('[magic-link] OTP error:', error.message);
  }

  // Always 200 — avoids email enumeration.
  return NextResponse.json({
    message: 'If an account exists for that email, a login link has been sent.',
  });
}
