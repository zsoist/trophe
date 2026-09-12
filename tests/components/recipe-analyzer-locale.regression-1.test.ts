import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: the recipe analyzer shipped as hard-coded English and always
// posted `language: 'en'`, even though /api/food/recipe-analyze accepts an
// en|es|el|fr hint — so a Spanish/Greek client's recipe came back with English
// ingredient names and an English UI.
const source = readFileSync(
  join(process.cwd(), 'components/food/RecipeAnalyzerModal.tsx'),
  'utf8',
);

const route = readFileSync(
  join(process.cwd(), 'app/api/food/recipe-analyze/route.ts'),
  'utf8',
);

describe('recipe analyzer localization', () => {
  it('forwards the UI language instead of hard-coding English', () => {
    expect(source).not.toContain("language: 'en'");
    expect(source).toContain('language: RECIPE_LANGUAGES.has(lang) ? lang : \'en\'');
  });

  it('keeps the client language set inside the route contract', () => {
    expect(route).toContain("z.enum(['en', 'es', 'el', 'fr'])");
    const setBlock = source.slice(
      source.indexOf('const RECIPE_LANGUAGES'),
      source.indexOf('export default'),
    );
    for (const lang of ['en', 'es', 'el', 'fr']) {
      expect(setBlock).toContain(`'${lang}'`);
    }
  });

  it('renders localized chrome instead of hard-coded English labels', () => {
    expect(source).toContain('useFoodI18n');
    expect(source).not.toContain('aria-label="Analyze recipe"');
    expect(source).not.toContain('aria-label="Close recipe analyzer"');
    expect(source).not.toContain('>Servings yielded<');
    expect(source).not.toContain('Edit recipe</button>');
  });

  it('localizes the failure copy and the persisted servings label', () => {
    // Was a literal 'Analysis failed' (and a hard-coded `${n} serving(s)` logged
    // as the entry's food_name regardless of UI language).
    expect(source).not.toContain("'Analysis failed'");
    expect(source).toContain("t('food.recipe_analysis_failed')");
    expect(source).toContain("t(logServings === 1 ? 'food.unit.serving_one' : 'food.unit.serving_other')");
  });
});
