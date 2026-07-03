/**
 * Trophē — per-coach display preferences (migration 0050).
 *
 * Michael's feedback: "too many features". Instead of deleting panels, every
 * optional panel is registered here with an Essential-preset default, and the
 * coach flips them from a Customize mode (Eye/EyeOff, precedent: AI-memory
 * block visibility toggles).
 *
 * Storage:
 *   profiles.display_prefs            — the coach's OWN surfaces
 *   client_profiles.client_view_prefs — what THIS client sees (per-client,
 *                                       coach-written; replaces lib/client-view.ts)
 *
 * Contract: prefs objects store ONLY overrides ({ [panelId]: boolean }).
 * Unknown/missing keys fall back to the defaults below, so new panels can
 * ship default-off without touching stored rows.
 */

import { z } from 'zod';

// ── Panel registries ───────────────────────────────────────────────────────

/** Coach dashboard panels (app/coach/page.tsx). Essential preset = `true`. */
export const COACH_DASH_PANELS = {
  /** Search + filter pills + client cards are NOT registered — always on. */
  business: true,          // bookings + reach-out list (Michael-requested)
  pendingOnboarding: true,
  activityChart: false,    // check-ins per weekday bar chart
  pulseCards: false,       // 4 stat cards (dupes the filter pills)
  weeklySummary: false,    // dupes pulse cards
  summaryBar: false,       // dupes again
  riskHeatmap: false,      // adds nothing over status dots at <50 clients
  insightChips: false,
  coachStreak: false,      // coach-pointed gamification
  achievements: false,     // was permanently locked "0/10 · Level 1"
  monthlyReport: false,
  compareClients: false,   // was plotting targets-vs-targets
} as const;

/** Coach client-detail panels (app/coach/client/[id]/page.tsx). */
export const CLIENT_DETAIL_PANELS = {
  /** Identity header, macro targets, notes, quick actions are always on. */
  assessment: true,
  habitCard: true,          // active habit + ONE 14-day calendar + progression
  recentFood: true,         // MealPatternView + today-vs-target line
  weightChart: true,        // measurements + custom goal panel
  workouts: true,           // NEW: program + recent sessions + PRs (tRPC-backed)
  intake: false,            // intake interview accordion
  supplementCompliance: false,
  moodTrend: false,
  roadmap: false,
  mealQuality: false,       // invented A–D grades — off by default
  proteinDistribution: false,
  foodHeatmap: false,
  weekendAnalysis: false,
  twoWeekComparison: false, // Michael's rolling 2-week windows (needs 28d fetch)
  healthScore: false,       // composite — was poisoned by 3-day fetch
  consistencyScore: false,  // 30% was hardcoded
  aiInsight: true,          // CoachInsightPanel — the differentiator
  activityTimeline: false,
  smartTools: false,        // AutoMacroOptimizer/CalorieCycling/Recovery (fabricated inputs)
  habitHistory: false,
} as const;

/** What a client sees (client_profiles.client_view_prefs). */
export const CLIENT_VIEW_PANELS = {
  showCalories: false,      // Michael's rule — was lib/client-view.ts constant
  showFoodIdeas: false,
  logAnalytics: false,      // MacroTrend/FoodFrequency/DayPatterns/MonthlyReport
  nutritionIntel: false,    // fasting timer, NutrientDensity, ProteinDistribution, photos
  smartInsight: true,       // one-liner on home
  weeklyCheckin: true,
} as const;

// ── Types + helpers ────────────────────────────────────────────────────────

export type CoachDashPanelId = keyof typeof COACH_DASH_PANELS;
export type ClientDetailPanelId = keyof typeof CLIENT_DETAIL_PANELS;
export type ClientViewPanelId = keyof typeof CLIENT_VIEW_PANELS;

export interface DisplayPrefs {
  coachDash?: Partial<Record<CoachDashPanelId, boolean>>;
  clientDetail?: Partial<Record<ClientDetailPanelId, boolean>>;
}

/** Loose-but-safe parser for the jsonb columns (never throws). */
const overridesSchema = z.record(z.string(), z.boolean());
export const displayPrefsSchema = z
  .object({
    coachDash: overridesSchema.optional(),
    clientDetail: overridesSchema.optional(),
  })
  .partial();

export function parseDisplayPrefs(raw: unknown): DisplayPrefs {
  const parsed = displayPrefsSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as DisplayPrefs) : {};
}

export function parseClientViewPrefs(raw: unknown): Partial<Record<ClientViewPanelId, boolean>> {
  const parsed = overridesSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as Partial<Record<ClientViewPanelId, boolean>>) : {};
}

/** Resolve a panel's visibility: stored override, else Essential default. */
export function isPanelVisible<T extends Record<string, boolean>>(
  defaults: T,
  overrides: Partial<Record<keyof T, boolean>> | undefined,
  id: keyof T,
): boolean {
  return overrides?.[id] ?? defaults[id];
}
