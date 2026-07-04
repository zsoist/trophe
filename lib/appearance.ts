'use client';

/**
 * User-owned appearance system (progress + settings mega overhaul).
 *
 * One source of truth for: accent color, chart palette, density, and the
 * progress-page panel registry (visibility + order). Persisted in
 * profiles.display_prefs.appearance (jsonb — column exists, no migration) and
 * mirrored to localStorage so the accent applies before the network round-trip.
 *
 * Applied as CSS variables on <html> — every chart reads var(--accent) /
 * var(--m-*) so a palette switch re-themes the whole app without prop-drilling.
 *
 * Layering rule: user customization works WITHIN coach permission —
 * a client can hide a panel the coach allows, never reveal one the coach gated
 * (see isPanelVisible/CLIENT_VIEW_PANELS in lib/display-prefs.ts).
 */

// ─── Accent colors ────────────────────────────────────────────────────────────

export interface AccentOption {
  id: string;
  labelKey: string;   // i18n key
  value: string;      // main hex
  soft: string;       // 10-15% alpha wash for backgrounds
  strong: string;     // hover/active
}

export const ACCENTS: AccentOption[] = [
  { id: 'gold', labelKey: 'appearance.accent_gold', value: '#D4A853', soft: 'rgba(212,168,83,.12)', strong: '#E8C078' },
  { id: 'ember', labelKey: 'appearance.accent_ember', value: '#E8836E', soft: 'rgba(232,131,110,.12)', strong: '#F09A87' },
  { id: 'jade', labelKey: 'appearance.accent_jade', value: '#6ECFA3', soft: 'rgba(110,207,163,.12)', strong: '#8BDDB8' },
  { id: 'sky', labelKey: 'appearance.accent_sky', value: '#7DA3D9', soft: 'rgba(125,163,217,.12)', strong: '#9BBAE6' },
  { id: 'plum', labelKey: 'appearance.accent_plum', value: '#B89DD9', soft: 'rgba(184,157,217,.12)', strong: '#CBB5E6' },
  { id: 'rose', labelKey: 'appearance.accent_rose', value: '#E091B9', soft: 'rgba(224,145,185,.12)', strong: '#EBACC9' },
];

// ─── Chart palettes (macro + status colors used by every chart) ───────────────

export interface ChartPalette {
  id: string;
  labelKey: string;
  /** calories / protein / carbs / fat / fiber — preview order too */
  colors: { cal: string; protein: string; carbs: string; fat: string; fiber: string };
}

export const CHART_PALETTES: ChartPalette[] = [
  {
    id: 'classic', labelKey: 'appearance.palette_classic',
    colors: { cal: '#D4A853', protein: '#E87A6E', carbs: '#7DA3D9', fat: '#B89DD9', fiber: '#65D387' },
  },
  {
    id: 'vivid', labelKey: 'appearance.palette_vivid',
    colors: { cal: '#F5B93E', protein: '#F0645C', carbs: '#4D9DE0', fat: '#9B5DE5', fiber: '#3DDC84' },
  },
  {
    id: 'dusk', labelKey: 'appearance.palette_dusk',
    colors: { cal: '#E0B089', protein: '#D98282', carbs: '#8FA8C9', fat: '#A893C9', fiber: '#8FBC9F' },
  },
  {
    id: 'mono', labelKey: 'appearance.palette_mono',
    // Accent-anchored monochrome — cal slot resolves to the live accent at apply time.
    colors: { cal: 'accent', protein: '#D6D3D1', carbs: '#A8A29E', fat: '#78716C', fiber: '#57534E' },
  },
];

// ─── Progress panel registry ──────────────────────────────────────────────────

export interface ProgressPanelDef {
  id: string;
  labelKey: string;
  /** requires this coach gate to be open (lib/display-prefs CLIENT_VIEW_PANELS key) */
  coachGate?: 'showCalories' | 'logAnalytics' | 'nutritionIntel';
  defaultVisible: boolean;
}

