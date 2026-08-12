import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('composite decomposition nutrition safety', () => {
  it('does not fabricate nutrition or label partial totals as local_db', () => {
    const source = readFileSync(join(process.cwd(), 'agents/food-parse/decompose.ts'), 'utf8');
    expect(source).not.toContain('totalKcal += 200 * factor');
    expect(source).not.toContain('totalProtein += 8 * factor');
    expect(source).toContain('if (matchRatio < 1)');
    expect(source).toContain('using governed fallback');
    expect(source).toContain('const cachedQuality = resolveCachedRecipeQuality');
    expect(source).toContain('const confidence = confidenceForMatchRatio(matchRatio)');
    expect(source).toContain('source: cachedQuality.source');
    expect(source).toContain('await lookupFoodBatch(lookupInputs)');
    expect(source).not.toContain('lookupResults.push(await lookupFood(li))');
  });

  it('bounds and parallelizes the main parser fallback pipeline', () => {
    const source = readFileSync(join(process.cwd(), 'agents/food-parse/index.v4.ts'), 'utf8');
    expect(source).toContain('if (v4Parsed.items.length > FOOD_PARSE_MAX_ITEMS)');
    expect(source).toContain('await Promise.all(v4Parsed.items.map');
    expect(source).toContain('const legacyDecompResults = await Promise.all');
    expect(source).toContain('hasFoodParseAiPhaseBudget(pipelineDeadlineAt)');
    expect(source).toContain('await estimateMacrosViaLLM(dbMissFallbacks.map');
    expect(source).toContain('estimate.item_index === i + 1');
    expect(source).not.toContain('const estimatePromises = dbMissFallbacks.map');
    expect(source).not.toContain('const decomposed = await decomposeAndLookup({');
  });
});
