import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/coach/client/[id]/plan/page.tsx'),
  'utf8',
);

describe('coach meal-plan persistence feedback', () => {
  it('requires a persisted row for a single meal cell', () => {
    const block = source.slice(
      source.indexOf('const saveMealCell = async'),
      source.indexOf('const setMealCell ='),
    );

    expect(block).toContain('Promise<boolean>');
    expect(block).toContain(".select('day_of_week')");
    expect(block).toContain('.maybeSingle()');
    expect(block).toContain('if (error || !data)');
    expect(block).toContain(
      "setMealSaveError('Meal change not saved — try again');",
    );
    expect(block).toContain('return false;');
    expect(block).toContain('return true;');
  });

  it('keeps an AI picker open when its selected meal does not persist', () => {
    const block = source.slice(
      source.indexOf('const handlePickMeal = async'),
      source.indexOf('// Michael:'),
    );

    expect(block).toContain('const saved = await saveMealCell');
    expect(block).toContain('if (saved) setPicker(null);');
  });

  it('confirms all seven rows before copying a slot across the week', () => {
    const block = source.slice(
      source.indexOf('const copySlotToWeek = async'),
      source.indexOf('// ── Render guards'),
    );

    expect(block).toContain(".select('day_of_week')");
    expect(block).toContain('if (error || data?.length !== 7)');
    expect(block.indexOf('if (error || data?.length !== 7)')).toBeLessThan(
      block.indexOf('setMealGrid((g) => {'),
    );
  });

  it('renders meal persistence failures next to the weekly plan', () => {
    expect(source).toContain('const [mealSaveError, setMealSaveError]');
    expect(source).toContain('{mealSaveError && (');
    expect(source).toContain('{mealSaveError}');
  });
});
