import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('governed provider correlation contract', () => {
  it.each([
    'app/api/ai/meal-suggest/route.ts',
    'app/api/coach/shopping-list/route.ts',
  ])('%s forwards the runtime client request ID', (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
    expect(source).toContain('clientRequestId');
  });
});
