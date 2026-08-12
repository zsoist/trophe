import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'drizzle/0062_food_log_nutrition_constraints.sql'),
  'utf8',
);

describe('food log nutrition constraints migration', () => {
  it('bounds user-visible names, amounts, nutrition, and parse confidence', () => {
    for (const constraint of [
      'food_log_name_bounds_check',
      'food_log_amount_bounds_check',
      'food_log_nutrition_bounds_check',
      'food_log_parse_confidence_bounds_check',
    ]) {
      expect(migration).toContain(`CONSTRAINT "${constraint}"`);
    }

    expect(migration).toContain('char_length(btrim(food_name)) BETWEEN 1 AND 500');
    expect(migration).toContain('quantity > 0 AND quantity <= 10000');
    expect(migration).toContain('qty_g > 0 AND qty_g <= 10000');
    expect(migration).toContain('qty_input > 0 AND qty_input <= 10000');
    expect(migration).toContain('calories >= 0 AND calories <= 100000');
    for (const macro of ['protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) {
      expect(migration).toContain(`${macro} >= 0 AND ${macro} <= 10000`);
    }
    expect(migration).toContain('parse_confidence >= 0 AND parse_confidence <= 1');
  });

  it('uses rollout-safe constraints that still reject every new invalid write', () => {
    expect(migration.match(/\)\s+NOT VALID/g)).toHaveLength(4);
    expect(migration).not.toContain('VALIDATE CONSTRAINT');
  });
});
