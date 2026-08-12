'use client';

import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from './Button';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmText = confirmLabel ?? t('confirm.confirm');
  const cancelText = cancelLabel ?? t('confirm.cancel');

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !loading) {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableElements = getFocusableElements(dialog);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const shouldWrapBackward = event.shiftKey && (activeElement === first || activeElement === dialog);
    const shouldWrapForward = !event.shiftKey && (activeElement === last || activeElement === dialog);

    if (shouldWrapBackward) {
      event.preventDefault();
      last.focus();
    } else if (shouldWrapForward) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!open) return;

    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(animationFrame);
      const activeElement = returnFocusRef.current;
      activeElement?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  // Same portal pattern as FeedbackWidget: `open` is client state (false during
  // SSR), so the portal only ever renders in the browser.
  return (
    <AnimatePresence>
      {open && typeof document !== 'undefined' && createPortal(
        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          className="fixed inset-0 z-[var(--z-sheet,50)] flex items-end sm:items-center justify-center bg-[var(--canvas)]/80 backdrop-blur-sm"
          onClick={loading ? undefined : onCancel}
        >
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onDialogKeyDown}
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={message ? descriptionId : undefined}
            tabIndex={-1}
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden safe-bottom"
            style={{
              background: 'var(--surface-overlay)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-high)',
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
                  background: 'var(--border-default)',
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
                    background: danger ? 'var(--status-danger-bg)' : 'var(--action-secondary)',
                    border: `1px solid ${danger ? 'var(--status-danger-border)' : 'var(--border-focus)'}`,
                  }}
                >
                  <AlertTriangle
                    size={16}
                    style={{ color: danger ? 'var(--status-danger-fg)' : 'var(--action-primary)' }}
                  />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div id={titleId} className="text-sm font-semibold text-[var(--content-primary)]">
                    {title}
                  </div>
                  {message && (
                    <p id={descriptionId} className="text-xs mt-1 leading-relaxed text-[var(--content-muted)]">
                      {message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={onCancel}
                  disabled={loading}
                  className="flex-1 text-[13px]"
                >
                  {cancelText}
                </Button>
                <Button
                  variant={danger ? 'danger' : 'primary'}
                  onClick={() => void onConfirm()}
                  disabled={loading}
                  className="flex-1 gap-2 text-[13px]"
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
                </Button>
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
