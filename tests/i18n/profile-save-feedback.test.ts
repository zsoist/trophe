import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('profile save feedback translations', () => {
  it('covers all supported languages', () => {
    const core = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8');
    for (const key of [
      'profile.save_failed',
      'profile.language_save_failed',
      'profile.invalid_body',
      'profile.macros_adjusted',
    ]) {
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
