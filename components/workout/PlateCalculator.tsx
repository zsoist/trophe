'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { buildWarmupRamp, calculatePlateLoad, type WarmupSet } from '@/lib/workout/plates';
import { kgToDisplay, type WeightUnit } from '@/lib/workout/units';

const RACKS: Record<WeightUnit, { bar: number; plates: number[] }> = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export type PlateExerciseContext = { exerciseId: string; mode: 'draft' | 'live' };
const noop = () => undefined;

function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function parseInventory(value: string): number[] { return value.split(';').map((token) => Number(token.trim().replace(',', '.'))).filter((plate) => Number.isFinite(plate) && plate > 0).slice(0, 12); }
function inputNumber(value: string, max: number): number { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0; }

export default function PlateCalculator({ weightKg, unit, onClose = noop, exerciseContext, onAddWarmupSets }: {
  weightKg: number;
  unit: WeightUnit;
  onClose?: () => void;
  exerciseContext?: PlateExerciseContext;
  onAddWarmupSets?: (sets: WarmupSet[], context: PlateExerciseContext) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const defaults = RACKS[unit];
  const [totalText, setTotalText] = useState(() => String(kgToDisplay(weightKg, unit)));
  const [barText, setBarText] = useState(() => String(defaults.bar));
  const [inventoryText, setInventoryText] = useState(() => defaults.plates.join('; '));
  const [addingWarmups, setAddingWarmups] = useState(false);
  const addingRef = useRef(false);
  const [warmupError, setWarmupError] = useState(false);
  useEffect(() => { onCloseRef.current = onClose; addingRef.current = addingWarmups; });
  const total = inputNumber(totalText, 2000);
  const bar = inputNumber(barText, 100);
  const plates = useMemo(() => parseInventory(inventoryText), [inventoryText]);
  const load = useMemo(() => calculatePlateLoad({ total, bar, plates }), [total, bar, plates]);
  const warmupRamp = useMemo(() => buildWarmupRamp({ workingWeight: total, bar, plates, unit }), [total, bar, plates, unit]);
  const canInsertWarmups = Boolean(exerciseContext && onAddWarmupSets);
  const impossible = total < bar || load.achievedTotal <= 0;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && !addingRef.current && onCloseRef.current();
    document.addEventListener('keydown', closeOnEscape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', closeOnEscape); previousFocus?.focus(); };
  }, []);

  const totalLabel = `${t('workout.plate_total_label')} (${unit})`;
  const barLabel = `${t('workout.plate_bar_label')} (${unit})`;
  const addWarmups = async () => {
    if (!exerciseContext || !onAddWarmupSets || addingWarmups || warmupRamp.length === 0) return;
    setAddingWarmups(true); setWarmupError(false);
    try { if (!(await onAddWarmupSets(warmupRamp, exerciseContext))) setWarmupError(true); } catch { setWarmupError(true); } finally { setAddingWarmups(false); }
  };

  const stack = (side: 'left' | 'right') => (
    <section aria-label={side === 'left' ? t('workout.plate_left_side') : t('workout.plate_right_side')} className="min-w-0 flex-1 rounded-xl bg-[var(--surface-subtle)] p-3">
      <h4 className="text-xs font-semibold text-[var(--content-secondary)]">{side === 'left' ? t('workout.plate_left_side') : t('workout.plate_right_side')}</h4>
      <div className="mt-2 flex min-h-16 items-end justify-center gap-1">
        {load.perSide.map((plate, index) => <div key={`${side}-${plate}-${index}`} className="flex w-7 items-center justify-center rounded-sm border border-[var(--action-primary)] bg-[var(--surface-raised)] px-0.5 font-mono text-xs font-bold tabular-nums text-[var(--content-primary)]" style={{ height: Math.max(34, Math.min(82, plate * (unit === 'lb' ? 1.6 : 3.2))) }}>{plate}</div>)}
        {!load.perSide.length ? <span className="text-xs text-[var(--content-muted)]">—</span> : null}
      </div>
    </section>
  );

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reducedMotion ? undefined : { opacity: 0 }} className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm" onClick={() => { if (!addingWarmups) onCloseRef.current(); }}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('workout.plate_title')} tabIndex={-1} onKeyDown={(event) => trapFocus(event, dialogRef.current)} initial={reducedMotion ? false : { y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reducedMotion ? undefined : { y: 24, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }} className="workout-workspace workout-dialog glass-elevated max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-2xl px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div><h3 className="text-base font-bold text-[var(--content-primary)]">{t('workout.plate_title')}</h3><p className="mt-0.5 text-xs text-[var(--content-secondary)]">{t('workout.plate_job')}</p></div>
          <button type="button" disabled={addingWarmups} onClick={() => onCloseRef.current()} aria-label={t('workout.custom_cancel')} className="min-h-11 min-w-11 rounded-lg bg-[var(--surface-subtle)] p-1.5 text-[var(--content-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"><X size={16} aria-hidden="true" /></button>
        </div>
        <section aria-label={t('workout.plate_total_label')}>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-[var(--content-secondary)]">{totalLabel}<input disabled={addingWarmups} aria-label={totalLabel} type="text" inputMode="decimal" value={totalText} onChange={(event) => setTotalText(event.target.value)} className="input-dark mt-1 min-h-11 w-full font-mono text-base tabular-nums disabled:opacity-50" /></label>
          <label className="text-xs font-semibold text-[var(--content-secondary)]">{barLabel}<input disabled={addingWarmups} aria-label={barLabel} type="text" inputMode="decimal" value={barText} onChange={(event) => setBarText(event.target.value)} className="input-dark mt-1 min-h-11 w-full font-mono text-base tabular-nums disabled:opacity-50" /></label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-[var(--content-secondary)]">{t('workout.plate_inventory_label')}<input disabled={addingWarmups} aria-label={t('workout.plate_inventory_label')} value={inventoryText} onChange={(event) => setInventoryText(event.target.value)} className="input-dark mt-1 min-h-11 w-full font-mono text-base tabular-nums disabled:opacity-50" /></label>
        <p className="mt-1 text-xs text-[var(--content-muted)]">{t('workout.plate_inventory_help')}</p>
        </section>
        <section className="mt-4 border-y border-[var(--border-subtle)] py-4" aria-labelledby="plate-result-title">
          <h4 id="plate-result-title" className="text-sm font-semibold text-[var(--content-primary)]">{impossible ? t('workout.plate_impossible') : load.exact ? t('workout.plate_exact') : t('workout.plate_nearest')}</h4>
          <output aria-live="polite" className="mt-1 block font-mono text-sm tabular-nums text-[var(--content-secondary)]">{total} − {bar} = {Math.max(0, total - bar)} {unit} · {t('workout.plate_per_side')}: {impossible ? '—' : `${load.achievedTotal} ${unit}`}</output>
          <div className="mt-3 flex gap-3">{stack('left')}{stack('right')}</div>
        </section>
        <section className="mt-5" aria-labelledby="warmup-title">
          <h4 id="warmup-title" className="text-sm font-semibold text-[var(--content-primary)]">{t('workout.warmup_title')}</h4>
          <p className="mt-1 text-xs text-[var(--content-muted)]">{t('workout.warmup_explanation')}</p>
          {warmupRamp.length ? <div className="mt-2 grid grid-cols-3 gap-2">{warmupRamp.map((set) => <div key={set.percentage} className="rounded-xl bg-[var(--surface-subtle)] p-2 text-center"><div className="font-mono text-xs font-semibold tabular-nums text-[var(--content-secondary)]">{set.achievedPercentage}%</div><div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--content-primary)]">{set.weight} {unit}</div><div className="font-mono text-xs tabular-nums text-[var(--content-muted)]">× {set.reps}</div></div>)}</div> : <p className="mt-2 text-xs text-[var(--content-muted)]">{t('workout.warmup_no_ramp')}</p>}
          {canInsertWarmups ? <button type="button" disabled={addingWarmups || warmupRamp.length === 0} onClick={() => void addWarmups()} className="btn-ghost mt-3 min-h-11 w-full rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{addingWarmups ? t('workout.add_warmup_sets_saving') : t('workout.add_warmup_sets')}</button> : null}
          {warmupError ? <p role="alert" className="mt-2 text-xs text-[var(--status-danger-fg)]">{t('workout.add_warmup_sets_failed')}</p> : null}
        </section>
        <button type="button" disabled={addingWarmups} onClick={() => onCloseRef.current()} className="btn-ghost mt-5 min-h-11 w-full rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{t('workout.custom_cancel')}</button>
      </motion.div>
    </motion.div>
  );
}
