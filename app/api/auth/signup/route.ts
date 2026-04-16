import { NextRequest, NextResponse } from 'next/server';

// ─── Rate limiting for signup ───────────────────────────────────
const SIGNUP_LIMIT = 5; // max per window
const SIGNUP_WINDOW_MS = 60 * 60 * 1_000; // 1 hour
const signupMap = new Map<string, { n: number; resetAt: number }>();

function checkSignupRate(ip: string): NextResponse | null {
  const now = Date.now();
  const slot = signupMap.get(ip);
  if (slot && now < slot.resetAt) {
    if (slot.n >= SIGNUP_LIMIT) {
      return NextResponse.json(
        { error: 'Too many signups — please try again later' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((slot.resetAt - now) / 1000)) } },
      );
    }
    slot.n++;
  } else {
    signupMap.set(ip, { n: 1, resetAt: now + SIGNUP_WINDOW_MS });
  }
  // Periodic cleanup
  if (Math.random() < 0.05) {
    for (const [k, v] of signupMap) { if (now > v.resetAt) signupMap.delete(k); }
  }
  return null;
}

/**
 * Server-side signup using Supabase Admin API.
 * Bypasses email confirmation (mailer_autoconfirm=false) by using
 * the service role key with email_confirm: true.
 */
export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rateBlock = checkSignupRate(ip);
  if (rateBlock) return rateBlock;

  try {
    const { email, password, full_name } = await req.json();
    // Public signup always creates a 'client' — elevated roles require the invite path
    const FORCED_ROLE = 'client' as const;

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 1. Create auth user with auto-confirm via Admin API
    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: FORCED_ROLE },
      }),
    });

    const authData = await authRes.json();

    if (!authRes.ok) {
      const msg = authData.msg || authData.message || 'Signup failed';
      // Handle duplicate email
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        return NextResponse.json({ error: 'Email already registered. Try logging in.' }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: authRes.status });
    }

    const userId = authData.id;

    // 2. Create profile record — role is always FORCED_ROLE, never client-supplied
    await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: userId,
        full_name,
        email,
        role: FORCED_ROLE,
      }),
    });

    // 3. Create client_profile — all public signups are clients
    if (true) {
      await fetch(`${supabaseUrl}/rest/v1/client_profiles`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_id: userId,
          coaching_phase: 'onboarding',
        }),
      });
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
