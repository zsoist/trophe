import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

describe('safeRedirectPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeRedirectPath('/dashboard/log?date=2026-06-07')).toBe('/dashboard/log?date=2026-06-07');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
  ])('rejects external redirect form %s', (value) => {
    expect(safeRedirectPath(value)).toBe('/dashboard');
  });
});
