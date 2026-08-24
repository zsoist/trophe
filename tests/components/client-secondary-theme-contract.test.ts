// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const motionPreference = vi.hoisted(() => ({ reduced: true }));
const authHarness = vi.hoisted(() => ({ getUser: vi.fn() }));
const authenticatedUser = { data: { user: { id: 'user-1' } } };
authHarness.getUser.mockResolvedValue(authenticatedUser);

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'layoutId', 'transition', 'variants', 'whileTap', 'custom']);
  const element = (tag: 'button' | 'div' | 'span' | 'h2') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    (props, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      'data-motion-animate': props.animate === undefined ? undefined : JSON.stringify(props.animate),
      ref,
    }, props.children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), span: element('span'), h2: element('h2') },
    useReducedMotion: () => motionPreference.reduced,
  };
});

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement('a', { href }, children) }));
vi.mock('@/lib/useClientNav', () => ({ useClientNav: () => [] }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: { workouts: { program: { mine: { useQuery: () => ({ data: null, isLoading: false }) } } } },
}));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], kgToDisplay: (value: number) => value, displayToKg: (value: number) => value }));
vi.mock('@/components/workout/workout-persistence', () => ({
  createWorkoutSession: vi.fn().mockResolvedValue('session-1'),
  deleteWorkoutSet: vi.fn(), deleteWorkoutSets: vi.fn(),
  finishWorkoutSession: vi.fn().mockResolvedValue(true),
  insertWorkoutSet: vi.fn().mockResolvedValue('set-1'),
  insertWorkoutSets: vi.fn().mockResolvedValue(true),
  loadLastSetsMap: vi.fn().mockResolvedValue({}),
  loadPrMap: vi.fn().mockResolvedValue({}),
  updateWorkoutSupersetGroups: vi.fn().mockResolvedValue(true),
}));
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class { decodeFromConstraints() { return new Promise(() => undefined); } },
}));
vi.mock('@zxing/library', () => ({ DecodeHintType: { POSSIBLE_FORMATS: 'formats' }, BarcodeFormat: {} }));
vi.mock('@/lib/supabase', () => {
  const exercise = { id: 'exercise-1', name: 'Test squat', muscle_group: 'quads', equipment: 'barbell', is_compound: true };
  const from = vi.fn((table: string) => {
    const result = { data: table === 'exercises' ? [exercise] : [], error: null };
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'insert', 'update', 'delete']) {
      query[method] = vi.fn(() => query);
    }
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  });
  return { supabase: { auth: { getUser: authHarness.getUser }, from } };
});

import ExercisePicker from '@/components/workout/ExercisePicker';
import BarcodeLookupModal from '@/components/food/BarcodeLookupModal';
import WorkoutPage from '@/app/dashboard/workout/page';

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

afterEach(() => {
  cleanup();
  motionPreference.reduced = true;
  authHarness.getUser.mockReset().mockResolvedValue(authenticatedUser);
});

function inventory(patterns: readonly RegExp[], files: readonly string[] = OWNED_SOURCES) {
  return files.flatMap((file) => patterns.flatMap((pattern) =>
    (source(file).match(pattern) ?? []).map((match) => `${file}: ${match}`),
  ));
}

