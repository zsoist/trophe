type BrowserSessionRecovery = 'recovered' | 'unchanged';

const attemptedSignOuts = new WeakSet<() => Promise<unknown>>();

function isInvalidRefreshError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';

  return candidate.name === 'AuthApiError'
    && (
      message.includes('invalid refresh token')
      || message.includes('refresh token not found')
      || code === 'refresh_token_not_found'
    );
}

/**
 * Clear only a browser-local Supabase session proven to have an invalid
 * refresh token. Each caller-owned sign-out operation is attempted at most
 * once so a persistent auth error cannot create a recovery loop.
 */
export async function recoverInvalidBrowserSession(
  error: unknown,
  signOut: () => Promise<unknown>,
): Promise<BrowserSessionRecovery> {
  if (!isInvalidRefreshError(error) || attemptedSignOuts.has(signOut)) {
    return 'unchanged';
  }

  attemptedSignOuts.add(signOut);
  await signOut();
  return 'recovered';
}
