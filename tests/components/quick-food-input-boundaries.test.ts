import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManualNutrition } from '@/lib/food/manual-entry';

describe('manual nutrition entry validation', () => {
  it('accepts realistic values and normalizes blank optional macros', () => {
    expect(validateManualNutrition({
      name: 'Homemade bowl',
      calories: '525',
      protein: '32.5',
      carbs: '',
      fat: '18',
    })).toEqual({
      ok: true,
      value: {
        name: 'Homemade bowl',
        calories: 525,
        protein: 32.5,
        carbs: 0,
        fat: 18,
      },
    });
  });

  it.each([
    [{ calories: '-20', protein: '0', carbs: '0', fat: '0' }, 'calories_out_of_range'],
    [{ calories: '0', protein: '0', carbs: '0', fat: '0' }, 'calories_out_of_range'],
    [{ calories: '10001', protein: '0', carbs: '0', fat: '0' }, 'calories_out_of_range'],
    [{ calories: '300', protein: '-1', carbs: '0', fat: '0' }, 'macro_out_of_range'],
    [{ calories: '300', protein: 'NaN', carbs: '0', fat: '0' }, 'macro_out_of_range'],
    [{ calories: '300', protein: '1001', carbs: '0', fat: '0' }, 'macro_out_of_range'],
  ])('rejects invalid values before a database insert', (input, code) => {
    expect(validateManualNutrition({ name: '', ...input })).toEqual({ ok: false, code });
  });
});

describe('photo analysis request and response boundary', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/food/QuickFoodInput.tsx'),
    'utf8',
  );

  it('uses the synchronous busy ref for photo requests and always releases it', () => {
    const photoHandler = source.slice(
      source.indexOf('const processImageFile'),
      source.indexOf('const handlePhotoCapture'),
    );

    expect(photoHandler).toContain('if (parseBusyRef.current || logging) return');
    expect(photoHandler).toContain('parseBusyRef.current = true');
    expect(photoHandler).toContain('finally');
    expect(photoHandler).toContain('parseBusyRef.current = false');
  });

  it('filters mapped photo foods through the runtime item schema', () => {
    expect(source).toContain('.filter(isParsedFoodItem)');
    expect(source).toContain('if (items.length === 0)');
  });
});
