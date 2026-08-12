import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UNIT_KEYS = [
  'bottle', 'bowl', 'can', 'cup', 'dish', 'glass', 'piece', 'pint',
  'plate', 'portion', 'scoop', 'serving', 'slice', 'tablespoon', 'teaspoon',
];

describe('natural portion unit translations', () => {
  it('includes an accessible amount label with the localized unit', () => {
    const core = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8');
    const overlays = ['de', 'fr', 'it', 'nl', 'pt'].map(locale => (
      readFileSync(join(process.cwd(), `lib/locales/${locale}.ts`), 'utf8')
    ));

    expect(core).toContain("'food.amount_input_aria_with_unit': { en:");
    for (const overlay of overlays) {
      expect(overlay).toContain("'food.amount_input_aria_with_unit':");
    }
  });

  it('covers singular and plural labels in every supported language', () => {
    const core = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8');
    const overlays = ['de', 'fr', 'it', 'nl', 'pt'].map(locale => (
      readFileSync(join(process.cwd(), `lib/locales/${locale}.ts`), 'utf8')
    ));

    for (const unit of UNIT_KEYS) {
      for (const suffix of ['one', 'other']) {
        const key = `food.unit.${unit}_${suffix}`;
        expect(core).toContain(`'${key}': { en:`);
        for (const overlay of overlays) expect(overlay).toContain(`'${key}':`);
      }
    }
  });
});
