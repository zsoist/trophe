import { describe, expect, it } from 'vitest';
import { nextConfig } from '@/next.config';

describe('microphone permissions policy', () => {
  it('allows only same-origin microphone and camera use on every app route', async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find(rule => rule.source === '/(.*)');
    const policy = globalRule?.headers.find(header => header.key === 'Permissions-Policy');

    expect(policy).toEqual({
      key: 'Permissions-Policy',
      value: 'microphone=(self), camera=(self)',
    });
  });
});
