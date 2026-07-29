import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('food log edit feedback translations', () => {
  it('covers all supported languages', () => {
    const keys = ['food.edit.invalid', 'food.edit.failed'];
    const core = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8');

    for (const key of keys) {
      expect(core).toContain(`'${key}': { en:`);
      for (const locale of ['de', 'fr', 'it', 'nl', 'pt']) {
        const overlay = readFileSync(
          join(process.cwd(), `lib/locales/${locale}.ts`),
          'utf8',
        );
        expect(overlay).toContain(`'${key}':`);
      }
    }
  });
});
