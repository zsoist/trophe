// @vitest-environment jsdom

// User-visible regression for the reported Food defect: an afternoon snack logged
// at 01:00 for a prior day appeared under "Morning Snack" because both snack slots
// persisted meal_type='snack' and the surface guessed AM/PM from created_at.
// These tests drive the real Food page with an injected canonical read and assert
// which RENDERED slot card receives each row.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => {
  const router = { push: h.push, replace: h.replace, refresh: vi.fn(), back: vi.fn() };
  return { useRouter: () => router, usePathname: () => '/dashboard/log', useSearchParams: () => new URLSearchParams() };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: h.getSession, getUser: h.getUser }, from: () => { throw new Error('unexpected REST'); } },
  createSupabaseBrowserClient: () => ({ auth: { getSession: h.getSession } }),
}));

vi.mock('@/lib/food/canonical-food-read', () => ({
  readCanonicalFoodState: h.read,
  confirmCanonicalFoodEntry: vi.fn(),
}));

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

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
    motion: new Proxy({}, { get: (_t, tag: string) => el(tag) }),
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
    pendingDelete: null, pendingBatch: null,
    requestDelete: vi.fn(), undoDelete: vi.fn(), registerBatch: vi.fn(), undoBatch: vi.fn(), clearPending: vi.fn(),
  }),
}));
vi.mock('@/components/food/food-log-delete-port', () => ({ createFoodLogDeletePort: () => ({}) }));
vi.mock('@/components/assistant/screen-date', () => ({ useCoachScreenDate: () => undefined }));

// Real page, but the slot card is a probe so we can read which slot got which rows.
vi.mock('@/components/meals/MealSlotCard', () => ({
  default: ({ slot, entries }: { slot: { id: string }; entries?: Array<{ food_name?: string }> }) => React.createElement('div', {
    'data-testid': 'slot',
    'data-slot': slot.id,
    'data-names': (entries ?? []).map(e => e.food_name).join(','),
  }),
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
import { screen } from '@testing-library/react';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const session = { data: { session: { user: { id: ACTOR }, access_token: 'token' } }, error: null };

function entry(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id),
    user_id: ACTOR,
    logged_date: '2026-09-12',
    meal_type: 'snack',
    meal_slot: null,
    food_name: 'Item',
    quantity: 1,
    unit: 'serving',
    calories: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    fiber_g: 1,
    sugar_g: 3,
    source: 'custom',
    created_at: '2026-09-12T13:00:00.000Z',
    ...overrides,
  };
}

function snapshot(entries: Array<Record<string, unknown>>) {
  return {
    ok: true,
    found: true,
    snapshot: {
      actorId: ACTOR,
      date: '2026-09-12',
      dates: ['2026-09-12'],
      days: [{ date: '2026-09-12', entries, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }],
      week: [{ date: '2026-09-12', calories: 0, entries: entries.length }],
      targets: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      viewPrefs: {},
      streak: 0,
      presentEntryIds: [],
      readAt: '2026-09-12T12:00:00.000Z',
    },
  };
}

beforeEach(() => {
  h.getSession.mockReset();
  h.getUser.mockReset();
  h.read.mockReset();
  localStorage.clear();
});
afterEach(() => { cleanup(); });

async function renderPage() {
  h.getSession.mockResolvedValue(session);
  render(React.createElement(FoodLogPage));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

function namesForSlot(slotId: string): string | null {
  const node = screen.getAllByTestId('slot').find(s => s.getAttribute('data-slot') === slotId);
  return node?.getAttribute('data-names') ?? null;
}

describe('Food log meal-slot routing (rendered)', () => {
  it('shows an explicit afternoon snack (logged at 01:00, prior day) under snack_pm, not snack_am', async () => {
    h.read.mockResolvedValue(snapshot([
      entry({ id: '9b1', meal_type: 'snack', meal_slot: 'snack_pm', food_name: 'Afternoon Yogurt', logged_date: '2026-09-10', created_at: '2026-09-11T01:00:00.000Z' }),
    ]));
    await renderPage();
    expect(namesForSlot('snack_pm')).toBe('Afternoon Yogurt');
    expect(namesForSlot('snack_am')).toBe('');
  });

  it('shows a legacy snack with no AM/PM evidence in a truthful generic bucket, never Morning', async () => {
    h.read.mockResolvedValue(snapshot([
      entry({ id: '9b2', meal_type: 'snack', meal_slot: null, food_name: 'Legacy Snack', created_at: '2026-09-12T03:00:00.000Z' }),
    ]));
    await renderPage();
    expect(namesForSlot('snack')).toBe('Legacy Snack');
    expect(namesForSlot('snack_am')).toBe('');
    expect(namesForSlot('snack_pm')).toBe('');
  });

  it('shows an explicit dinner under the dinner card regardless of the insert hour', async () => {
    h.read.mockResolvedValue(snapshot([
      entry({ id: '9b3', meal_type: 'dinner', meal_slot: 'dinner', food_name: 'Late Dinner', created_at: '2026-09-12T02:05:00.000Z' }),
    ]));
    await renderPage();
    expect(namesForSlot('dinner')).toBe('Late Dinner');
    expect(namesForSlot('snack_am')).toBe('');
    expect(namesForSlot('snack_pm')).toBe('');
  });
});
