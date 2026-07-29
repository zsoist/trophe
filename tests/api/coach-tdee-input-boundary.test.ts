import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('coach TDEE input boundary', () => {
  it('returns a stable 422 before computing from unsupported profile values', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/coach/client-tdee/route.ts'),
      'utf8',
    );

    expect(source).toContain('baselineInputIssue');
    expect(source).toContain('const inputIssue = baselineInputIssue(input);');
    expect(source).toContain('if (inputIssue)');
    expect(source).toContain(
      "error: 'Body data is outside supported ranges'",
    );
    expect(source).toContain('{ status: 422 }');
    expect(source.indexOf('if (inputIssue)')).toBeLessThan(
      source.indexOf('computeBaseline(input)'),
    );
  });
});
