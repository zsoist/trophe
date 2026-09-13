'use client';

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import './workout-session-premium.css';

export interface FinishWorkoutSummary {
  durationMinutes: number;
  completedSets: number;
  pendingSets: number;
  painNotes: number;
  prs: number;
}

/**
 * Why the primary action is unavailable. `loading`/`pending` resolve on their
 * own; `failed`/`recovery` need the caller's retry affordance.
 */
export type FinishBlockedReason = 'loading' | 'pending' | 'failed' | 'recovery';

interface FinishWorkoutDialogProps {
  summary: FinishWorkoutSummary;
  saving?: boolean;
  blocked?: boolean;
  blockedReason?: FinishBlockedReason | null;
  onRetry?: () => void;
  error?: boolean;
  isEmpty?: boolean;
  onKeepTraining(): void;
  onSaveAndFinish(): void;
  onDiscardEmpty?: () => void;
}

const focusable = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function FinishWorkoutDialog({ summary, saving = false, blocked = false, blockedReason = null, onRetry, error = false, isEmpty, onKeepTraining, onSaveAndFinish, onDiscardEmpty }: FinishWorkoutDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onKeepTrainingRef = useRef(onKeepTraining);
  const savingRef = useRef(saving);
  const empty = isEmpty ?? (summary.durationMinutes === 0 && summary.completedSets === 0 && summary.pendingSets === 0);

  // Native document listeners can fire after commit but before passive effects.
  // A layout effect updates the listener inputs before an ancestor layout
  // effect (or the browser) can dispatch Escape for this commit.
  useLayoutEffect(() => {
    onKeepTrainingRef.current = onKeepTraining;
    savingRef.current = saving;
  }, [onKeepTraining, saving]);

  // Mount-only: the parent re-renders every rest-timer tick with a fresh
  // onKeepTraining identity, so focus capture/restore must not follow props.
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !savingRef.current) onKeepTrainingRef.current(); };
    document.addEventListener('keydown', escape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', escape); previousFocus?.focus(); };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusable));
    const first = items[0]; const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center bg-[var(--scrim)] px-4 backdrop-blur-sm sm:items-center" onClick={() => { if (!saving) onKeepTraining(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="finish-workout-title" tabIndex={-1} onKeyDown={trapFocus} onClick={(event) => event.stopPropagation()} className="wsp-sheet safe-bottom w-full max-w-md outline-none">
        <div className="wsp-sheet__inner pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h2 id="finish-workout-title" className="text-xl font-bold text-[var(--content-primary)]">{t('workout.finish_question')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="wsp-sheet__stat p-3"><dt>{t('workout.finish_duration', { n: summary.durationMinutes })}</dt></div>
            <div className="wsp-sheet__stat p-3"><dt>{t('workout.finish_completed_sets', { n: summary.completedSets })}</dt></div>
            <div className="wsp-sheet__stat p-3"><dt>{t('workout.finish_pending_sets', { n: summary.pendingSets })}</dt></div>
            <div className="wsp-sheet__stat p-3"><dt>{t('workout.finish_pain_notes', { n: summary.painNotes })}</dt></div>
            <div className="wsp-sheet__stat col-span-2 p-3"><dt>{t('workout.finish_prs', { n: summary.prs })}</dt></div>
          </dl>
          {error ? <p role="alert" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]"><AlertTriangle size={16} aria-hidden="true" />{t('workout.save_failed')}</p> : null}
          {blocked && blockedReason ? (
            <p role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-sm text-[var(--content-primary)]">
              <span>{t(`workout.finish_blocked_${blockedReason}`)}</span>
              {(blockedReason === 'failed' || blockedReason === 'recovery') && onRetry
                ? <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-[var(--status-warning-fg)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">{t('workout.retry_recovery')}</button>
                : null}
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            {empty ? (
              <button type="button" disabled={saving || blocked} onClick={onDiscardEmpty} className="min-h-12 w-full rounded-xl bg-[var(--status-danger-bg)] px-4 font-semibold text-[var(--status-danger-fg)] disabled:opacity-50">{saving ? t('workout.saving') : t('workout.discard_empty')}</button>
            ) : (
              <button type="button" disabled={saving || blocked} onClick={onSaveAndFinish} className="btn-gold wsp-action w-full px-4 disabled:opacity-50"><span>{saving ? t('workout.saving') : t('workout.save_and_finish')}</span><span className="wsp-disc" aria-hidden="true">{saving ? <Loader2 className="wsp-spin" size={18} /> : <Check size={18} />}</span></button>
            )}
            <button type="button" disabled={saving} onClick={onKeepTraining} className="btn-ghost min-h-12 w-full rounded-xl px-4 disabled:opacity-50">{t('workout.keep_training')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
