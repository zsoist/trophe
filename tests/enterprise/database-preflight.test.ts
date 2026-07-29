import { describe, expect, it, vi } from 'vitest';
import {
  resolveDatabaseConnectionString,
  runDatabasePreflight,
} from '../../scripts/test/require-database.mjs';

const HUNG = new Promise<never>(() => {});
const TEST_TIMEOUT_MS = 20;
const MAX_SETTLE_MS = 250;

async function runWithinTestBound(options: Parameters<typeof runDatabasePreflight>[0]) {
  const startedAt = performance.now();
  const result = await runDatabasePreflight(options);
  expect(performance.now() - startedAt).toBeLessThan(MAX_SETTLE_MS);
  return result;
}

describe('database test preflight', () => {
  it('checks the database and closes the client when it is available', async () => {
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const connect = vi.fn(() => client);

    await expect(runDatabasePreflight({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      connect,
    })).resolves.toEqual({ status: 'database_available' });

    expect(connect).toHaveBeenCalledWith(
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      5_000,
    );
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith('SELECT 1');
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('redacts unavailable database diagnostics and closes the client', async () => {
    const client = {
      connect: vi.fn().mockRejectedValue(new Error('password=secret at production.example.test')),
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runDatabasePreflight({
      connectionString: 'postgresql://username:password@production.example.test:5432/postgres',
      connect: () => client,
    });

    expect(result).toEqual({
      status: 'database_unavailable',
      repairAction: 'run_npm_run_db_bootstrap',
    });
    expect(JSON.stringify(result)).not.toContain('production.example.test');
    expect(JSON.stringify(result)).not.toContain('password');
    expect(client.query).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('closes and force-destroys a client whose connect never settles', async () => {
    const destroyClient = vi.fn();
    const client = {
      connect: vi.fn(() => HUNG),
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };

    await expect(runWithinTestBound({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      connect: () => client,
      destroyClient,
      timeoutMs: TEST_TIMEOUT_MS,
    })).resolves.toEqual({
      status: 'database_unavailable',
      repairAction: 'run_npm_run_db_bootstrap',
    });

    expect(client.query).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
    expect(destroyClient).toHaveBeenCalledWith(client);
  });

  it('closes and force-destroys a client whose query never settles', async () => {
    const destroyClient = vi.fn();
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(() => HUNG),
      end: vi.fn().mockResolvedValue(undefined),
    };

    await expect(runWithinTestBound({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      connect: () => client,
      destroyClient,
      timeoutMs: TEST_TIMEOUT_MS,
    })).resolves.toEqual({
      status: 'database_unavailable',
      repairAction: 'run_npm_run_db_bootstrap',
    });

    expect(client.end).toHaveBeenCalledOnce();
    expect(destroyClient).toHaveBeenCalledWith(client);
  });

  it('fails closed and force-destroys a client whose cleanup never settles', async () => {
    const destroyClient = vi.fn();
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      end: vi.fn(() => HUNG),
    };

    await expect(runWithinTestBound({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      connect: () => client,
      destroyClient,
      timeoutMs: TEST_TIMEOUT_MS,
    })).resolves.toEqual({
      status: 'database_unavailable',
      repairAction: 'run_npm_run_db_bootstrap',
    });

    expect(client.end).toHaveBeenCalledOnce();
    expect(destroyClient).toHaveBeenCalledWith(client);
  });

  it('closes a client after a rejected query without exposing its diagnostics', async () => {
    const destroyClient = vi.fn();
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockRejectedValue(new Error('password=secret at production.example.test')),
      end: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runWithinTestBound({
      connectionString: 'postgresql://username:password@production.example.test:5432/postgres',
      connect: () => client,
      destroyClient,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    expect(result).toEqual({
      status: 'database_unavailable',
      repairAction: 'run_npm_run_db_bootstrap',
    });
    expect(JSON.stringify(result)).not.toContain('production.example.test');
    expect(client.end).toHaveBeenCalledOnce();
    expect(destroyClient).not.toHaveBeenCalled();
  });

  it('rejects explicit and absent production URLs before any connection is selected', () => {
    expect(resolveDatabaseConnectionString({
      connectionString: 'postgresql://postgres:postgres@production.example.test:5432/postgres',
      nodeEnv: 'production',
    })).toBeNull();
    expect(resolveDatabaseConnectionString({ nodeEnv: 'production' })).toBeNull();
  });

  it('retains explicit CI URLs and the local fallback outside production', () => {
    const ciUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

    expect(resolveDatabaseConnectionString({ connectionString: ciUrl, nodeEnv: 'test' })).toBe(ciUrl);
    expect(resolveDatabaseConnectionString({ nodeEnv: 'test', environment: {} }))
      .toBe('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  });
});
