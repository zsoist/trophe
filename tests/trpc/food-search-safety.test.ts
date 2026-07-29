import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  escapeFoodSearchPattern,
  foodSearchInputSchema,
} from '@/lib/trpc/routers/food';

describe('authenticated food reference search', () => {
  it('trims useful queries and rejects blank or single-character scans', () => {
    expect(foodSearchInputSchema.parse({ query: '  arroz  ' }).query).toBe('arroz');
    expect(() => foodSearchInputSchema.parse({ query: '   ' })).toThrow();
    expect(() => foodSearchInputSchema.parse({ query: 'a' })).toThrow();
  });

  it('treats SQL wildcard characters as literal search text', () => {
    expect(escapeFoodSearchPattern('100% whey_mix\\plain')).toBe(
      '%100\\% whey\\_mix\\\\plain%',
    );
  });

  it('uses one indexed multilingual expression instead of an English table scan', () => {
    const router = readFileSync(
      join(process.cwd(), 'lib/trpc/routers/food.ts'),
      'utf8',
    );
    const migration = readFileSync(
      join(process.cwd(), 'drizzle/0063_foods_multilingual_trigram_search.sql'),
      'utf8',
    );

    for (const column of [
      'name_en',
      'name_el',
      'name_es',
      'name_fr',
      'name_it',
      'name_nl',
      'brand',
    ]) {
      expect(migration).toContain(`COALESCE(${column}, '')`);
    }
    expect(migration).toContain('extensions.gin_trgm_ops');
    expect(migration).toContain('idx_foods_multilingual_trgm');
    expect(router).toContain('foodSearchText');
    expect(router).toContain('ESCAPE');
    expect(router).not.toContain('.where(ilike(foods.nameEn, q))');
  });
});
