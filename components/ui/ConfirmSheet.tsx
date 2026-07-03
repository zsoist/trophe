'use client';

import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/**
 * Shared glass confirmation bottom sheet — replaces native confirm()/alert().
 *
 * Framer bottom sheet on the z-sheet rung, with a danger variant (red confirm
 * button) and a loading state while the async action runs. Buttons are ≥44px
 * tall for touch.
 */

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  /** Optional supporting copy under the title. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon. */
  danger?: boolean;
  /** Disables both buttons and shows a spinner on confirm. */
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const reducedMotion = useReducedMotion();
  const { t } = useI18n();
  const confirmText = confirmLabel ?? t('confirm.confirm');
  const cancelText = cancelLabel ?? t('confirm.cancel');

  // Same portal pattern as FeedbackWidget: `open` is client state (false during
  // SSR), so the portal only ever renders in the browser.
  return (
    <AnimatePresence>
      {open && typeof document !== 'undefined' && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[var(--z-sheet,50)] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={loading ? undefined : onCancel}
        >
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden safe-bottom"
            style={{
              background: 'var(--bg-card-elevated, rgba(30,30,30,0.9))',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
            }}
          >
            <div className="px-5 pt-5 pb-4">
              {/* Handle */}
              <div
                className="sm:hidden"
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--line-2, rgba(255,255,255,0.10))',
                  margin: '-6px auto 14px',
                }}
              />

              <div className="flex items-start gap-3 mb-4">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: danger ? 'rgba(232,122,110,.12)' : 'rgba(212,168,83,.12)',
                    border: `1px solid ${danger ? 'rgba(232,122,110,.3)' : 'rgba(212,168,83,.3)'}`,
                  }}
                >
                  <AlertTriangle
                    size={16}
                    style={{ color: danger ? 'var(--err,#E87A6E)' : 'var(--gold-300,#D4A853)' }}
                  />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-sm font-semibold" style={{ color: 'var(--t1,#FAFAF9)' }}>
                    {title}
                  </div>
                  {message && (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--t3,#A8A29E)' }}>
                      {message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={loading}
                  className="btn-ghost flex-1"
                  style={{ minHeight: 44, fontSize: 13, padding: '10px 16px' }}
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={() => void onConfirm()}
                  disabled={loading}
                  className="flex-1 font-semibold rounded-xl transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{
                    minHeight: 44,
                    fontSize: 13,
                    padding: '10px 16px',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: danger
                      ? 'linear-gradient(135deg, #C0564B, var(--err,#E87A6E))'
                      : 'linear-gradient(135deg, var(--color-gold-dark,#B8923E), var(--color-gold,#D4A853))',
                    color: danger ? '#FFF' : '#0a0a0a',
                  }}
                >
                  {loading && (
                    <span
                      aria-hidden
                      className="animate-spin inline-block"
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: '50%',
                        border: '2px solid currentColor',
                        borderTopColor: 'transparent',
                      }}
                    />
                  )}
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>,
        document.body,
      )}
    </AnimatePresence>
  );
}

export default ConfirmSheet;