/** Default order IS the array order. */
export const PROGRESS_PANELS: ProgressPanelDef[] = [
  { id: 'journey', labelKey: 'progress.panel_journey', defaultVisible: true },
  { id: 'weightTrend', labelKey: 'progress.panel_weight', defaultVisible: true },
  { id: 'goalProjection', labelKey: 'progress.panel_goal', defaultVisible: true },
  { id: 'bodyComp', labelKey: 'progress.panel_bodycomp', defaultVisible: true },
  { id: 'weeklyMacros', labelKey: 'progress.panel_macros', coachGate: 'showCalories', defaultVisible: true },
  { id: 'currentStats', labelKey: 'progress.panel_stats', defaultVisible: true },
  { id: 'habitRadar', labelKey: 'progress.panel_radar', defaultVisible: true },
  { id: 'completedHabits', labelKey: 'progress.panel_habits', defaultVisible: true },
  { id: 'photos', labelKey: 'progress.panel_photos', defaultVisible: true },
];

// ─── Prefs shape + persistence ────────────────────────────────────────────────

export interface AppearancePrefs {
  accent: string;                       // ACCENTS id
  palette: string;                      // CHART_PALETTES id
  density: 'comfortable' | 'compact';
  panels: Record<string, boolean>;      // overrides only
  panelOrder: string[];                 // full order; unknown ids appended
}

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  accent: 'gold',
  palette: 'classic',
  density: 'comfortable',
  panels: {},
  panelOrder: PROGRESS_PANELS.map((p) => p.id),
};

const LS_KEY = 'trophe_appearance';

export function parseAppearance(raw: unknown): AppearancePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };
  const r = raw as Partial<AppearancePrefs>;
  const order = Array.isArray(r.panelOrder) ? r.panelOrder.filter((id) => PROGRESS_PANELS.some((p) => p.id === id)) : [];
  for (const p of PROGRESS_PANELS) if (!order.includes(p.id)) order.push(p.id);
  return {
    accent: ACCENTS.some((a) => a.id === r.accent) ? (r.accent as string) : DEFAULT_APPEARANCE.accent,
    palette: CHART_PALETTES.some((p) => p.id === r.palette) ? (r.palette as string) : DEFAULT_APPEARANCE.palette,
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    panels: r.panels && typeof r.panels === 'object' ? { ...(r.panels as Record<string, boolean>) } : {},
    panelOrder: order,
  };
}

export function loadLocalAppearance(): AppearancePrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE };
  try {
    return parseAppearance(JSON.parse(window.localStorage.getItem(LS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveLocalAppearance(prefs: AppearancePrefs) {
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

/** Write the CSS variables that the whole app reads. */
export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const accent = ACCENTS.find((a) => a.id === prefs.accent) ?? ACCENTS[0];
  root.style.setProperty('--accent', accent.value);
  root.style.setProperty('--accent-soft', accent.soft);
  root.style.setProperty('--accent-strong', accent.strong);

  const palette = CHART_PALETTES.find((p) => p.id === prefs.palette) ?? CHART_PALETTES[0];
  const resolve = (c: string) => (c === 'accent' ? accent.value : c);
  root.style.setProperty('--m-cal', resolve(palette.colors.cal));
  root.style.setProperty('--m-protein', resolve(palette.colors.protein));
  root.style.setProperty('--m-carbs', resolve(palette.colors.carbs));
  root.style.setProperty('--m-fat', resolve(palette.colors.fat));
  root.style.setProperty('--m-fiber', resolve(palette.colors.fiber));

  root.dataset.density = prefs.density;
}

/** Panel visible = user pref (or default) — caller must ALSO check the coach gate. */
export function isProgressPanelOn(prefs: AppearancePrefs, id: string): boolean {
  if (id in prefs.panels) return prefs.panels[id];
  return PROGRESS_PANELS.find((p) => p.id === id)?.defaultVisible ?? true;
}

/** Ordered panel defs per user prefs. */
export function orderedPanels(prefs: AppearancePrefs): ProgressPanelDef[] {
  const byId = new Map(PROGRESS_PANELS.map((p) => [p.id, p]));
  return prefs.panelOrder.map((id) => byId.get(id)).filter((p): p is ProgressPanelDef => !!p);
}
