import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/durable-rate-limit';

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(1).max(120),
}).strict();

/**
 * Server-side signup using Supabase Admin API.
 * Bypasses email confirmation (mailer_autoconfirm=false) by using
 * the service role key with email_confirm: true.
 */
export async function POST(req: NextRequest) {
  // Durable rate limit by IP: 5 signups / hour (in-memory Map was per-instance
  // on serverless and trivially bypassed — audit 2026-06-12)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rate = await consumeRateLimit(`signup:${ip}`, 5, 3600);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many signups — please try again later' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  try {
    const parsed = signupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Valid email, a password of at least 8 characters, and a name are required' },
        { status: 400 },
      );
    }
    const { email, password, full_name } = parsed.data;
    // Public signup always creates a 'client' — elevated roles require the invite path
    const FORCED_ROLE = 'client' as const;

    const service = createSupabaseServiceClient();

    // 1. Create auth user with auto-confirm via Admin SDK
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: FORCED_ROLE },
    });

    if (authError || !authData.user) {
      const msg = authError?.message ?? 'Signup failed';
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        return NextResponse.json({ error: 'Email already registered. Try logging in.' }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Create profile record — role is always FORCED_ROLE, never client-supplied
    const { error: profileError } = await service
      .from('profiles')
      .insert({ id: userId, full_name, email, role: FORCED_ROLE });
    if (profileError) {
      await service.auth.admin.deleteUser(userId);
      throw new Error(`Profile creation failed: ${profileError.message}`);
    }

    // 3. Create client_profile — all public signups are clients
    const { error: clientProfileError } = await service.from('client_profiles').insert({
      user_id: userId,
      coaching_phase: 'onboarding',
    });
    if (clientProfileError) {
      await service.from('profiles').delete().eq('id', userId);
      await service.auth.admin.deleteUser(userId);
      throw new Error(`Client profile creation failed: ${clientProfileError.message}`);
    }

    // 4. Record consent for nutrition (Art. 9 special-category) processing.
    // STRICTLY ADDITIVE + non-blocking: a consent-write failure is logged but
    // never fails signup or rolls back the user (auth path is unchanged).
    // Gives a verifiable Art. 7(1) consent record at account creation.
    await service.from('consents').insert({
      user_id: userId,
      purpose: 'nutrition_processing',
      version: '1.0',
      status: 'granted',
      evidence: { source: 'signup', ip, capturedAt: new Date().toISOString() },
    }).then(({ error }) => {
      if (error) console.error('[signup] consent record failed (non-blocking):', error.message);
    }, (e) => console.error('[signup] consent record threw (non-blocking):', e));

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
