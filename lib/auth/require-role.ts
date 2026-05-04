import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession, roleAtLeast, type UserRole } from './get-session';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Server-side role guard for Route Handlers.
 *
 * Replaces the old `requireAdminRequest()` which:
 *   - fetched supabase.co/auth/v1/user on every call (+100ms)
 *   - checked an email ACL env var instead of DB roles
 *
 * This version reads the session from the HTTP-only SSR cookie (set by
 * `@supabase/ssr` middleware — zero extra HTTP round-trip) and checks
 * `profile.role` from the DB.
 *
 * Usage in a Route Handler:
 *   const guard = await requireRole(['admin', 'super_admin']);
 *   if (guard instanceof NextResponse) return guard;   // 401/403 response
 *   const { session } = guard;                         // fully typed session
 *
 * @param roles  One or more roles that are allowed. Any role in the list grants access.
 * @param options.minimum  If set, also allows any role ≥ minimum (ladder check).
 */
export async function requireRole(
  roles: UserRole[],
  options?: { minimum?: UserRole; request?: NextRequest },
): Promise<{ session: NonNullable<Awaited<ReturnType<typeof getSession>>> } | NextResponse> {
  const session = options?.request
    ? await getSessionFromRequest(options.request)
    : await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const allowed =
    roles.includes(session.role) ||
    (options?.minimum != null && roleAtLeast(session.role, options.minimum));

  if (!allowed) {
    return NextResponse.json(
      { error: `Insufficient role. Required: ${roles.join(' | ')}; got: ${session.role}` },
      { status: 403 },
    );
  }

  return { session };
}

/**
 * Convenience guard: requires the caller to be an admin or super_admin.
 * Drop-in replacement for `requireAdminRequest()`.
 */
export async function requireAdmin() {
  return requireRole(['admin', 'super_admin']);
}

export async function requireAdminRequest(request: NextRequest) {
  return requireRole(['admin', 'super_admin'], { request });
}

/**
 * Convenience guard: super_admin only.
 */
export async function requireSuperAdmin() {
  return requireRole(['super_admin']);
}

export async function requireSuperAdminRequest(request: NextRequest) {
  return requireRole(['super_admin'], { request });
}

/**
 * Convenience guard: coach or higher.
 */
export async function requireCoach() {
  return requireRole(['coach', 'admin', 'super_admin']);
}

function extractBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

async function getSessionFromRequest(
  request: NextRequest,
): Promise<NonNullable<Awaited<ReturnType<typeof getSession>>> | null> {
  const token = extractBearerToken(request);
  if (!token) return getSession();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.id) return null;

  const service = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, email, full_name, role, avatar_url, language')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) return null;

  return {
    user: { id: user.id, email: user.email ?? profile.email },
    profile: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role as UserRole,
      avatarUrl: profile.avatar_url,
      language: profile.language ?? 'en',
    },
    role: profile.role as UserRole,
  };
}
