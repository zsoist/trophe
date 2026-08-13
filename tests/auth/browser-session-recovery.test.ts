import { describe, expect, it, vi } from 'vitest';
import { recoverInvalidBrowserSession } from '@/lib/auth/recover-browser-session';

describe('browser session recovery', () => {
  it('clears a recognized invalid refresh token from the browser once', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const invalidRefresh = {
      name: 'AuthApiError',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
    };

    await expect(recoverInvalidBrowserSession(invalidRefresh, signOut)).resolves.toBe('recovered');
    await expect(recoverInvalidBrowserSession(invalidRefresh, signOut)).resolves.toBe('unchanged');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('leaves network failures and unrelated auth errors unchanged', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);

    await expect(recoverInvalidBrowserSession(new Error('Failed to fetch'), signOut)).resolves.toBe('unchanged');
    await expect(recoverInvalidBrowserSession(
      { name: 'AuthApiError', message: 'Invalid login credentials' },
      signOut,
    )).resolves.toBe('unchanged');
    expect(signOut).not.toHaveBeenCalled();
  });
});
