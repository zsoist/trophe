'use client';

/**
 * Pain flag modal — shared by the freestyle logger (app/dashboard/workout/page.tsx)
 * and guided mode (components/workout/GuidedSession.tsx).
 * Extracted unchanged from the workout page during the guided-training rebuild.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { PainFlag } from '@/lib/types';

export default function PainFlagModal({
  exerciseId,
  onSave,
  onClose,
}: {
  exerciseId: string;
  onSave: (flag: PainFlag) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [bodyPart, setBodyPart] = useState('');
  const [severity, setSeverity] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('painflag.title')}
        tabIndex={-1}
        initial={reducedMotion ? false : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reducedMotion ? undefined : { scale: 0.9, opacity: 0 }}
        className="glass-elevated safe-bottom p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] w-full max-w-sm outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-red-400" />
          <h3 className="text-lg font-semibold">{t('painflag.title')}</h3>
        </div>

        <input
          type="text"
          placeholder={t('painflag.body_part_placeholder')}
          value={bodyPart}
          onChange={(e) => setBodyPart(e.target.value)}
          className="input-dark mb-3 text-base"
        />

        <div className="mb-3">
          <label className="text-sm text-[var(--content-secondary)] mb-1 block">
            {t('painflag.severity_prefix')}: {severity}/5
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                style={{
                  background: severity >= s
                    ? `rgba(239, 68, 68, ${0.2 + s * 0.15})`
                    : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                  color: severity >= s ? 'var(--status-danger-fg)' : 'var(--content-muted)',
                  border: severity >= s
                    ? '1px solid rgba(239,68,68,0.3)'
                    : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <textarea
          placeholder={t('painflag.notes_placeholder')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input-dark mb-4 h-16 resize-none text-base"
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {t('painflag.cancel')}
          </button>
          <button
            onClick={() => {
              if (!bodyPart.trim()) return;
              onSave({
                exercise_id: exerciseId,
                body_part: bodyPart.trim(),
                severity,
                notes: notes.trim() || undefined,
              });
              onClose();
            }}
            className="flex-1 py-2 rounded-xl text-sm font-semibold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{
              background: 'var(--status-danger-bg)',
              color: 'var(--status-danger-fg)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            {t('painflag.save')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
