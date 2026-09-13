// @vitest-environment jsdom

// Regression — the Food surface's initial/warm load must not dead-end on the
// auth *verification* round-trip.
//
// Reproduced user-visible counterexample (warm reload, session already in cookie
// storage): `loadTodayLog` first awaited `supabase.auth.getUser()`. getUser()
// performs a network `/user` request while holding Supabase Auth's Navigator
// lock, so a stalled auth fetch surfaced as "auth lock not released within
// 5000ms" / "AbortError lock stolen" / "Failed to fetch" and every such failure
// was turned into the terminal `food.log_load_failed` screen — even though the
// session was valid and the RLS-protected canonical read would have succeeded.
// The only recovery was a manual Retry.
//
// The load now resolves the actor from the persisted session (getSession reads
// cookie storage; it does not hold the auth lock across a network call) and the
// canonical read — scoped to that actor and gated by RLS — is the real
// authorization boundary. These tests drive the actual page component:
//   1. a valid cached session renders the log even when auth.getUser() fails
//      (the lock/fetch failure above);
//   2. a genuine session-resolution failure still shows the recoverable error
//      + Retry, and Retry re-reads and renders (no fabricated success);
//   3. a superseded read from a previous date never applies its stale snapshot.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => {
  // Stable identity — the real useRouter returns the same object each render, and
  // the page's load callback depends on it (a fresh object would re-run the load
  // effect on every render).
  const router = { push: h.push, replace: h.replace, refresh: vi.fn(), back: vi.fn() };
  return {
    useRouter: () => router,
    usePathname: () => '/dashboard/log',
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: h.getSession, getUser: h.getUser },
    from: () => { throw new Error('unexpected REST access on the load path'); },
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

// The rendered row probe: exposes how many entries the page actually applied, so
// the assertions below are about the visible log, not internal refs.
vi.mock('@/components/meals/MealSlotCard', () => ({
  default: ({ entries }: { entries?: Array<{ food_name?: string }> }) => React.createElement('div', {
    'data-testid': 'meal-slot',
    'data-count': String(entries?.length ?? 0),
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

const ACTOR = '11111111-1111-4111-8111-111111111111';

function snapshot(foodName: string) {
  const entry = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: ACTOR,
    logged_date: '2026-09-12',
    meal_type: 'lunch',
    food_name: foodName,
    quantity: 1,
    unit: 'serving',
    calories: 300,
    protein_g: 20,
    carbs_g: 30,
    fat_g: 10,
    fiber_g: 3,
    sugar_g: 4,
    source: 'custom',
    created_at: '2026-09-12T12:00:00.000Z',
  };
  return {
    ok: true,
    found: true,
    snapshot: {
      actorId: ACTOR,
      date: '2026-09-12',
      dates: ['2026-09-12'],
      days: [{ date: '2026-09-12', entries: [entry], calories: 300, protein_g: 20, carbs_g: 30, fat_g: 10 }],
      week: [{ date: '2026-09-12', calories: 300, entries: 1 }],
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
  h.getUser.mockReset();
  h.read.mockReset();
  h.push.mockReset();
  h.replace.mockReset();
});

afterEach(() => { cleanup(); });

async function renderPage() {
  render(React.createElement(FoodLogPage));
  // loadTodayLog runs from a 0ms timer effect; flush it and the awaited reads.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

describe('Food log warm reload recovery', () => {
  it('renders the log from a valid cached session even when auth.getUser() fails (lock/fetch)', async () => {
    // The exact production failure shape: the network user-verification call fails
    // while the cached session is perfectly valid.
    h.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Lock "lock:sb-auth-token" was not released within 5000ms') });
    h.getSession.mockResolvedValue(session);
    h.read.mockResolvedValue(snapshot('Lunch'));

    await renderPage();

    const slots = screen.getAllByTestId('meal-slot');
    expect(slots.length).toBeGreaterThan(0);
    expect(screen.queryByText('food.log_load_failed')).toBeNull();
    expect(slots.some(s => s.getAttribute('data-names') === 'Lunch')).toBe(true);
    // The load resolved the actor locally; it never performed the fatal verification call.
    expect(h.getSession).toHaveBeenCalled();
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('still shows a recoverable error + Retry for a genuine session failure, and Retry re-reads', async () => {
    h.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('failed to fetch') });
    h.read.mockResolvedValue(snapshot('Lunch'));

    await renderPage();

    expect(screen.getByText('food.log_load_failed')).toBeTruthy();
    const retry = screen.getByText('food.retry');

    // Retry: the session is now available and the canonical read succeeds.
    h.getSession.mockResolvedValue(session);
    await act(async () => { fireEvent.click(retry); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(screen.queryByText('food.log_load_failed')).toBeNull();
    expect(screen.getAllByTestId('meal-slot').some(s => s.getAttribute('data-names') === 'Lunch')).toBe(true);
    expect(h.read).toHaveBeenCalledTimes(1);
  });

  it('never applies a superseded overlapping read (stale completion)', async () => {
    process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = '1';
    h.getSession.mockResolvedValue(session);
    let resolveStale: (value: unknown) => void = () => {};
    const stale = new Promise(resolve => { resolveStale = resolve; });
    h.read
      .mockResolvedValueOnce(snapshot('Lunch'))       // initial load
      .mockReturnValueOnce(stale)                     // overlapping read #2 (in flight)
      .mockResolvedValueOnce(snapshot('TodayAgain')); // superseding read #3

    render(React.createElement(FoodLogPage));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(screen.getAllByTestId('meal-slot').some(s => s.getAttribute('data-names') === 'Lunch')).toBe(true);

    const refresh = () => window.dispatchEvent(new CustomEvent('trophe:coach-food-refresh', {
      detail: { actorId: ACTOR, entryId: '33333333-3333-4333-8333-333333333333' },
    }));
    // Overlapping canonical reads: the first refresh reaches the read and stays in
    // flight; the second refresh starts and supersedes it.
    await act(async () => { refresh(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { refresh(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(screen.getAllByTestId('meal-slot').map(s => s.getAttribute('data-names'))).toContain('TodayAgain');

    // The superseded read finally settles; its stale snapshot must be dropped.
    await act(async () => { resolveStale(snapshot('StaleLunch')); await new Promise(resolve => setTimeout(resolve, 0)); });

    const names = screen.getAllByTestId('meal-slot').map(s => s.getAttribute('data-names'));
    expect(names).toContain('TodayAgain');
    expect(names).not.toContain('StaleLunch');
    delete process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  });
});
