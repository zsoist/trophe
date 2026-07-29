import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Spike callback login return path', () => {
  it('uses the redirect parameter consumed by the login page', () => {
    const callback = readFileSync(
      join(process.cwd(), 'app/api/integrations/spike/callback/route.ts'),
      'utf8',
    );

    expect(callback).toContain(
      "login?redirectTo=${encodeURIComponent('/dashboard/integrations')}",
    );
    expect(callback).not.toContain('login?redirect=/dashboard/integrations');
  });
});
