// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'layoutId', 'transition', 'variants', 'whileTap', 'custom']);
  const element = (tag: 'button' | 'div' | 'span' | 'h2') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    (props, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))), ref,
    }, props.children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), span: element('span'), h2: element('h2') },
    useReducedMotion: () => true,
  };
});

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));

import ExercisePicker from '@/components/workout/ExercisePicker';
import { restoreCompletionFocus } from '@/app/dashboard/workout/page';

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
  'components/shared/ChatThread.tsx',
  'app/dashboard/workout/page.tsx',
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
  'components/shared/ChatThread.tsx',
  'app/dashboard/workout/page.tsx',
] as const;

const EXPECTED_DIALOG_ROOTS: Record<(typeof OVERLAY_SOURCES)[number], number> = {
  'components/food/BarcodeLookupModal.tsx': 1,
  'components/food/CoachFoodRecs.tsx': 1,
  'components/food/RecipeAnalyzerModal.tsx': 1,
  'components/workout/ExerciseInfoSheet.tsx': 1,
  'components/workout/ExercisePicker.tsx': 2,
  'components/workout/PainFlagModal.tsx': 1,
  'components/workout/PlateCalculator.tsx': 1,
  'components/shared/CalendarView.tsx': 1,
  'components/shared/ChatThread.tsx': 1,
  'app/dashboard/workout/page.tsx': 1,
};

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

