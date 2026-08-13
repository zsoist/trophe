import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertLoopbackDatabaseUrl,
  assertLoopbackSupabaseUrl,
  assertSupabaseOperation,
  assertSupabaseAffectedRow,
  assertAuthUserAbsent,
  buildLocalDevEnv,
  buildLocalPlaywrightEnv,
  buildLocalThemePerformanceEnv,
  formatLocalE2EError,
  localE2ECachePath,
  localAppOrigin,
  parseSupabaseStatusEnv,
  retryLocalE2EOperation,
  resolveSupabaseCli,
  withDisposableUsers,
  withFixtureCleanup,
  cleanupFixtureResources,
} from '../../scripts/test/local-auth-e2e-core.mjs';

describe('local authenticated E2E harness', () => {
  const originalNextDistDir = process.env.NEXT_DIST_DIR;

  afterEach(() => {
    if (originalNextDistDir === undefined) delete process.env.NEXT_DIST_DIR;
    else process.env.NEXT_DIST_DIR = originalNextDistDir;
    vi.resetModules();
  });

  it('uses the local no-sync E2E cache whenever the local E2E cache is enabled', async () => {
    process.env.NEXT_DIST_DIR = '/tmp/trophe-next-e2e-cache';
    vi.resetModules();
    const { nextConfig } = await import('../../next.config');

    expect(nextConfig.distDir).toBe('.next-e2e.nosync');
  });

  it('uses only the exact no-sync cache path under the project root', () => {
    expect(localE2ECachePath('/workspace/trophe')).toBe('/workspace/trophe/.next-e2e.nosync');
  });

  it('resolves the installed native CLI package without falling back to the npm shim', () => {
    const resolver = (specifier: string) => `/tmp/${specifier}/package.json`;
    expect(resolveSupabaseCli({ platform: 'darwin', arch: 'arm64', resolve: resolver }))
      .toBe('/tmp/@supabase/cli-darwin-arm64/package.json/bin/supabase');
    expect(() => resolveSupabaseCli({
      platform: 'plan9',
      arch: 'mips',
      resolve: () => { throw new Error('missing'); },
    })).toThrow(/No native Supabase CLI package/);
  });

  it('parses the exact quoted Supabase status variables needed by the runner', () => {
    expect(parseSupabaseStatusEnv([
      'API_URL="http://127.0.0.1:54321"',
      'ANON_KEY="anon-local"',
      'SERVICE_ROLE_KEY="service-local"',
      'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
      'IGNORED="value"',
    ].join('\n'))).toEqual({
      API_URL: 'http://127.0.0.1:54321',
      ANON_KEY: 'anon-local',
      SERVICE_ROLE_KEY: 'service-local',
      DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
  });

  it.each([
    'https://project.supabase.co',
    'http://192.168.1.20:54321',
    'http://0.0.0.0:54321',
    'not-a-url',
  ])('rejects non-loopback Supabase target %s before creating users', (target) => {
    expect(() => assertLoopbackSupabaseUrl(target)).toThrow('loopback');
  });

  it.each([
    'postgresql://postgres:postgres@db.example.com:5432/postgres',
    'postgresql://postgres:postgres@192.168.1.20:5432/postgres',
    'https://127.0.0.1:54322/postgres',
    'not-a-url',
  ])('rejects non-loopback or non-Postgres database target %s', (target) => {
    expect(() => assertLoopbackDatabaseUrl(target)).toThrow('loopback');
  });

  it.each([
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgres://postgres:postgres@localhost:54322/postgres',
    'postgresql://postgres:postgres@[::1]:54322/postgres',
  ])('accepts local Postgres database target %s', (target) => {
    expect(assertLoopbackDatabaseUrl(target).hostname).toBeTruthy();
  });

  it('maps local service variables and blanks every paid-provider capability', () => {
    const env = buildLocalPlaywrightEnv(
      { EXISTING: 'kept', OPENAI_API_KEY: 'must-not-survive' },
      {
        API_URL: 'http://localhost:54321',
        ANON_KEY: 'anon-local',
        SERVICE_ROLE_KEY: 'service-local',
        DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      },
      {
        client: { email: 'client@test.invalid', password: 'client-password' },
        coach: { email: 'coach@test.invalid', password: 'coach-password' },
        admin: { email: 'admin@test.invalid', password: 'admin-password' },
      },
    );

    expect(env).toMatchObject({
      EXISTING: 'kept',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-local',
      SUPABASE_SERVICE_ROLE_KEY: 'service-local',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      E2E_CLIENT_EMAIL: 'client@test.invalid',
      E2E_CLIENT_PASSWORD: 'client-password',
      E2E_COACH_EMAIL: 'coach@test.invalid',
      E2E_COACH_PASSWORD: 'coach-password',
      E2E_ADMIN_EMAIL: 'admin@test.invalid',
      E2E_ADMIN_PASSWORD: 'admin-password',
      AI_PAID_TOOL_APPROVAL: '',
      ANTHROPIC_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      GEMINI_API_KEY: '',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
      OPENAI_API_KEY: '',
      VOYAGE_API_KEY: '',
    });
  });

  it('builds a complete zero-cost app environment from local Supabase status', () => {
    const env = buildLocalDevEnv(
      {
        EXISTING: 'kept',
        OPENAI_API_KEY: 'must-not-survive',
        TROPHE_ALLOW_PAID_AI: 'must-not-survive',
      },
      {
        API_URL: 'http://127.0.0.1:54321',
        ANON_KEY: 'anon-local',
        SERVICE_ROLE_KEY: 'service-local',
        DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      },
      3300,
    );

    expect(env).toMatchObject({
      EXISTING: 'kept',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-local',
      SUPABASE_SERVICE_ROLE_KEY: 'service-local',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3300',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3300',
      AI_PAID_TOOL_APPROVAL: '',
      TROPHE_ALLOW_PAID_AI: '',
      OPENAI_API_KEY: '',
    });
  });

  it('maps disposable client, coach, and super-admin roles to the zero-paid theme measurement contract', () => {
    expect(buildLocalThemePerformanceEnv({ OPENAI_API_KEY: '' }, {
      client: { email: 'client@test.invalid', password: 'client-password' },
      coach: { email: 'coach@test.invalid', password: 'coach-password' },
      admin: { email: 'super@test.invalid', password: 'super-password' },
    })).toMatchObject({
      THEME_PERF_CLIENT_EMAIL: 'client@test.invalid',
      THEME_PERF_COACH_EMAIL: 'coach@test.invalid',
      THEME_PERF_SUPER_EMAIL: 'super@test.invalid',
      OPENAI_API_KEY: '',
    });
  });

  it('cleans relationship and organization fixtures after a callback and preserves its returned value', async () => {
    const events: string[] = [];
    await expect(withFixtureCleanup({
      execute: async () => {
        events.push('callback');
        return 'measurement-report';
      },
      cleanup: async () => {
        events.push('relationship-cleanup');
        events.push('organization-cleanup');
      },
    })).resolves.toBe('measurement-report');
    expect(events).toEqual(['callback', 'relationship-cleanup', 'organization-cleanup']);
  });

  it('cleans fixtures after a callback error while preserving the callback error', async () => {
    const events: string[] = [];
    await expect(withFixtureCleanup({
      execute: async () => {
        events.push('callback');
        throw new Error('measurement failed');
      },
      cleanup: async () => { events.push('cleanup'); },
    })).rejects.toThrow('measurement failed');
    expect(events).toEqual(['callback', 'cleanup']);
  });

  it('preserves a callback error while attempting both fixture cleanups and retaining cleanup evidence', async () => {
    const events: string[] = [];
    try {
      await withFixtureCleanup({
        execute: async () => {
          events.push('callback');
          throw new Error('workload failed');
        },
        cleanup: () => cleanupFixtureResources({
          relationshipCleanup: async () => {
            events.push('relationship');
            throw new Error('relationship cleanup failed');
          },
          organizationCleanup: async () => {
            events.push('organization');
            throw new Error('organization cleanup failed');
          },
        }),
      });
      throw new Error('expected fixture failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map((item) => (item as Error).message)).toEqual([
        'workload failed',
        'relationship cleanup failed',
        'organization cleanup failed',
      ]);
    }
    expect(events).toEqual(['callback', 'relationship', 'organization']);
  });

  it('surfaces cleanup failure after a successful callback while still attempting both cleanups', async () => {
    const events: string[] = [];
    await expect(withFixtureCleanup({
      execute: async () => {
        events.push('callback');
        return 'report';
      },
      cleanup: () => cleanupFixtureResources({
        relationshipCleanup: async () => {
          events.push('relationship');
          throw new Error('relationship cleanup failed');
        },
        organizationCleanup: async () => { events.push('organization'); },
      }),
    })).rejects.toThrow('relationship cleanup failed');
    expect(events).toEqual(['callback', 'relationship', 'organization']);
  });


  it.each([0, 80, 65_536, 3_000.5, Number.NaN])(
    'rejects unsafe local app port %s',
    (port) => {
      expect(() => localAppOrigin(port)).toThrow('port');
    },
  );

  it('uses an explicit loopback origin for the selected local app port', () => {
    expect(localAppOrigin(3000)).toBe('http://127.0.0.1:3000');
  });

  it('reports the local runner failure cause without exposing credentials or URLs', () => {
    expect(formatLocalE2EError(new Error('cleanup failed for https://user:secret@127.0.0.1:54321?apikey=secret-token password=hunter2')))
      .toBe('cleanup failed for [url] password=[redacted]');
  });

  it('propagates relationship cleanup errors instead of silently leaving disposable fixtures', () => {
    expect(() => assertSupabaseOperation({ error: { message: 'foreign key constraint' } }, 'organization cleanup'))
      .toThrow('local E2E organization cleanup failed: foreign key constraint');
    expect(() => assertSupabaseOperation({ error: null }, 'organization cleanup')).not.toThrow();
  });

  it('rejects a successful-looking cleanup response that did not affect its exact row', () => {
    expect(() => assertSupabaseAffectedRow({ data: [] }, 'organization cleanup', 'org-1'))
      .toThrow('local E2E organization cleanup failed: expected row org-1 was not affected');
    expect(() => assertSupabaseAffectedRow({ data: [{ id: 'org-1' }] }, 'organization cleanup', 'org-1')).not.toThrow();
  });

  it('rejects an auth cleanup response while its exact user is still present', () => {
    expect(() => assertAuthUserAbsent({ data: { user: { id: 'user-1' } }, error: null }, 'user cleanup', 'user-1'))
      .toThrow('local E2E user cleanup failed: user user-1 is still present');
    expect(() => assertAuthUserAbsent({ data: { user: null }, error: null }, 'user cleanup', 'user-1')).not.toThrow();
    expect(() => assertAuthUserAbsent({ data: { user: null }, error: { message: 'User not found' } }, 'user cleanup', 'user-1')).not.toThrow();
  });

  it('retries a transient local Supabase teardown operation before succeeding', async () => {
    let attempts = 0;
    await expect(retryLocalE2EOperation(async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError('fetch failed');
      return { error: null };
    }, 'client relationship cleanup', { retryDelay: async () => {} })).resolves.toEqual({ error: null });
    expect(attempts).toBe(3);
  });

  it('preserves the terminal local Supabase teardown cause after bounded retries', async () => {
    let attempts = 0;
    await expect(retryLocalE2EOperation(async () => {
      attempts += 1;
      return { error: { message: 'connection reset' } };
    }, 'organization cleanup', { attempts: 2, retryDelay: async () => {} }))
      .rejects.toThrow('local E2E organization cleanup failed: connection reset');
    expect(attempts).toBe(2);
  });

  it('deletes every created user in reverse order when browser execution fails', async () => {
    const events: string[] = [];
    const users = [
      { email: 'client@test.invalid', password: 'one', role: 'client' as const },
      { email: 'coach@test.invalid', password: 'two', role: 'coach' as const },
      { email: 'admin@test.invalid', password: 'three', role: 'super_admin' as const },
    ];
    const admin = {
      async createUser(user: (typeof users)[number]) {
        events.push(`create:${user.role}`);
        return { id: `${user.role}-id` };
      },
      async provisionProfile(id: string, user: (typeof users)[number]) {
        events.push(`profile:${id}:${user.role}`);
      },
      async deleteUser(id: string) {
        events.push(`delete:${id}`);
      },
    };

    await expect(withDisposableUsers({
      admin,
      users,
      execute: async () => {
        events.push('execute');
        throw new Error('browser failed');
      },
    })).rejects.toThrow('browser failed');

    expect(events).toEqual([
      'create:client',
      'profile:client-id:client',
      'create:coach',
      'profile:coach-id:coach',
      'create:super_admin',
      'profile:super_admin-id:super_admin',
      'execute',
      'delete:super_admin-id',
      'delete:coach-id',
      'delete:client-id',
    ]);
  });

  it('retries transient cleanup failures without leaking disposable users', async () => {
    const attempts: string[] = [];
    const users = [
      { email: 'client@test.invalid', password: 'one', role: 'client' as const },
    ];
    const admin = {
      async createUser() {
        return { id: 'client-id' };
      },
      async provisionProfile() {},
      async deleteUser(id: string) {
        attempts.push(id);
        if (attempts.length < 3) throw new Error('transient socket close');
      },
    };

    await expect(withDisposableUsers({
      admin,
      users,
      execute: async () => 'passed',
      cleanupRetryDelay: async () => {},
    })).resolves.toBe('passed');

    expect(attempts).toEqual(['client-id', 'client-id', 'client-id']);
  });

  it('propagates a cleanup failure after successful browser execution', async () => {
    const admin = {
      async createUser() { return { id: 'client-id' }; },
      async provisionProfile() {},
      async deleteUser() { throw new Error('auth cleanup unavailable'); },
    };

    await expect(withDisposableUsers({
      admin,
      users: [{ email: 'client@test.invalid', password: 'one', role: 'client' }],
      execute: async () => 'browser passed',
      cleanupAttempts: 1,
    })).rejects.toThrow('auth cleanup unavailable');
  });

  it('allows slower local auth shutdowns to settle before declaring cleanup failed', async () => {
    const attempts: number[] = [];
    const delays: number[] = [];
    const admin = {
      async createUser() {
        return { id: 'coach-id' };
      },
      async provisionProfile() {},
      async deleteUser() {
        attempts.push(attempts.length + 1);
        if (attempts.length < 8) throw new Error('auth session is still closing');
      },
    };

    await expect(withDisposableUsers({
      admin,
      users: [{ email: 'coach@test.invalid', password: 'one', role: 'coach' }],
      execute: async () => 'passed',
      cleanupRetryDelay: async (attempt) => {
        delays.push(attempt);
      },
    })).resolves.toBe('passed');

    expect(attempts).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(delays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
