import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('alternate food logging persistence boundaries', () => {
  it('requires a returned row before closing the recipe logger', () => {
    const source = read('components/food/RecipeAnalyzerModal.tsx');
    const block = source.slice(
      source.indexOf('async function logRecipe()'),
      source.indexOf('function reset()'),
    );

    expect(block).toContain('data: inserted');
    expect(block).toContain(".select('id')");
    expect(block).toContain('.maybeSingle()');
    expect(block).toContain('if (insertError || !inserted)');
    expect(block).toContain("setError(t('food.save_failed'))");
  });

  it('requires returned rows for barcode and manual-label logs', () => {
    const source = read('components/food/BarcodeLookupModal.tsx');
    expect(source.match(/\.select\('id'\)/g)).toHaveLength(2);
    expect(source.match(/\.maybeSingle\(\)/g)).toHaveLength(2);
    expect(source.match(/if \(insErr \|\| !inserted\)/g)).toHaveLength(2);
    expect(source).toContain("setError(t('food.save_failed'))");
  });

  it('verifies favorite and coach-recommendation quick logs', () => {
    const source = read('app/dashboard/log/page.tsx');
    const favorite = source.slice(
      source.indexOf('const logFavorite = async'),
      source.indexOf('// eslint-disable-next-line', source.indexOf('const logFavorite = async')),
    );
    const coach = source.slice(
      source.indexOf('const logCoachRec = async'),
      source.indexOf('// Loading skeleton', source.indexOf('const logCoachRec = async')),
    );

    for (const block of [favorite, coach]) {
      expect(block).toContain(".select('id')");
      expect(block).toContain('.maybeSingle()');
      expect(block).toContain('if (error || !inserted)');
      expect(block).toContain("setMutationError(t('food.save_failed'))");
      expect(block.indexOf('if (error || !inserted)')).toBeLessThan(
        block.indexOf('await loadTodayLog()'),
      );
    }
  });
});
