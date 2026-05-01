import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for Trophē v0.3.
 *
 * - `schema`: barrel export at db/schema/index.ts (20+ tables split per domain)
 * - `out`: versioned migrations in drizzle/, replacing the root supabase-schema.sql
 *   files (which are now DEPRECATED — kept only as Phase 0 ingestion source).
 * - `dbCredentials.url` reads DATABASE_URL from .env.local. The default below
 *   pins 127.0.0.1 (NOT `localhost`) because macOS resolves `localhost` to ::1
 *   first and `open_brain_postgres` only binds IPv4. Discovered Phase 0.
 */
export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://brain_user@127.0.0.1:5433/trophe_dev',
  },
  // Capture both `public` (app data) and `auth` (Supabase auth shim) so the
  // FK from `profiles.id` → `auth.users.id` resolves on introspect. Without
  // this, drizzle-kit emits `usersInAuth` references but never defines the
  // table, breaking typecheck.
  schemaFilter: ['public', 'auth'],
  verbose: true,
  strict: true,
});
