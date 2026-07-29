import { describe, expect, it } from 'vitest';
import {
  assertLoopbackDatabaseUrl,
  assertLoopbackSupabaseUrl,
  buildLocalDevEnv,
  buildLocalPlaywrightEnv,
  localAppOrigin,
  parseSupabaseStatusEnv,
  withDisposableUsers,
} from '../../scripts/test/local-auth-e2e-core.mjs';

describe('local authenticated E2E harness', () => {
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

  it.each([0, 80, 65_536, 3_000.5, Number.NaN])(
    'rejects unsafe local app port %s',
    (port) => {
      expect(() => localAppOrigin(port)).toThrow('port');
    },
  );

  it('uses an explicit loopback origin for the selected local app port', () => {
    expect(localAppOrigin(3000)).toBe('http://127.0.0.1:3000');
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
});
