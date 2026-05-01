/**
 * server-admin.ts — Phase 2 replacement.
 *
 * The old implementation:
 *   - Fetched supabase.co/auth/v1/user on every call (~100ms extra latency)
 *   - Checked TROPHE_ADMIN_EMAILS env var (email allowlist, not role-based)
 *
 * This replacement:
 *   - Reads the session from the HTTP-only cookie set by @supabase/ssr (0ms overhead)
 *   - Checks profile.role from the DB (closes codex HIGH #2: admin email ACL)
 *   - `requireAdmin()` allows role ∈ {admin, super_admin}
 *   - `requireSuperAdmin()` allows only super_admin
 *
 * Routes that import `requireAdminRequest` must be updated to:
 *   const guard = await requireAdmin();
 *   if (guard instanceof NextResponse) return guard;
 *   const { session } = guard;
 */

// Re-export the new role guards as drop-in replacements.
export { requireAdmin, requireSuperAdmin, requireCoach, requireRole } from './auth/require-role';
export { createSupabaseServiceClient as createServiceSupabase } from './supabase/server';

// Backward-compat: keep requireAdminRequest as an alias for requireAdmin.
export { requireAdmin as requireAdminRequest } from './auth/require-role';
