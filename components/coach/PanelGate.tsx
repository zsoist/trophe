'use client';

/**
 * Trophē — display-prefs panel gating (Michael: "too many features").
 *
 * `PanelPrefsProvider` + `<Panel>` implement the Customize mode for coach
 * surfaces. Panel ids are canonical in lib/display-prefs.ts.
 *
 * Behavior:
 *   - Normal mode: hidden panels render NOTHING (children returned raw when
 *     visible — no wrapper, so page layout/margins are untouched).
 *   - Edit mode: ALL registered panels render, wrapped in a dashed outline
 *     with a title chip + Eye/EyeOff toggle (precedent: AI-memory block
 *     visibility toggles in app/coach/client/[id]/memory/page.tsx). Hidden
 *     panels show at reduced opacity. Content is inert (pointer-events-none)
 *     so the only interaction in edit mode is toggling.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface PanelPrefsValue {
  /** Stored overrides only — defaults live in lib/display-prefs.ts. */
  prefs: Partial<Record<string, boolean>>;
  editMode: boolean;
  toggle: (id: string) => void;
  visible: (id: string) => boolean;
}

const PanelPrefsContext = createContext<PanelPrefsValue | null>(null);

export function PanelPrefsProvider({
  value,
  children,
}: {
  value: PanelPrefsValue;
  children: ReactNode;
}) {
  return <PanelPrefsContext.Provider value={value}>{children}</PanelPrefsContext.Provider>;
}

export function usePanelPrefs(): PanelPrefsValue {
  const ctx = useContext(PanelPrefsContext);
  if (!ctx) throw new Error('usePanelPrefs must be used inside PanelPrefsProvider');
  return ctx;
}

export function Panel({
  id,
  title,
  children,
}: {
  /** Canonical panel id from lib/display-prefs.ts registries. */
  id: string;
  /** Human label shown on the edit-mode chip. */
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { editMode, toggle, visible } = usePanelPrefs();
  const on = visible(id);

  if (!editMode) {
    return on ? <>{children}</> : null;
  }

  return (
    <div
      className={`relative rounded-2xl border border-dashed p-1.5 mb-4 transition-colors ${
        on ? 'border-[#D4A853]/40' : 'border-white/15'
      }`}
    >
      <button
        type="button"
        onClick={() => toggle(id)}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
        aria-pressed={on}
        title={on ? t('coach.customize.shownTapToHide') : t('coach.customize.hiddenTapToShow')}
      >
        <span
          className={`text-xs font-semibold tracking-wide ${
            on ? 'text-[#D4A853]' : 'text-stone-500'
          }`}
        >
          {title}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${
            on ? 'text-[#D4A853]' : 'text-stone-500'
          }`}
        >
          {on ? t('coach.customize.shown') : t('coach.customize.hidden')}
          {on ? <Eye size={14} /> : <EyeOff size={14} />}
        </span>
      </button>
      <div
        aria-hidden={!on}
        className={`mt-1.5 pointer-events-none select-none ${on ? '' : 'opacity-30'}`}
      >
        {children}
      </div>
    </div>
  );
}