afterEach(() => cleanup());

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
      && (/(?:fontSize:\s*(?!16(?:\.0+)?[,}])\d+(?:\.\d+)?)(?:[,}])/.test(element)
        || (!/(?:text-base|text-\[16px\])/.test(element)
          && !/fontSize:\s*(?:1[6-9]|[2-9]\d)/.test(element))),
    );

    expect(controls.length).toBeGreaterThan(0);
    expect(undersized.map(({ file, element }) => `${file}: ${element.slice(0, 120)}`)).toEqual([]);
  });

  it('gives every owned sheet and modal semantic, safe-area, focus, close, and motion treatment', () => {
    const violations = OVERLAY_SOURCES.flatMap((file) => {
      const value = source(file);
      const roots = [...value.matchAll(/role="dialog"/g)].map(({ index = 0 }) => value.slice(Math.max(0, index - 450), index + 1100));
      const rootViolations = roots.flatMap((root, index) => [
        !/aria-modal="true"/.test(root) && `${file} dialog ${index + 1}: missing modal semantics`,
        !/aria-(?:label|labelledby)=/.test(root) && `${file} dialog ${index + 1}: missing dialog name`,
        !/(?:safe-bottom|env\(safe-area-inset-bottom\))/.test(root) && `${file} dialog ${index + 1}: missing bottom-nav safe area`,
        !/tabIndex=\{-1\}/.test(root) && `${file} dialog ${index + 1}: missing focus entry target`,
        !/onKeyDown=\{\(event\) => trapFocus/.test(root) && `${file} dialog ${index + 1}: missing focus containment`,
      ].filter(Boolean) as string[]);

      return [
        roots.length !== EXPECTED_DIALOG_ROOTS[file] && `${file}: expected ${EXPECTED_DIALOG_ROOTS[file]} dialog roots, found ${roots.length}`,
        !/(?:useReducedMotion|motion-reduce:)/.test(value) && `${file}: missing reduced-motion gate`,
        !/(?:key (?:===|!==) 'Escape'|key (?:===|!==) "Escape")/.test(value) && `${file}: missing Escape behavior`,
        !/(?:previousFocus|returnFocus|ReturnFocus|ReturnRef)/.test(value) && `${file}: missing focus restoration`,
        !/aria-label=/.test(value) && `${file}: missing named control`,
        !/(?:min-h-11|h-11|minHeight:\s*44)/.test(value) && `${file}: missing 44px control`,
        !/focus-visible:/.test(value) && `${file}: missing visible focus`,
        ...rootViolations,
      ].filter(Boolean) as string[];
    });

    expect(violations).toEqual([]);

    const exercisePicker = source('components/workout/ExercisePicker.tsx');
    expect(exercisePicker.match(/role="dialog"/g)).toHaveLength(2);
    expect(exercisePicker.match(/aria-modal="true"/g)).toHaveLength(2);
    expect(exercisePicker.match(/previousFocus/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(exercisePicker).toContain('useReducedMotion');
  });

  it('closes only the top custom-exercise dialog on Escape', () => {
    const onClose = vi.fn();
    render(React.createElement(ExercisePicker, {
      exercises: [], recentIds: [], onSelect: vi.fn(), onClose, lang: 'en',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'workout.picker_custom' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps parent focus ownership stable while a child dialog opens and closes', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = render(React.createElement(ExercisePicker, {
      exercises: [], recentIds: [], onSelect: vi.fn(), onClose: vi.fn(), lang: 'en',
    }));
    const customTrigger = screen.getByRole('button', { name: 'workout.picker_custom' });
    customTrigger.focus();
    fireEvent.click(customTrigger);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('workout.custom_name')));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(customTrigger));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('captures completion focus before the workout mode transition', () => {
    const workout = source('app/dashboard/workout/page.tsx');
    const completion = workout.slice(workout.indexOf('// Reset + celebrate'), workout.indexOf("navigator.vibrate?.([10, 30, 10, 30, 18])"));

    expect(completion).toMatch(/finishReturnFocusRef\.current\s*=\s*document\.activeElement[\s\S]*setMode\('landing'\)/);
    expect(workout).not.toMatch(/if \(!finishSummary\) return;\s*finishReturnFocusRef\.current = document\.activeElement/);

    const trigger = document.createElement('button');
    const fallback = document.createElement('div');
    fallback.tabIndex = -1;
    document.body.append(trigger, fallback);
    restoreCompletionFocus(trigger, fallback);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    restoreCompletionFocus(trigger, fallback);
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it('keeps exercise toolbar controls outside the collapse button and names owned icon controls', () => {
    const workout = source('app/dashboard/workout/page.tsx');
    const nestedNativeButton = (workout.match(/<button\b[\s\S]*?<\/button>/g) ?? [])
      .find((button) => (button.match(/<button\b/g) ?? []).length > 1);

    expect(nestedNativeButton).toBeUndefined();
    expect(workout).toMatch(/aria-label=\{`Toggle .* exercise`\}/);
    expect(workout).toMatch(/aria-label=\{`Report pain for .*`\}/);
    expect(workout).toMatch(/aria-label=\{`Remove .*`\}/);
    expect(source('app/dashboard/checkin/page.tsx').match(/aria-label="Back to dashboard"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source('app/dashboard/intake/page.tsx')).toContain('aria-label="Exit intake"');
  });

  it('associates reduced-motion handling with each looping or transitioning animation root', () => {
    const barcode = source('components/food/BarcodeLookupModal.tsx');
    const calendar = source('components/shared/CalendarView.tsx');
    const checkin = source('app/dashboard/checkin/page.tsx');

    expect(barcode).not.toMatch(/repeat:\s*reducedMotion/);
    expect(barcode).toMatch(/reducedMotion\s*\?\s*\(\s*<div[\s\S]{0,350}data-testid="barcode-laser"[\s\S]{0,350}\)\s*:\s*\(\s*<motion\.div[\s\S]{0,350}animate=\{\{ top:/);
    expect(calendar).toMatch(/transition=\{\{ duration: reducedMotion \? 0 : 0\.2 \}\}/);
    expect(checkin).toContain('useReducedMotion');
    expect(checkin).toMatch(/animation:\s*reducedMotion \? 'none'/);
  });

  it('uses distinct semantic status foreground, surface, and border roles', () => {
    const forbidden = [
      /border:\s*['"`]1px solid var\(--status-(?:success|warning|danger|info)-bg\)/g,
      /color:\s*['"]var\(--status-(?:success|warning|danger|info)-bg\)['"]/g,
      /(?:#(?:22c55e|4ade80|65d387|ef4444|f87171|e87a6e|f59e0b|fbbf24)|rgba?\((?:34,\s*197,\s*94|239,\s*68,\s*68|248,\s*113,\s*113|101,\s*211,\s*135))/gi,
      /(?:bg|text|border)-(?:red|green|emerald|amber|yellow)-(?:300|400|500|600)(?:\/[\d.]+)?/g,
    ];

    expect(inventory(forbidden)).toEqual([]);
    expect(inventory([
      /(?:#78716c|rgba\((?:251,\s*191,\s*36|125,\s*163,\s*217))/gi,
    ], [
      'app/dashboard/workout/page.tsx',
      'app/dashboard/workout/stats/page.tsx',
      'components/workout/GuidedSession.tsx',
    ])).toEqual([]);
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
