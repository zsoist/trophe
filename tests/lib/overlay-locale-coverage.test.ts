import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function translationKeys(source: string): Set<string> {
  return new Set(
    Array.from(source.matchAll(/^\s*'([^']+)':/gm), (match) => match[1]),
  );
}

describe('overlay locale coverage', () => {
  const core = translationKeys(
    readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8'),
  );

  for (const language of ['fr', 'de', 'it', 'pt', 'nl']) {
    it(`${language} has a localized value for every core translation key`, () => {
      const overlay = translationKeys(
        readFileSync(join(process.cwd(), `lib/locales/${language}.ts`), 'utf8'),
      );
      const missing = Array.from(core).filter((key) => !overlay.has(key));

      expect(missing).toEqual([]);
    });
  }
});
