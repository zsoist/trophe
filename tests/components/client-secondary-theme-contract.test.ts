import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE_SOURCES = [
  'app/dashboard/book/page.tsx',
  'app/dashboard/checkin/page.tsx',
  'app/dashboard/intake/page.tsx',
  'app/dashboard/messages/page.tsx',
  'app/dashboard/supplements/page.tsx',
  'app/dashboard/workout/page.tsx',
  'app/dashboard/workout/history/page.tsx',
  'app/dashboard/workout/stats/page.tsx',
  'app/dashboard/workout/form-check/page.tsx',
] as const;

const PRESENTATION_SOURCES = [
  'components/food/BarcodeLookupModal.tsx',
  'components/food/CoachFoodRecs.tsx',
  'components/food/FoodFrequency.tsx',
  'components/food/MealBadges.tsx',
  'components/food/ParsedFoodList.tsx',
  'components/food/PhotoScanCard.tsx',
  'components/food/ProvenanceRing.tsx',
  'components/food/QuickFoodInput.tsx',
  'components/food/RecipeAnalyzerModal.tsx',
  'components/health/BodyCompCalculator.tsx',
  'components/health/NutrientDensity.tsx',
  'components/health/SupplementCompliance.tsx',
  'components/workout/ExerciseInfoSheet.tsx',
  'components/workout/ExercisePicker.tsx',
  'components/workout/FormCheck.tsx',
  'components/workout/FormScore.tsx',
  'components/workout/GuidedSession.tsx',
  'components/workout/PainFlagModal.tsx',
  'components/workout/PlateCalculator.tsx',
  'components/workout/PoseOverlay.tsx',
  'components/workout/RecentSessionCard.tsx',
  'components/workout/TodayProgramCard.tsx',
  'components/workout/TodayWorkoutCard.tsx',
  'components/shared/ChatThread.tsx',
  'components/shared/CalendarView.tsx',
] as const;

const OWNED_SOURCES = [...ROUTE_SOURCES, ...PRESENTATION_SOURCES] as const;
const OVERLAY_SOURCES = [
  'components/food/BarcodeLookupModal.tsx',
  'components/food/CoachFoodRecs.tsx',
  'components/food/RecipeAnalyzerModal.tsx',
  'components/workout/ExerciseInfoSheet.tsx',
  'components/workout/ExercisePicker.tsx',
  'components/workout/PainFlagModal.tsx',
  'components/workout/PlateCalculator.tsx',
  'components/shared/CalendarView.tsx',
] as const;

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

function inventory(patterns: readonly RegExp[], files: readonly string[] = OWNED_SOURCES) {
  return files.flatMap((file) => patterns.flatMap((pattern) =>
    (source(file).match(pattern) ?? []).map((match) => `${file}: ${match}`),
  ));
}

describe('client secondary theme and accessibility contract', () => {
  it('contains no dark-only surface, content, border, or legacy-token recipes', () => {
    const forbidden = [
      /bg-stone-(?:800|900|950)(?:\/[\d.]+)?/g,
      /text-stone-\d{2,3}/g,
      /(?:bg|border)-white\/(?:\[|\d)/g,
      /bg-\[#(?:0a0a0a|000000|000)\]/gi,
      /rgba\(255,\s*255,\s*255/g,
      /var\(--(?:t[1-6]|line(?:-2)?|bg(?:-1)?)(?:[,\)])/g,
      /var\(--bg-(?:primary|card(?:-elevated)?|hover)\)/g,
      /style=\{\{[^}]*background:\s*['"]#0a0a0a['"]/g,
    ];

    expect(inventory(forbidden)).toEqual([]);
  });

  it('keeps functional labels at 12px or larger', () => {
    const forbidden = [
      /text-\[(?:8|9|10|11)px\]/g,
      /fontSize:\s*(?:[89]|10|11)(?:\.\d+)?(?:[,}])/g,
      /fontSize="(?:[89]|10|11)(?:\.\d+)?"/g,
    ];

    expect(inventory(forbidden)).toEqual([]);
  });

  it('keeps mobile input, textarea, and select text at 16px', () => {
    const controls = OWNED_SOURCES.flatMap((file) => [
      ...(source(file).match(/<(?:input|textarea)\b[\s\S]*?\/>/g) ?? []),
      ...(source(file).match(/<select\b[\s\S]*?<\/select>/g) ?? []),
    ].map((element) => ({ file, element })));
    const undersized = controls.filter(({ element }) =>
      !/type="(?:checkbox|file|hidden|range)"/.test(element)
      && !/(?:text-base|text-\[16px\])/.test(element)
      && !/fontSize:\s*(?:1[6-9]|[2-9]\d)/.test(element),
    );

    expect(controls.length).toBeGreaterThan(0);
    expect(undersized.map(({ file, element }) => `${file}: ${element.slice(0, 120)}`)).toEqual([]);
  });

  it('gives every owned sheet and modal semantic, safe-area, focus, close, and motion treatment', () => {
    const violations = OVERLAY_SOURCES.flatMap((file) => {
      const value = source(file);
      return [
        !/role="dialog"/.test(value) && `${file}: missing dialog role`,
        !/aria-modal="true"/.test(value) && `${file}: missing modal semantics`,
        !/aria-(?:label|labelledby)=/.test(value) && `${file}: missing dialog name`,
        !/(?:safe-bottom|env\(safe-area-inset-bottom\))/.test(value) && `${file}: missing bottom-nav safe area`,
        !/(?:useReducedMotion|motion-reduce:)/.test(value) && `${file}: missing reduced-motion gate`,
        !/(?:key (?:===|!==) 'Escape'|key (?:===|!==) "Escape")/.test(value) && `${file}: missing Escape behavior`,
        !/(?:previousFocus|returnFocus)/.test(value) && `${file}: missing focus restoration`,
        !/aria-label=/.test(value) && `${file}: missing named control`,
        !/(?:min-h-11|h-11|minHeight:\s*44)/.test(value) && `${file}: missing 44px control`,
        !/focus-visible:/.test(value) && `${file}: missing visible focus`,
      ].filter(Boolean) as string[];
    });

    expect(violations).toEqual([]);

    const exercisePicker = source('components/workout/ExercisePicker.tsx');
    expect(exercisePicker.match(/role="dialog"/g)).toHaveLength(2);
    expect(exercisePicker.match(/aria-modal="true"/g)).toHaveLength(2);
    expect(exercisePicker.match(/previousFocus/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(exercisePicker).toContain('useReducedMotion');
  });

  it('marks intrinsic black camera and image canvases without making their shells dark-only', () => {
    const blackCanvasRecipes = inventory([
      /<[^>]+(?:bg-black|background:\s*['"](?:#000|black)['"])[^>]*>/g,
    ], [
      'components/food/BarcodeLookupModal.tsx',
      'components/workout/FormCheck.tsx',
      'components/shared/ChatThread.tsx',
    ]);
    const unmarked = blackCanvasRecipes.filter((element) =>
      !/data-theme-exempt=(?:"media-canvas"|\{'media-canvas'\})/.test(element),
    );

    expect(blackCanvasRecipes.length).toBeGreaterThan(0);
    expect(unmarked).toEqual([]);
    expect(source('app/dashboard/workout/form-check/page.tsx')).not.toContain('bg-[#0a0a0a]');
    expect(source('components/workout/ExercisePicker.tsx')).not.toContain("background: '#0a0a0a'");
  });
});