describe('client secondary theme and accessibility contract', () => {
  it('keeps workout persistence actions disabled until authentication initialization finishes', async () => {
    let resolveUser!: (value: { data: { user: { id: string } } }) => void;
    authHarness.getUser.mockReturnValueOnce(new Promise((resolve) => { resolveUser = resolve; }));
    render(React.createElement(WorkoutPage));

    const start = screen.getByRole('button', { name: /workout\.strength/ });
    expect(start.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /workout\.cardio/ }));
    const logCardio = screen.getByRole('button', { name: /workout\.cardio_log/ });
    expect(logCardio.hasAttribute('disabled')).toBe(true);

    resolveUser(authenticatedUser);
    await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false));
    expect(logCardio.hasAttribute('disabled')).toBe(false);
    fireEvent.click(start);
    expect(await screen.findByRole('button', { name: 'workout.add_exercise' })).toBeTruthy();
  });

  it('marks booking, messages, and progress loading surfaces for screenshot rejection', () => {
    expect(source('app/dashboard/book/page.tsx')).toMatch(/role="status"[^>]*data-loading-state/);
    expect(source('app/dashboard/messages/page.tsx')).toMatch(/role="status"[^>]*data-loading-state/);
    expect(source('app/dashboard/progress/page.tsx')).toMatch(/data-loading-skeleton/);
  });
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

  it('associates the recipe servings spinbutton with its visible label', () => {
    const recipeAnalyzer = source('components/food/RecipeAnalyzerModal.tsx');
    expect(recipeAnalyzer).toMatch(/<label\s+htmlFor="recipe-servings-yielded"[^>]*>\s*Servings yielded/);
    expect(recipeAnalyzer).toMatch(/<input\s+id="recipe-servings-yielded"\s+type="number"/);
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

  it('restores real workout completion focus to a connected trigger or mounted landing fallback', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    render(React.createElement(WorkoutPage));

    const completeWorkout = async (keepOutsideFocus: boolean) => {
      const start = await screen.findByRole('button', { name: /workout\.strength/ });
      await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false));
      if (keepOutsideFocus) outside.focus();
      fireEvent.click(start);
      fireEvent.click(await screen.findByRole('button', { name: 'workout.add_exercise' }));
      fireEvent.click(await screen.findByRole('button', { name: /workout\.body_area_legs/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'workout.picker_add_named' }));
      const weight = (await screen.findAllByRole('spinbutton'))[0];
      fireEvent.change(weight, { target: { value: '40' } });
      const finish = screen.getByRole('button', { name: 'workout.finish' });
      if (!keepOutsideFocus) finish.focus();
      fireEvent.click(finish);
      await screen.findByRole('dialog', { name: 'workout.summary_title' });
      fireEvent.click(screen.getByRole('button', { name: 'workout.summary_done' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'workout.summary_title' })).toBeNull());
    };

    await completeWorkout(true);
    expect(document.activeElement).toBe(outside);
    await completeWorkout(false);
    expect(document.activeElement).toBe(screen.getByTestId('workout-landing-focus'));
    outside.remove();
  });

  it('renders a static reduced-motion barcode laser and retains the normal sweep branch', async () => {
    const props = { userId: 'user-1', selectedDate: '2026-08-12', isOpen: true, onClose: vi.fn(), onLogged: vi.fn() };
    const view = render(React.createElement(BarcodeLookupModal, props));
    fireEvent.click(screen.getByRole('button', { name: /barcode\.photo/ }));
    const staticLaser = await screen.findByTestId('barcode-laser');
    expect(staticLaser.getAttribute('data-motion-animate')).toBeNull();
    expect(staticLaser.style.top).toBe('50%');

    view.unmount();
    motionPreference.reduced = false;
    render(React.createElement(BarcodeLookupModal, props));
    fireEvent.click(screen.getByRole('button', { name: /barcode\.photo/ }));
    const animatedLaser = await screen.findByTestId('barcode-laser');
    expect(animatedLaser.getAttribute('data-motion-animate')).toContain('94%');
  });

  it('keeps exercise toolbar controls outside the collapse button and names owned icon controls', () => {
    const workout = source('app/dashboard/workout/page.tsx');
    const nestedNativeButton = (workout.match(/<button\b[\s\S]*?<\/button>/g) ?? [])
      .find((button) => (button.match(/<button\b/g) ?? []).length > 1);

    expect(nestedNativeButton).toBeUndefined();
    expect(workout).toMatch(/<Link\s+href="\/dashboard\/workout\/history"\s+aria-label="Workout history"[\s\S]*?min-h-11[\s\S]*?min-w-11/);
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
