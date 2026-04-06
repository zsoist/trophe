import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side signup using Supabase Admin API.
 * Bypasses email confirmation (mailer_autoconfirm=false) by using
 * the service role key with email_confirm: true.
 *
 * This is the correct pattern for demo/MVP apps where email
 * verification would block the user experience.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, role } = await req.json();

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
        user_metadata: { full_name, role: role || 'client' },
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

    // 2. Create profile record
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
        role: role || 'client',
      }),
    });

    // 3. Create client_profile for client/both roles
    if (role === 'client' || role === 'both' || !role) {
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
