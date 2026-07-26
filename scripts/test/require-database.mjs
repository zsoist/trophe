import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DATABASE_TIMEOUT_MS = 5_000;

/**
 * @typedef {{
 *   connect: () => Promise<unknown>,
 *   query: (sql: string) => Promise<unknown>,
 *   end: () => Promise<unknown>,
 * }} DatabasePreflightClient
 */

function unavailable() {
  return {
    status: 'database_unavailable',
    repairAction: 'run_npm_run_db_bootstrap',
  };
}

function withinDeadline(operation, timeoutMs) {
  let timer;

  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('database preflight timed out')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function resolveDatabaseConnectionString({
  connectionString = process.env.DATABASE_URL,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  if (connectionString) return connectionString;
  return nodeEnv === 'production' ? null : LOCAL_DATABASE_URL;
}

/**
 * @param {{
 *   connectionString?: string | null,
 *   connect?: (url: string) => DatabasePreflightClient,
 *   timeoutMs?: number,
 * }} options
 */
export async function runDatabasePreflight({
  connectionString,
  connect = (url) => new pg.Client({ connectionString: url, connectionTimeoutMillis: DATABASE_TIMEOUT_MS }),
  timeoutMs = DATABASE_TIMEOUT_MS,
} = {}) {
  if (!connectionString) return unavailable();

  let client;
  try {
    client = connect(connectionString);
    await withinDeadline(client.connect(), timeoutMs);
    await withinDeadline(client.query('SELECT 1'), timeoutMs);
    return { status: 'database_available' };
  } catch {
    return unavailable();
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // The preflight result is intentionally the only diagnostic surface.
      }
    }
  }
}

async function main() {
  const result = await runDatabasePreflight({
    connectionString: resolveDatabaseConnectionString(),
  });

  if (result.status === 'database_unavailable') {
    process.stderr.write('Database prerequisite unavailable. Run npm run db:bootstrap.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
