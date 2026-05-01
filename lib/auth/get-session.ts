import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Role hierarchy — mirrors `user_role` Postgres enum from Phase 1.
 * Used for role comparisons without importing from DB schema.
 */
export type UserRole = 'super_admin' | 'admin' | 'coach' | 'client';

export interface SessionProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  language: string;
}

export interface Session {
  user: { id: string; email: string };
  profile: SessionProfile;
  role: UserRole;
}

/**
 * Fetch the current authenticated session including the DB-sourced role.
 *
 * - Uses `getUser()` (not `getSession()`) to avoid stale cookie data.
 * - Fetches `profiles` row via anon client (RLS ensures only own row is readable).
 * - Returns `null` if unauthenticated or profile missing.
 *
 * Usage in Server Components / Route Handlers:
 *   const session = await getSession();
 *   if (!session) redirect('/login');
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
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

/**
 * Role ladder for range comparisons.
 * Super admin > admin > coach > client.
 */
const ROLE_WEIGHT: Record<UserRole, number> = {
  super_admin: 4,
  admin: 3,
  coach: 2,
  client: 1,
};

/** Returns true if `actual` role meets or exceeds `minimum`. */
export function roleAtLeast(actual: UserRole, minimum: UserRole): boolean {
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[minimum];
}
