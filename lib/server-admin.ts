import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface AdminProfile {
  email: string;
  role: string;
}

interface AdminContext {
  serviceSupabase: SupabaseClient;
  userId: string;
  profile: AdminProfile;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function adminEmails(): Set<string> {
  const raw = process.env.TROPHE_ADMIN_EMAILS ?? 'daniel@reyes.com';
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function createServiceSupabase(): SupabaseClient {
  return createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

export async function requireAdminRequest(request: Request): Promise<AdminContext | NextResponse> {
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceSupabase = createServiceSupabase();

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Admin bearer token required' }, { status: 401 });
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  if (!accessToken) {
    return NextResponse.json({ error: 'Admin bearer token required' }, { status: 401 });
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!authResponse.ok) {
    return NextResponse.json({ error: 'Invalid or expired bearer token' }, { status: 401 });
  }

  const authUser = (await authResponse.json()) as { id?: string };
  if (!authUser.id) {
    return NextResponse.json({ error: 'Authenticated user not found' }, { status: 401 });
  }

  const { data: profile, error } = await serviceSupabase
    .from('profiles')
    .select('email, role')
    .eq('id', authUser.id)
    .maybeSingle<AdminProfile>();

  if (error || !profile?.email) {
    return NextResponse.json({ error: 'Admin profile lookup failed' }, { status: 403 });
  }

  if (!adminEmails().has(profile.email.toLowerCase())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return {
    serviceSupabase,
    userId: authUser.id,
    profile,
  };
}
