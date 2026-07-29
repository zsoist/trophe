import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'components/meals/MealSlotCard.tsx'),
  'utf8',
);

describe('meal slot edit feedback', () => {
  it('validates quick and detailed edits before mutating', () => {
    expect(source).toContain('validateFoodLogEdit');
    expect(source).toContain('const quickValidation = validateFoodLogEdit');
    expect(source).toContain('if (!quickValidation.ok)');
    expect(source).toContain('const detailValidation = validateFoodLogEdit');
    expect(source).toContain('if (!detailValidation.ok)');
  });

  it('keeps failed edits open with translated feedback', () => {
    expect(source).toContain('const [editError, setEditError]');
    expect(source).toContain("setEditError(t('food.edit.invalid'))");
    expect(source).toContain("setEditError(t('food.edit.failed'))");
    expect(source).toContain('{editError && (');
    expect(source).toContain('role="alert"');
  });
});
