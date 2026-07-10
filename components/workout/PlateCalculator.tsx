'use client';

/**
 * Plate calculator bottom-sheet (Strong-style) — greedy per-side breakdown
 * for barbell lifts, plus a 40/60/80% warm-up ramp. Pure UI; weights arrive
 * in kg (storage unit) and render in the user's display unit.
 */

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { kgToDisplay, type WeightUnit } from '@/lib/workout/units';

/** Standard bar + plate sets per unit (values in the DISPLAY unit). */
const RACKS: Record<WeightUnit, { bar: number; plates: number[] }> = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};

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
  const total = kgToDisplay(weightKg, unit);
  const breakdown = platesPerSide(total, unit);
  const { bar } = RACKS[unit];
  const ramp = warmupRamp(weightKg, unit);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="glass-elevated w-full max-w-md rounded-t-3xl px-5 pt-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--t1)' }}>{t('workout.plate_title')}</h3>
          <button onClick={onClose} aria-label={t('workout.custom_cancel')} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={16} style={{ color: 'var(--t3)' }} />
          </button>
        </div>

        {/* Target */}
        <div className="text-center mb-4">
          <span className="text-3xl font-extrabold tabular-nums" style={{ color: 'var(--accent, #D4A853)', fontFamily: 'var(--font-mono)' }}>
            {total}
          </span>
          <span className="text-sm ml-1" style={{ color: 'var(--t4)' }}>{unit}</span>
          <p className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>
            {t('workout.plate_bar')}: {bar} {unit}
          </p>
        </div>

        {breakdown === null ? (
          <p className="text-center text-xs py-4" style={{ color: 'var(--t4)' }}>{t('workout.plate_below_bar')}</p>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--t4)' }}>
              {t('workout.plate_per_side')}
            </p>
            {breakdown.length === 0 ? (
              <p className="text-xs pb-3" style={{ color: 'var(--t3)' }}>{t('workout.plate_bar_only')}</p>
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
                          fontSize: 10,
                          background: 'color-mix(in srgb, var(--accent, #D4A853) 16%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--accent, #D4A853) 38%, transparent)',
                          color: 'var(--accent, #D4A853)',
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
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--t4)' }}>
          {t('workout.warmup_title')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ramp.map((r) => (
            <div key={r.pct} className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[10px] font-semibold" style={{ color: 'var(--t4)' }}>{r.pct}%</div>
              <div className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>
                {r.display}{unit}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--t4)' }}>× {r.reps}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
