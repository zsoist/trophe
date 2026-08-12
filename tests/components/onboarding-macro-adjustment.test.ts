import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('onboarding adjusted macro disclosure', () => {
  it('tells the client when macro anchors were fitted to the calorie target', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/onboarding/page.tsx'),
      'utf8',
    );

    expect(source).toContain('profile.macros_adjusted');
    expect(source).toContain(
      'Protein and fat were adjusted to fit your calorie target',
    );
    expect(source).toContain('Your coach can review these starting targets');
  });
});
