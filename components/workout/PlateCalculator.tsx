'use client';

/**
 * Plate calculator bottom-sheet (Strong-style) — greedy per-side breakdown
 * for barbell lifts, plus a 40/60/80% warm-up ramp. Pure UI; weights arrive
 * in kg (storage unit) and render in the user's display unit.
 */

import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { kgToDisplay, type WeightUnit } from '@/lib/workout/units';

/** Standard bar + plate sets per unit (values in the DISPLAY unit). */
const RACKS: Record<WeightUnit, { bar: number; plates: number[] }> = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};

const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/** Greedy per-side plate breakdown in the display unit. */
export function platesPerSide(totalDisplay: number, unit: WeightUnit): { plate: number; count: number }[] | null {
  const { bar, plates } = RACKS[unit];
  if (totalDisplay < bar) return null;
  let perSide = (totalDisplay - bar) / 2;
  const out: { plate: number; count: number }[] = [];
  for (const p of plates) {
    const n = Math.floor((perSide + 1e-9) / p);
    if (n > 0) {
      out.push({ plate: p, count: n });
      perSide -= n * p;
    }
  }
  return out;
}

/** Warm-up ramp: 40%×10, 60%×6, 80%×3 rounded to the smallest plate step. */
function warmupRamp(workKg: number, unit: WeightUnit): { pct: number; reps: number; display: number }[] {
  const step = unit === 'lb' ? 5 : 2.5;
  return [
    { pct: 40, reps: 10 },
    { pct: 60, reps: 6 },
    { pct: 80, reps: 3 },
  ].map(({ pct, reps }) => {
    const raw = kgToDisplay(workKg * (pct / 100), unit);
    return { pct, reps, display: Math.max(step, Math.round(raw / step) * step) };
  });
}

export default function PlateCalculator({
  weightKg,
  unit,
  onClose,
}: {
  weightKg: number;
  unit: WeightUnit;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const total = kgToDisplay(weightKg, unit);
  const breakdown = platesPerSide(total, unit);
  const { bar } = RACKS[unit];
  const ramp = warmupRamp(weightKg, unit);

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
      className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('workout.plate_title')}
        tabIndex={-1}
        onKeyDown={(event) => trapFocus(event, dialogRef.current)}
        initial={reducedMotion ? false : { y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reducedMotion ? undefined : { y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="glass-elevated safe-bottom w-full max-w-md rounded-t-3xl px-5 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--content-primary)' }}>{t('workout.plate_title')}</h3>
          <button onClick={onClose} aria-label={t('workout.custom_cancel')} className="p-1.5 rounded-lg min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
            <X size={16} style={{ color: 'var(--content-secondary)' }} />
          </button>
        </div>

        {/* Target */}
        <div className="text-center mb-4">
          <span className="text-3xl font-extrabold tabular-nums" style={{ color: 'var(--action-primary)', fontFamily: 'var(--font-mono)' }}>
            {total}
          </span>
          <span className="text-sm ml-1" style={{ color: 'var(--content-muted)' }}>{unit}</span>
          <p className="text-xs mt-1" style={{ color: 'var(--content-muted)' }}>
            {t('workout.plate_bar')}: {bar} {unit}
          </p>
        </div>

        {breakdown === null ? (
          <p className="text-center text-xs py-4" style={{ color: 'var(--content-muted)' }}>{t('workout.plate_below_bar')}</p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--content-muted)' }}>
              {t('workout.plate_per_side')}
            </p>
            {breakdown.length === 0 ? (
              <p className="text-xs pb-3" style={{ color: 'var(--content-secondary)' }}>{t('workout.plate_bar_only')}</p>
            ) : (
              <div className="flex items-end gap-1.5 justify-center pb-4">
                {breakdown.flatMap(({ plate, count }) =>
                  Array.from({ length: count }, (_, i) => (
                    <div key={`${plate}-${i}`} className="flex flex-col items-center gap-1">
                      <div
                        className="rounded-md flex items-center justify-center font-bold tabular-nums"
                        style={{
                          width: 30,
                          height: Math.max(34, Math.min(88, plate * (unit === 'lb' ? 1.6 : 3.2))),
                          fontSize: 12,
                          background: 'color-mix(in srgb, var(--action-primary) 16%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--action-primary) 38%, transparent)',
                          color: 'var(--action-primary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {plate}
                      </div>
                    </div>
                  )),
                )}
              </div>
            )}
          </>
        )}

        {/* Warm-up ramp */}
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--content-muted)' }}>
          {t('workout.warmup_title')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ramp.map((r) => (
            <div key={r.pct} className="rounded-xl p-2.5 text-center" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--content-muted)' }}>{r.pct}%</div>
              <div className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--content-primary)', fontFamily: 'var(--font-mono)' }}>
                {r.display}{unit}
              </div>
              <div className="text-xs" style={{ color: 'var(--content-muted)' }}>× {r.reps}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
