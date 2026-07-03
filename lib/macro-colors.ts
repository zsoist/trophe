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
  calories: 'var(--gold-300, #D4A853)',
  protein: 'var(--err, #E87A6E)',
  carbs: 'var(--info, #7DA3D9)',
  fat: 'var(--plum, #B89DD9)',
  fiber: 'var(--ok, #65D387)',
  sugar: 'var(--warn, #E8B86E)',
  water: 'var(--info, #7DA3D9)',
} as const;

export type MacroKey = keyof typeof MACRO_COLORS;
