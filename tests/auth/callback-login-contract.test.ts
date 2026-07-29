import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('auth callback to login error contract', () => {
  it('uses stable error codes and displays their safe login notice', () => {
    const callback = readFileSync(
      join(process.cwd(), 'app/api/auth/callback/route.ts'),
      'utf8',
    );
    const login = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');

    expect(callback).toContain("searchParams.set('error', 'cancelled')");
    expect(callback).toContain("searchParams.set('error', 'invalid_or_expired')");
    expect(callback).not.toContain("searchParams.set('error', errorDescription ?? error)");
    expect(login).toContain("authCallbackErrorNotice(searchParams.get('error'))");
    expect(login).toContain('setError(callbackError)');
  });
});
