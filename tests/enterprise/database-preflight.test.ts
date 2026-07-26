import { describe, expect, it, vi } from 'vitest';
import { runDatabasePreflight } from '../../scripts/test/require-database.mjs';

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

    expect(connect).toHaveBeenCalledWith('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
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
});
