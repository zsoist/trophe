import { describe, expect, it } from 'vitest';
import {
  isPublicAssetRequest,
  isStaticAssetRequest,
  mustUseNetwork,
  type ServiceWorkerRequestContext,
} from '@/lib/pwa/sw-policy';

function context(
  path: string,
  options: {
    mode?: string;
    destination?: string;
    rsc?: string | null;
    sameOrigin?: boolean;
    hostname?: string;
  } = {},
): ServiceWorkerRequestContext {
  const url = new URL(path, `https://${options.hostname ?? 'trophe.app'}`);
  return {
    sameOrigin: options.sameOrigin ?? true,
    url,
    request: {
      mode: options.mode ?? 'cors',
      destination: options.destination ?? '',
      headers: { get: (name) => (name === 'RSC' ? (options.rsc ?? null) : null) },
    },
  };
}

describe('service-worker cache policy', () => {
  it.each([
    context('/dashboard', { mode: 'navigate', destination: 'document' }),
    context('/login', { mode: 'navigate', destination: 'document' }),
    context('/dashboard?_rsc=abc'),
    context('/dashboard', { rsc: '1' }),
    context('/api/health'),
    context('/rest/v1/foods', { sameOrigin: false, hostname: 'project.supabase.co' }),
  ])('keeps application and private traffic on the network', (requestContext) => {
    expect(mustUseNetwork(requestContext)).toBe(true);
  });

  it('caches only same-origin immutable Next assets', () => {
    expect(isStaticAssetRequest(context('/_next/static/chunks/app.js'))).toBe(true);
    expect(isStaticAssetRequest(context('/vendor.js', { sameOrigin: false, hostname: 'cdn.example.com' }))).toBe(false);
  });

  it('caches only the named same-origin public asset paths', () => {
    expect(isPublicAssetRequest(context('/icons/icon-192.png'))).toBe(true);
    expect(isPublicAssetRequest(context('/images/meal.webp'))).toBe(true);
    expect(isPublicAssetRequest(context('/favicon.svg'))).toBe(true);
    expect(isPublicAssetRequest(context('/avatar.png'))).toBe(false);
    expect(isPublicAssetRequest(context('/icons/tracker.js', { sameOrigin: false, hostname: 'cdn.example.com' }))).toBe(false);
  });
});
