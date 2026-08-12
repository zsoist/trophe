import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT_CORE_SOURCES = [
  'app/dashboard/page.tsx',
  'app/dashboard/log/page.tsx',
  'app/dashboard/progress/page.tsx',
  'app/dashboard/profile/page.tsx',
  'components/meals/MealSlotCard.tsx',
  'components/meals/MealSlotConfig.tsx',
  'components/progress/CustomizeSheet.tsx',
  'components/progress/DayComparison.tsx',
  'components/shared/ThemePicker.tsx',
] as const;

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('client core theme and accessibility contract', () => {
  it('contains no dark-only utility islands or undersized functional text', () => {
    const violations = CLIENT_CORE_SOURCES.flatMap((file) => {
      const contents = source(file);
      const patterns = [
        /bg-stone-9\d\d/g,
        /text-stone-[1-6]\d\d/g,
        /bg-white\/\[/g,
        /border-white\/\[/g,
        /text-\[(?:9|10|11)px\]/g,
        /text-(?:9|10|11)px/g,
      ];

      return patterns.flatMap((pattern) => (contents.match(pattern) ?? []).map((match) => `${file}: ${match}`));
    });

    expect(violations).toEqual([]);
  });

  it('keeps water controls explicitly named, toggleable, and target-sized', () => {
    const dashboard = source('app/dashboard/page.tsx');

    expect(dashboard).toMatch(/aria-label=\{`Log water cup \$\{i \+ 1\}`\}/);
    expect(dashboard).toMatch(/aria-pressed=\{filled\}/);
    expect(dashboard).toMatch(/min-h-11 min-w-11/);
  });

  it('uses the shared theme-mode context instead of route-local theme state', () => {
    const dashboard = source('app/dashboard/page.tsx');
    const themePicker = source('components/shared/ThemePicker.tsx');

    expect(dashboard).toContain("useThemeMode");
    expect(dashboard).not.toMatch(/useState<'dark' \| 'light'>/);
    expect(themePicker).toContain("useThemeMode");
  });

  it('keeps appearance-picker controls named, selected, and target-sized', () => {
    const themePicker = source('components/shared/ThemePicker.tsx');

    expect(themePicker).toContain('aria-label="Close appearance picker"');
    expect(themePicker).toContain('aria-pressed={prefs.accent === theme.id}');
    expect(themePicker).toContain('min-h-11 min-w-11');
    expect(themePicker).toContain('focus-visible:ring-2');
  });
});
