import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/onboarding/page.tsx'),
  'utf8',
);

describe('onboarding profile persistence', () => {
  it('requires the client profile row before navigating to the dashboard', () => {
    const block = source.slice(
      source.indexOf('async function finish()'),
      source.indexOf('return ('),
    );

    expect(block).toContain('setOnboardingError(null);');
    expect(block).toContain('const { data, error }');
    expect(block).toContain(".select('user_id')");
    expect(block).toContain('.maybeSingle()');
    expect(block).toContain('if (error || !data)');
    expect(block.indexOf('if (error || !data)')).toBeLessThan(
      block.indexOf("router.push('/dashboard')"),
    );
    expect(block).not.toContain("console.error('Onboarding error:'");
  });

  it('keeps a failed onboarding attempt retryable and visible', () => {
    expect(source).toContain(
      'const [onboardingError, setOnboardingError]',
    );
    expect(source).toContain(
      "setOnboardingError('Your profile was not saved — try again');",
    );
    expect(source).toContain('{onboardingError && (');
    expect(source).toContain('{onboardingError}');
  });
});
