import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('coach macro suggestion feedback', () => {
  it('tells the coach when protein was capped to preserve the calorie target', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/coach/client/[id]/plan/page.tsx'),
      'utf8',
    );

    expect(source).toContain('protein_capped?: boolean');
    expect(source).toContain('data.target.protein_capped');
    expect(source).toContain('Protein was capped to fit the calorie target');
  });
});
