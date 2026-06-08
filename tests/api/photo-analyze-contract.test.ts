import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('photo nutrition contract', () => {
  it('requires explicit estimated grams and rejects arbitrary calorie-density conversion', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/ai/photo-analyze/route.ts'), 'utf8');
    const quickInput = readFileSync(join(process.cwd(), 'components/QuickFoodInput.tsx'), 'utf8');
    expect(route).toContain('estimated_grams');
    expect(route).toContain('plausibility validation');
    expect(quickInput).toContain('grams: Math.round(f.estimated_grams)');
    expect(quickInput).not.toContain('estimated_calories / 1.5');
  });
});
