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
 * RLS enforcement note: this Pool connects as the DB owner (per DATABASE_URL)
 * so RLS is BYPASSED by default. For per-request RLS, scripts/API routes that
 * need user-scoped queries must wrap their work with:
 *
 *   await db.execute(sql`SET LOCAL request.jwt.claim.sub = ${userId}`);
 *   await db.execute(sql`SET LOCAL request.jwt.claim.role = 'authenticated'`);
 *
 * Phase 1's RLS test suite (tests/db/rls.test.ts) does exactly this.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// In production, DATABASE_URL MUST be set to the Supabase Transaction pooler URL.
// Fail hard if missing — silent fallback to localhost would cause every query to
// hang for 5s then throw ECONNREFUSED, which is worse than a clear startup error.
const connectionString = process.env.DATABASE_URL || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('[db/client] DATABASE_URL is required in production'); })()
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
);

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
