import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('coach shopping-list cost boundary', () => {
  it('rate-limits callers and refuses meal plans beyond weekly cardinality', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/coach/shopping-list/route.ts'),
      'utf8',
    );

    expect(source).toContain(
      'consumeRateLimit(`shopping-list:${userId}`, 5, 600)',
    );
    expect(source).toContain('.limit(MAX_WEEKLY_MEAL_CELLS + 1)');
    expect(source).toContain('if (rows.length > MAX_WEEKLY_MEAL_CELLS)');
    expect(source.indexOf('if (rows.length > MAX_WEEKLY_MEAL_CELLS)')).toBeLessThan(
      source.indexOf('executeAiTask<ShoppingExtractOutput>'),
    );
  });
});
