import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for Trophē v0.3.
 *
 * - `schema`: barrel export at db/schema/index.ts (20+ tables split per domain)
 * - `out`: versioned migrations in drizzle/, replacing the root supabase-schema.sql
 *   files (which are now DEPRECATED — kept only as Phase 0 ingestion source).
 * - `dbCredentials.url` reads DATABASE_URL from the environment. The fallback
 *   targets the canonical local Supabase CLI database on `127.0.0.1:54322`.
 */
export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // DIRECT_URL = Supabase direct connection (port 5432) for migrations.
    // DATABASE_URL = Supabase Transaction pooler (port 6543) for app runtime.
    // drizzle-kit must always use the direct connection — pooler Transaction mode
    // does not support DDL statements (CREATE TABLE, ALTER, etc.).
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
  // Capture both `public` (app data) and `auth` (Supabase auth shim) so the
  // FK from `profiles.id` → `auth.users.id` resolves on introspect. Without
  // this, drizzle-kit emits `usersInAuth` references but never defines the
  // table, breaking typecheck.
  schemaFilter: ['public', 'auth'],
  verbose: true,
  strict: true,
});
