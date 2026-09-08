import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each([undefined, '0', 'true', '1'])('compiles only the public coach opt-in when configured as %s', async value => {
  vi.stubEnv('NEXT_PUBLIC_COACH_ASSISTANT_ENABLED', value);
  vi.stubEnv('NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED', value);
  vi.stubEnv('NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED', value);
  vi.stubEnv('COACH_ASSISTANT_ENABLED', '1');
  vi.stubEnv('COACH_ASSISTANT_PREVIEW_USER_IDS', 'server-only-sentinel');
  vi.resetModules();
  const { nextConfig } = await import('@/next.config');
  expect(nextConfig.env).toEqual({ NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: value === '1' ? '1' : '0', NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: value === '1' ? '1' : '0', NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED: value === '1' ? '1' : '0' });
  expect(JSON.stringify(nextConfig.env)).not.toContain('server-only-sentinel');
});
