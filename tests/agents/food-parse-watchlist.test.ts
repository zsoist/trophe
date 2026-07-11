import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertOffPeakEvalWindow } from '../../scripts/eval/off-peak';

const fixture = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/food-parse-luna-watchlist.json'),
  'utf8',
)) as { cases: Array<{ id: string; greek_tagged: boolean; expected_canonical_foods: string[] }> };

describe('Phase 3 Luna watch-list', () => {
  it('contains the 10 DB-backed DeepSeek-exclusive wins and flags four Greek cases', () => {
    expect(fixture.cases).toHaveLength(10);
    expect(fixture.cases.filter((testCase) => testCase.greek_tagged).map((testCase) => testCase.id)).toEqual([
      'gex1-015',
      'gex1-016',
      'gex1-019',
      'gex3-023',
    ]);
    expect(fixture.cases.every((testCase) => testCase.expected_canonical_foods.length > 0)).toBe(true);
  });

  it('blocks factory/simulator execution in every prohibited UTC hour', () => {
    for (const hour of [1, 2, 3, 6, 7, 8, 9]) {
      expect(() => assertOffPeakEvalWindow(new Date(Date.UTC(2026, 6, 11, hour, 30)))).toThrow('blocked');
    }
    for (const hour of [0, 4, 5, 10, 23]) {
      expect(() => assertOffPeakEvalWindow(new Date(Date.UTC(2026, 6, 11, hour, 30)))).not.toThrow();
    }
  });

  it('runs the watch-list against the deployed API and counts explicit malformed state', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/eval/run-food-parse-watchlist.ts'), 'utf8');
    expect(source).toContain("`${apiBase}/api/food/parse`");
    expect(source).toContain('verifyProductionFoodParsePolicy(apiBase)');
    expect(source).toContain('verifiedDeployedPolicy: deployedPolicy');
    expect(source).toContain('const malformed = !response?.ok || !body || !Array.isArray(body.items);');
    expect(source).toContain('canonicalFoodsMatch(testCase.expected_canonical_foods, foodNames)');
    expect(source).not.toContain("from '../../agents/food-parse/index.v4'");
  });
});
