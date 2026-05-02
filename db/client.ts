/**
 * Trophē v0.3 database client (Drizzle + node-postgres).
 *
 * Two purposes:
 *   1. Server-side queries from API routes / Server Components / scripts.
 *   2. Migration runner — drizzle-kit reads this Pool config too.
 *
 * Why node-postgres + Drizzle (not @supabase/supabase-js queries):
 *   - Type-safe at compile time (Phase 1 RLS test suite needs typed selects).
 *   - Works against any Postgres (Mac Mini local, Vultr Phase 9, future Neon).
 *   - Runs unchanged in Edge Runtime when needed (postgres-js / @neondatabase
 *     for edge — swap the driver here).
 *
 * The Supabase JS client is still used for AUTH only (Phase 2 cookie-based
 * sessions via @supabase/ssr). Data reads/writes go through this Drizzle pool.
 *
 * RLS enforcement note: this Pool connects as `brain_user` (table owner) so
 * RLS is BYPASSED by default. For per-request RLS, scripts/API routes that
 * need user-scoped queries must wrap their work with:
 *
 *   await db.execute(sql`SET LOCAL request.jwt.claim.sub = ${userId}`);
 *   await db.execute(sql`SET LOCAL request.jwt.claim.role = 'authenticated'`);
 *
 * Phase 1's RLS test suite (tests/db/rls.test.ts) does exactly this.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  // Include password for local Mac Mini development (brain_user on open_brain_postgres)
  `postgresql://brain_user:${process.env.PGPASSWORD || 'jDehquqo1Dj0plzyrmaX2ybtzvjeKdFF'}@127.0.0.1:5433/trophe_dev`;

declare global {
  // Reuse the pool across hot reloads in `next dev` to avoid leak warnings.
  var __trophe_pg_pool: Pool | undefined;
}

const pool =
  global.__trophe_pg_pool ??
  new Pool({
    connectionString,
    // Conservative defaults; tune after Phase 4 ingestion benchmarks.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__trophe_pg_pool = pool;
}

export const db = drizzle(pool);
export { pool };
