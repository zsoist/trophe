import { describe, it, expect } from 'vitest';
import { cronBearerValid } from '@/lib/auth/cron-auth';

describe('P2 per-worker cron auth', () => {
  it('accepts the per-worker secret', () => {
    expect(cronBearerValid('Bearer recov-123', 'recov-123', undefined)).toBe(true);
  });

  it('accepts the legacy shared secret during the cutover window', () => {
    expect(cronBearerValid('Bearer shared-xyz', undefined, 'shared-xyz')).toBe(true);
    expect(cronBearerValid('Bearer shared-xyz', 'recov-123', 'shared-xyz')).toBe(true);
  });

  it('rejects a wrong token, a missing header, and a missing "Bearer " prefix', () => {
    expect(cronBearerValid('Bearer nope', 'recov-123', 'shared-xyz')).toBe(false);
    expect(cronBearerValid(null, 'recov-123', 'shared-xyz')).toBe(false);
    expect(cronBearerValid('recov-123', 'recov-123')).toBe(false);
  });

  it('rejects everything once all secrets are unset (fallback self-disables)', () => {
    expect(cronBearerValid('Bearer x', undefined, undefined)).toBe(false);
    expect(cronBearerValid('Bearer ', undefined)).toBe(false);
    expect(cronBearerValid('Bearer ', '')).toBe(false); // empty secret never authorizes
  });
});
