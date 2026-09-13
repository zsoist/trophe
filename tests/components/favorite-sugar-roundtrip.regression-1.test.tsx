// @vitest-environment jsdom

// Regression — favorite → re-log must preserve canonical "unknown" sugar.
//
// A manual food entry has sugar_g = null (unknown, not measured zero). Tapping
// the star used to store `entry.sugar_g ?? 0`, so the favorite carried a fake
// measured 0 and the quick-log chip wrote that 0 back into food_log on re-log.
// These tests drive the REAL page: toggle the star, reload from localStorage,
// tap the favorite chip, and assert the persisted insert payload. Historical
// stored 0s are left untouched (never reinterpreted as unknown).

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => {
  const router = { push: h.push, replace: h.replace, refresh: vi.fn(), back: vi.fn() };
  return {
    useRouter: () => router,
    usePathname: () => '/dashboard/log',
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: h.getSession, getUser: vi.fn() },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        h.inserts.push(payload);
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: 'inserted-row' }, error: null }),
          }),
        };
      },
    }),
  },
  createSupabaseBrowserClient: () => ({ auth: { getSession: h.getSession } }),
}));

vi.mock('@/lib/food/canonical-food-read', () => ({
  readCanonicalFoodState: h.read,
  confirmCanonicalFoodEntry: vi.fn(),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('framer-motion', () => {
  const motionProps = new Set(['animate', 'exit', 'initial', 'transition', 'whileTap', 'layout', 'onAnimationComplete']);
  const el = (tag: string) => {
    const component = React.forwardRef<HTMLElement, Record<string, unknown>>(
      ({ children, ...props }, ref) => React.createElement(
        tag,
        { ...Object.fromEntries(Object.entries(props).filter(([k]) => !motionProps.has(k))), ref },
        children as React.ReactNode,
      ),
    );
    component.displayName = `MockMotion(${tag})`;
    return component;
  };
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: el('button'), div: el('div'), span: el('span'), path: el('path'), circle: el('circle') },
    useReducedMotion: () => true,
  };
});

vi.mock('@/components/ui', () => ({
  Icon: () => null,
  AnimatedValue: () => null,
  Stagger: ({ children }: { children: React.ReactNode }) => children,
  StaggerItem: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/food/use-food-log-delete', () => ({
  useFoodLogDelete: () => ({
    pendingDelete: null,
    pendingBatch: null,
    requestDelete: vi.fn(),
    undoDelete: vi.fn(),
    registerBatch: vi.fn(),
    undoBatch: vi.fn(),
    clearPending: vi.fn(),
  }),
}));

vi.mock('@/components/food/food-log-delete-port', () => ({
  createFoodLogDeletePort: () => ({}),
}));

vi.mock('@/components/assistant/screen-date', () => ({
  useCoachScreenDate: () => undefined,
}));

// The star lives inside MealSlotCard in the real UI. Expose the page's real
// toggleFavorite through a probe so the test exercises the actual handler.
vi.mock('@/components/meals/MealSlotCard', () => ({
  default: ({
    entries = [],
    onToggleFavorite,
  }: {
    entries?: Array<{ id: string; food_name: string }>;
    onToggleFavorite?: (entry: unknown) => void;
  }) => React.createElement(
    'div',
    { 'data-testid': 'meal-slot' },
    entries.map(entry => React.createElement(
      'button',
      {
        key: entry.id,
        'data-testid': `star-${entry.food_name}`,
        onClick: () => onToggleFavorite?.(entry),
      },
      `star ${entry.food_name}`,
    )),
  ),
}));

vi.mock('@/components/summary/DailyInsights', () => ({ default: () => null }));
vi.mock('@/components/food/MealBadges', () => ({ default: () => null }));
vi.mock('@/components/meals/MealSlotConfig', () => ({ default: () => null }));
vi.mock('@/components/shared/CalendarView', () => ({ default: () => null }));
vi.mock('@/components/charts/ProteinDistribution', () => ({ default: () => null }));
vi.mock('@/components/health/NutrientDensity', () => ({ default: () => null }));
vi.mock('@/components/charts/MacroTrendChart', () => ({ default: () => null }));
vi.mock('@/components/charts/CalorieHeatmap', () => ({ default: () => null }));
vi.mock('@/components/food/FoodFrequency', () => ({ default: () => null }));
vi.mock('@/components/habits/FastingTimer', () => ({ default: () => null }));
vi.mock('@/components/charts/DayPatterns', () => ({ default: () => null }));
vi.mock('@/components/summary/MonthlyReport', () => ({ default: () => null }));
vi.mock('@/components/meals/MealPhotoGallery', () => ({ default: () => null }));
vi.mock('@/components/progress/DayComparison', () => ({ default: () => null }));
vi.mock('@/components/food/CoachFoodRecs', () => ({ default: () => null }));
vi.mock('@/components/food/RecipeAnalyzerModal', () => ({ default: () => null }));
vi.mock('@/components/nutrition/DailyMacroStrip', () => ({ default: () => null }));

import FoodLogPage from '@/app/dashboard/log/page';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const DATE = '2026-09-12';

function snapshot(foodName: string, sugar: number | null) {
  const entry = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: ACTOR,
    logged_date: DATE,
    meal_type: 'lunch',
    food_name: foodName,
    quantity: 1,
    unit: 'serving',
    calories: 300,
    protein_g: 20,
    carbs_g: 30,
    fat_g: 10,
    fiber_g: 3,
    sugar_g: sugar,
    source: 'custom',
    created_at: '2026-09-12T12:00:00.000Z',
  };
  return {
    ok: true,
    found: true,
    snapshot: {
      actorId: ACTOR,
      date: DATE,
      dates: [DATE],
      days: [{ date: DATE, entries: [entry], calories: 300, protein_g: 20, carbs_g: 30, fat_g: 10 }],
      week: [{ date: DATE, calories: 300, entries: 1 }],
      targets: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
      viewPrefs: {},
      streak: 0,
      presentEntryIds: [],
      readAt: '2026-09-12T12:00:00.000Z',
    },
  };
}

