import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DATABASE_TIMEOUT_MS = 5_000;

class DatabasePreflightTimeout extends Error {}

/**
 * @typedef {{
 *   connect: () => Promise<unknown>,
 *   query: (sql: string) => Promise<unknown>,
 *   end: () => Promise<unknown>,
 *   connection?: { stream?: { destroy?: () => void } },
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
      timer = setTimeout(() => reject(new DatabasePreflightTimeout()), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function invokeWithinDeadline(invoke, timeoutMs) {
  return withinDeadline(Promise.resolve().then(invoke), timeoutMs);
}

function defaultDestroyClient(client) {
  client.connection?.stream?.destroy?.();
}

async function closeWithinDeadline(client, timeoutMs) {
  try {
    await invokeWithinDeadline(() => client.end(), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ connectionString?: string | null, nodeEnv?: string }} options
 * @returns {string | null}
 */
export function resolveDatabaseConnectionString({
  connectionString,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  if (nodeEnv === 'production') return null;
  return connectionString || process.env.DATABASE_URL || LOCAL_DATABASE_URL;
}

/**
 * @param {{
 *   connectionString?: string | null,
 *   connect?: (url: string, timeoutMs: number) => DatabasePreflightClient,
 *   destroyClient?: (client: DatabasePreflightClient) => void,
 *   timeoutMs?: number,
 * }} options
 *
 * Each connect, query, and graceful-cleanup stage is bounded by `timeoutMs`,
 * so the complete preflight settles within three deadline intervals plus the
 * synchronous forced transport teardown. A timed-out operation or cleanup
 * fails closed after calling the injected `destroyClient` seam.
 */
export async function runDatabasePreflight({
  connectionString,
  connect = (url, timeoutMs) => new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  }),
  destroyClient = defaultDestroyClient,
  timeoutMs = DATABASE_TIMEOUT_MS,
} = {}) {
  if (!connectionString) return unavailable();

  let client;
  let probeSucceeded = false;
  let operationTimedOut = false;
  try {
    client = connect(connectionString, timeoutMs);
    await invokeWithinDeadline(() => client.connect(), timeoutMs);
    await invokeWithinDeadline(() => client.query('SELECT 1'), timeoutMs);
    probeSucceeded = true;
  } catch (error) {
    operationTimedOut = error instanceof DatabasePreflightTimeout;
  }

  if (!client) return unavailable();

  const cleanupSucceeded = await closeWithinDeadline(client, timeoutMs);
  if (operationTimedOut || !cleanupSucceeded) {
    try {
      destroyClient(client);
    } catch {
      // The preflight result is intentionally the only diagnostic surface.
    }
  }

  return probeSucceeded && cleanupSucceeded && !operationTimedOut
    ? { status: 'database_available' }
    : unavailable();
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
