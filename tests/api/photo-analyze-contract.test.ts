import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('photo nutrition contract', () => {
  it('requires explicit estimated grams and rejects arbitrary calorie-density conversion', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/ai/photo-analyze/route.ts'), 'utf8');
    const quickInput = readFileSync(join(process.cwd(), 'components/food/QuickFoodInput.tsx'), 'utf8');
    const normalizer = readFileSync(join(process.cwd(), 'lib/food/photo-analysis.ts'), 'utf8');
    const schema = readFileSync(join(process.cwd(), 'agents/schemas/food-parse-structured.ts'), 'utf8');
    expect(schema).toContain('estimated_grams');
    expect(route).toContain("@/lib/food/photo-analysis");
    const provider = readFileSync(join(process.cwd(), 'agents/coach-assistant/photo-food-provider.ts'), 'utf8');
    expect(provider).toContain('estimated_grams');
    expect(route).toContain('invokePrivatePhotoFoodProvider');
    expect(route).toContain('photo-analyze.v3.md');
    expect(route).toContain('plausibility validation');
    expect(quickInput).toContain('photoAnalysisToParsedItems(data.foods)');
    expect(normalizer).toContain('grams: Math.round(food.estimated_grams)');
    expect(quickInput).not.toContain('estimated_calories / 1.5');
  });

  it('compresses large source photos before enforcing a 5MB decoded upload cap', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/ai/photo-analyze/route.ts'), 'utf8');
    const quickInput = readFileSync(join(process.cwd(), 'components/food/QuickFoodInput.tsx'), 'utf8');
    expect(route).toContain('(5 * 1024 * 1024)');
    expect(route).toContain('maximum 5MB');
    expect(quickInput).toContain("const mediaType = 'image/jpeg'");
    expect(quickInput).not.toContain('file.size > MAX_IMAGE_SIZE');
    expect(quickInput).toContain('MAX_UPLOAD_BASE64_LENGTH');
    expect(quickInput).toContain('while (Math.max(width, height) > 640)');
  });
});
