import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readiness = readFileSync(
  new URL('../../scripts/ops/check-food-readiness.ts', import.meta.url),
  'utf8',
);

describe('food readiness quality tiers', () => {
  it('keeps an absolute authoritative floor while excluding crowdsourced rows from the curated-rate denominator', () => {
    expect(readiness).toContain('FOOD_MIN_AUTHORITATIVE_ROWS');
    expect(readiness).toContain("data_quality <> 'crowdsourced'");
    expect(readiness).toContain('curatedAuthoritativeRate');
    expect(readiness).toContain('report.authoritative < minimumAuthoritativeRows');
    expect(readiness).toContain('report.curatedAuthoritativeRate < minimumAuthoritativeRate');
  });
});