const session = { data: { session: { user: { id: ACTOR }, access_token: 'token' } }, error: null };

beforeEach(() => {
  h.getSession.mockReset();
  h.read.mockReset();
  h.push.mockReset();
  h.replace.mockReset();
  h.inserts.length = 0;
  window.localStorage.clear();
});

afterEach(() => { cleanup(); });

async function renderPage() {
  render(React.createElement(FoodLogPage));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

describe('favorite → re-log preserves unknown sugar', () => {
  it('stores null (not a fake 0) and writes it back unchanged on re-log', async () => {
    h.getSession.mockResolvedValue(session);
    h.read.mockResolvedValue(snapshot('ManualFood', null));

    await renderPage();

    // Tap the star on the manual entry whose sugar is unknown.
    fireEvent.click(screen.getByTestId('star-ManualFood'));
    await act(async () => {});

    const stored = JSON.parse(window.localStorage.getItem('trophe_favorites') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].sugar_g).toBeNull();

    // Reload the page: the favorite is re-hydrated from storage, not in-memory state.
    cleanup();
    await renderPage();

    fireEvent.click(screen.getByText('ManualFood'));
    await act(async () => {});

    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].sugar_g).toBeNull();
    expect(h.inserts[0].food_name).toBe('ManualFood');
  });

  it('leaves a historical favorite with a real measured 0 untouched', async () => {
    window.localStorage.setItem('trophe_favorites', JSON.stringify([
      { food_name: 'LegacyZero', calories: 300, protein_g: 20, carbs_g: 30, fat_g: 10, fiber_g: 3, sugar_g: 0 },
    ]));
    h.getSession.mockResolvedValue(session);
    h.read.mockResolvedValue(snapshot('Lunch', 4));

    await renderPage();

    fireEvent.click(screen.getByText('LegacyZero'));
    await act(async () => {});

    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].sugar_g).toBe(0);
  });
});
