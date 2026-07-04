/**
 * Canonical macro → color map for the whole app.
 *
 * WHY this scheme: the dashboard "Today" hero is the single most-used screen —
 * users learn "protein = red, carbs = blue, fat = plum" there first, so every
 * other surface must match it. Before this token existed, onboarding taught
 * protein-blue/carbs-amber/fat-rose while the dashboard taught the opposite,
 * which reads as a bug. One import, one truth.
 *
 * All values are CSS-var based so the `.light` theme overrides in
 * app/globals.css keep contrast correct in both modes.
 */

export const MACRO_COLORS = {
  // --m-* are the user-selectable chart-palette layer (lib/appearance.ts sets
  // them on <html>; globals.css holds the defaults). Falling back to the old
  // semantic vars keeps SSR + no-JS renders identical to the classic palette.
  calories: 'var(--m-cal, var(--gold-300, #D4A853))',
  protein: 'var(--m-protein, var(--err, #E87A6E))',
  carbs: 'var(--m-carbs, var(--info, #7DA3D9))',
  fat: 'var(--m-fat, var(--plum, #B89DD9))',
  fiber: 'var(--m-fiber, var(--ok, #65D387))',
  sugar: 'var(--warn, #E8B86E)',
  water: 'var(--info, #7DA3D9)',
} as const;

export type MacroKey = keyof typeof MACRO_COLORS;
