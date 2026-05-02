/**
 * scripts/db/run-migrations.ts
 *
 * Minimal Drizzle ORM migration runner.
 *
 * Used by bootstrap-local.sh instead of `drizzle-kit migrate` because the
 * drizzle-kit CLI spinner swallows error messages in CI (non-TTY GitHub
 * Actions), making failures opaque. This script uses drizzle-orm's migrate()
 * function directly for clear, line-by-line error output.
 *
 * Usage (from bootstrap-local.sh):
 *   DATABASE_URL="..." npx tsx scripts/db/run-migrations.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

console.log(`[run-migrations] connecting to ${connectionString.replace(/:([^:@]+)@/, ':***@')}`);

async function main() {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: join(ROOT, 'drizzle') });
    console.log('[run-migrations] ✅ all migrations applied');
  } catch (err) {
    console.error('[run-migrations] ❌ migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
