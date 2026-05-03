import { NextResponse } from 'next/server';
import { getSession, roleAtLeast, type UserRole } from './get-session';

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
  options?: { minimum?: UserRole },
): Promise<{ session: NonNullable<Awaited<ReturnType<typeof getSession>>> } | NextResponse> {
  const session = await getSession();

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

/**
 * Convenience guard: super_admin only.
 */
export async function requireSuperAdmin() {
  return requireRole(['super_admin']);
}

/**
 * Convenience guard: coach or higher.
 */
export async function requireCoach() {
  return requireRole(['coach', 'admin', 'super_admin']);
}
