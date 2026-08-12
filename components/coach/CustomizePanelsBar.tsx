'use client';

/**
 * Trophē — the "Customize" control for panel display-prefs (Task 1.3).
 *
 * Renders a gear button in page headers; in edit mode it becomes a
 * "Reset to essentials" + "Done" pair. Pure presentation — the owning page
 * holds edit-mode state and persistence (profiles.display_prefs).
 */

import { SlidersHorizontal, Check, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function CustomizePanelsBar({
  editMode,
  onToggleEdit,
  onReset,
}: {
  editMode: boolean;
  /** Enter edit mode (from gear) or leave it (from Done). */
  onToggleEdit: () => void;
  /** Clear all stored overrides back to the Essential preset. */
  onReset: () => void;
}) {
  const { t } = useI18n();

  if (!editMode) {
    return (
      <button
        type="button"
        onClick={onToggleEdit}
        title={t('coach.customize.title')}
        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-[44px] min-w-[44px] -my-2 flex items-center justify-center gap-1 text-xs text-[var(--content-muted)] hover:text-[#D4A853] transition-colors"
      >
        <SlidersHorizontal size={15} />
        <span className="hidden sm:inline">{t('coach.customize.button')}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onReset}
        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-[44px] flex items-center gap-1 px-2.5 text-xs text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors"
        title={t('coach.customize.reset')}
      >
        <RotateCcw size={13} />
        {t('coach.customize.reset')}
      </button>
      <button
        type="button"
        onClick={onToggleEdit}
        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold !py-1.5 !px-3 text-xs flex items-center gap-1"
      >
        <Check size={13} />
        {t('coach.customize.done')}
      </button>
    </div>
  );
}
