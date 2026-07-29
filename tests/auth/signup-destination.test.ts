import { describe, expect, it } from 'vitest';
import { signupDestination } from '@/lib/auth/signup-destination';

describe('legacy signup destination', () => {
  it('routes ordinary signups to the supported signup tab', () => {
    expect(signupDestination(undefined)).toBe('/login?mode=signup');
  });

  it('preserves a bounded invite code without allowing extra query input', () => {
    expect(signupDestination('coach invite/+')).toBe(
      '/login?mode=signup&code=coach+invite%2F%2B',
    );
    expect(signupDestination(['unsafe'])).toBe('/login?mode=signup');
    expect(signupDestination('x'.repeat(257))).toBe('/login?mode=signup');
  });
});
